-- Les factures obtiennent un contenu : des lignes produit/quantité/prix.
-- Le montant d'une facture est la somme de ses lignes.

create table public.invoice_lines (
  id serial primary key,
  invoice_id integer not null references public.invoices (id) on delete cascade,
  -- Nullable : une ligne peut être libre (frais de port, prestation…).
  product_id integer references public.products (id),
  description text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  lab_id integer not null default public.current_lab_id()
    references public.laboratories (id)
);

create index invoice_lines_invoice_id_idx on public.invoice_lines (invoice_id);
create index invoice_lines_lab_id_idx on public.invoice_lines (lab_id);

alter table public.invoice_lines enable row level security;

create policy "lecture par laboratoire" on public.invoice_lines
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on public.invoice_lines
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on public.invoice_lines
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));
create policy "suppression par laboratoire" on public.invoice_lines
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

grant select, insert, update, delete on public.invoice_lines to authenticated;
grant usage, select on sequence public.invoice_lines_id_seq to authenticated;

-- Une facture mal saisie doit pouvoir être supprimée (les lignes suivent
-- par cascade).
grant delete on public.invoices to authenticated;
create policy "suppression par laboratoire" on public.invoices
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

-- Création atomique : en-tête + lignes, montant calculé depuis les lignes.
-- SECURITY INVOKER : le RLS par laboratoire s'applique.
create or replace function public.create_invoice(
  p_supplier_id integer,
  p_number text,
  p_issue_date date,
  p_due_date date,
  p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_invoice_id int;
  v_number text := trim(p_number);
  v_line record;
  v_product record;
  v_description text;
  v_count int := 0;
  v_total numeric := 0;
begin
  perform public.assert_lab_context();

  if v_number = '' then
    raise exception 'Le numéro de facture est obligatoire';
  end if;
  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Fournisseur introuvable : %', p_supplier_id;
  end if;
  if p_issue_date is null or p_due_date is null then
    raise exception 'Les dates d''émission et d''échéance sont obligatoires';
  end if;
  if p_due_date < p_issue_date then
    raise exception 'L''échéance ne peut pas précéder l''émission';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ajoutez au moins une ligne à la facture';
  end if;

  insert into invoices (number, supplier_id, amount, status, issue_date, due_date)
  values (v_number, p_supplier_id, 0, 'pending', p_issue_date, p_due_date)
  returning id into v_invoice_id;

  for v_line in
    select (o ->> 'product_id')::int as product_id,
           nullif(trim(coalesce(o ->> 'description', '')), '') as description,
           (o ->> 'quantity')::int as quantity,
           (o ->> 'unit_price')::numeric as unit_price
    from jsonb_array_elements(p_lines) o
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantité invalide sur une ligne de facture';
    end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then
      raise exception 'Prix unitaire invalide sur une ligne de facture';
    end if;

    if v_line.product_id is not null then
      select id, name into v_product from products where id = v_line.product_id;
      if not found then
        raise exception 'Produit introuvable : %', v_line.product_id;
      end if;
      v_description := coalesce(v_line.description, v_product.name);
    else
      if v_line.description is null then
        raise exception 'Une ligne libre doit avoir une description';
      end if;
      v_description := v_line.description;
    end if;

    insert into invoice_lines (invoice_id, product_id, description, quantity, unit_price)
    values (v_invoice_id, v_line.product_id, v_description,
            v_line.quantity, round(v_line.unit_price, 2));

    v_count := v_count + 1;
    v_total := v_total + round(v_line.quantity * round(v_line.unit_price, 2), 2);
  end loop;

  update invoices set amount = v_total where id = v_invoice_id;

  return jsonb_build_object(
    'invoice_id', v_invoice_id,
    'number', v_number,
    'lines', v_count,
    'amount', v_total
  );
end;
$function$;

grant execute on function public.create_invoice(integer, text, date, date, jsonb) to authenticated;
revoke execute on function public.create_invoice(integer, text, date, date, jsonb) from public, anon;
