-- Le numéro de facture est généré automatiquement : FAC-<année>-<n° suivant>,
-- séquence propre à chaque laboratoire et à chaque année.

drop function public.create_invoice(integer, text, date, date, jsonb);

create or replace function public.create_invoice(
  p_supplier_id integer,
  p_issue_date date,
  p_due_date date,
  p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_lab int;
  v_invoice_id int;
  v_number text;
  v_year text;
  v_next int;
  v_line record;
  v_product record;
  v_description text;
  v_count int := 0;
  v_total numeric := 0;
begin
  v_lab := public.assert_lab_context();

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

  -- Sérialise la numérotation du laboratoire : deux créations simultanées
  -- ne peuvent pas tirer le même numéro.
  perform pg_advisory_xact_lock(hashtext('invoice_number'), v_lab);

  v_year := to_char(p_issue_date, 'YYYY');
  select coalesce(max((regexp_match(number, '^FAC-' || v_year || '-(\d+)$'))[1]::int), 0) + 1
  into v_next
  from invoices
  where number like 'FAC-' || v_year || '-%';

  v_number := 'FAC-' || v_year || '-' || lpad(v_next::text, 4, '0');

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

grant execute on function public.create_invoice(integer, date, date, jsonb) to authenticated;
revoke execute on function public.create_invoice(integer, date, date, jsonb) from public, anon;
