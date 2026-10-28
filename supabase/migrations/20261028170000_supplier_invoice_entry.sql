/* Saisie de facture fournisseur (écran « Facture fournisseur — saisie
   intelligente ») : enregistrement atomique en-tête + lignes, en brouillon
   ou validé.

   Un brouillon :
     - porte le statut 'draft' et un montant nul, pour ne peser ni sur le
       tableau de bord ni sur les encours ;
     - est exclu des dettes fournisseurs (vue ci-dessous) ;
     - peut être repris et réenregistré autant de fois que nécessaire : ses
       lignes sont alors remplacées en bloc.

   `amount` garde son sens historique (total HT net, cf. 20261002090000) ;
   le TTC se lit dans invoice_totals_view et supplier_debts_view. */

create or replace function public.save_supplier_invoice(
  p_invoice_id integer,
  p_header jsonb,
  p_lines jsonb,
  p_draft boolean
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_lab int;
  v_id int;
  v_number text;
  v_year text;
  v_next int;
  v_supplier int := nullif(p_header ->> 'supplier_id', '')::int;
  v_issue date := nullif(p_header ->> 'issue_date', '')::date;
  v_terms int := nullif(p_header ->> 'payment_terms_days', '')::int;
  v_order int := nullif(p_header ->> 'order_id', '')::int;
  v_stamp numeric := coalesce(nullif(p_header ->> 'stamp_duty', '')::numeric, 0);
  v_supplier_number text := nullif(trim(coalesce(p_header ->> 'supplier_number', '')), '');
  v_due date;
  v_status text;
  v_line record;
  v_description text;
  v_count int := 0;
  v_net numeric := 0;
begin
  v_lab := public.assert_lab_context();

  if v_supplier is null or not exists (select 1 from suppliers where id = v_supplier) then
    raise exception 'Fournisseur introuvable';
  end if;
  if v_issue is null then
    raise exception 'La date de facture est obligatoire';
  end if;
  if v_terms is not null and v_terms < 0 then
    raise exception 'Conditions de paiement invalides';
  end if;
  if v_stamp < 0 then
    raise exception 'Le timbre fiscal ne peut pas être négatif';
  end if;
  if v_order is not null and not exists (
    select 1 from purchase_orders where id = v_order and supplier_id = v_supplier
  ) then
    raise exception 'Le bon de commande ne correspond pas à ce fournisseur';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' then
    raise exception 'Lignes de facture invalides';
  end if;
  if not p_draft and jsonb_array_length(p_lines) = 0 then
    raise exception 'Ajoutez au moins une ligne à la facture';
  end if;
  if not p_draft and v_supplier_number is null then
    raise exception 'Le numéro de facture fournisseur est obligatoire';
  end if;

  v_due := v_issue + coalesce(v_terms, 0);
  v_status := case
    when p_draft then 'draft'
    when v_due < current_date then 'overdue'
    else 'pending'
  end;

  if p_invoice_id is not null then
    select id, number into v_id, v_number
    from invoices
    where id = p_invoice_id and status = 'draft'
    for update;
    if not found then
      raise exception 'Brouillon introuvable ou déjà validé';
    end if;

    update invoices set
      supplier_id        = v_supplier,
      supplier_number    = v_supplier_number,
      issue_date         = v_issue,
      due_date           = v_due,
      order_id           = v_order,
      payment_terms_days = v_terms,
      stamp_duty         = v_stamp,
      ocr_confidence     = nullif(p_header ->> 'ocr_confidence', '')::numeric,
      document_path      = coalesce(nullif(p_header ->> 'document_path', ''), document_path),
      document_name      = coalesce(nullif(p_header ->> 'document_name', ''), document_name),
      document_size      = coalesce(nullif(p_header ->> 'document_size', '')::int, document_size),
      status             = v_status
    where id = v_id;

    delete from invoice_lines where invoice_id = v_id;
  else
    -- Même numérotation que create_invoice() : FAC-<année>-<n>.
    perform pg_advisory_xact_lock(hashtext('invoice_number'), v_lab);

    v_year := to_char(v_issue, 'YYYY');
    select coalesce(max((regexp_match(number, '^FAC-' || v_year || '-(\d+)$'))[1]::int), 0) + 1
    into v_next
    from invoices
    where number like 'FAC-' || v_year || '-%';
    v_number := 'FAC-' || v_year || '-' || lpad(v_next::text, 4, '0');

    insert into invoices (
      number, supplier_id, supplier_number, amount, status, issue_date,
      due_date, order_id, payment_terms_days, stamp_duty,
      ocr_confidence, document_path, document_name, document_size
    )
    values (
      v_number, v_supplier, v_supplier_number, 0, v_status, v_issue,
      v_due, v_order, v_terms, v_stamp,
      nullif(p_header ->> 'ocr_confidence', '')::numeric,
      nullif(p_header ->> 'document_path', ''),
      nullif(p_header ->> 'document_name', ''),
      nullif(p_header ->> 'document_size', '')::int
    )
    returning id into v_id;
  end if;

  for v_line in
    select nullif(o ->> 'product_id', '')::int                          as product_id,
           nullif(trim(coalesce(o ->> 'description', '')), '')          as description,
           nullif(trim(coalesce(o ->> 'manufacturer_ref', '')), '')     as manufacturer_ref,
           (o ->> 'quantity')::int                                      as quantity,
           (o ->> 'unit_price')::numeric                                as unit_price,
           coalesce(nullif(o ->> 'discount_pct', '')::numeric, 0)       as discount_pct,
           coalesce(nullif(o ->> 'vat_rate', '')::numeric, 0)           as vat_rate,
           coalesce(nullif(o ->> 'match_status', ''), 'matched')        as match_status
    from jsonb_array_elements(p_lines) o
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantité invalide sur une ligne de facture';
    end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then
      raise exception 'Prix unitaire invalide sur une ligne de facture';
    end if;
    if v_line.discount_pct < 0 or v_line.discount_pct > 100 then
      raise exception 'Remise invalide sur une ligne de facture';
    end if;

    if v_line.product_id is not null then
      select coalesce(v_line.description, name) into v_description
      from products where id = v_line.product_id;
      if not found then
        raise exception 'Article introuvable : %', v_line.product_id;
      end if;
    else
      if v_line.description is null then
        raise exception 'Une ligne sans article doit avoir une désignation';
      end if;
      v_description := v_line.description;
    end if;

    insert into invoice_lines (
      invoice_id, product_id, description, quantity, unit_price,
      discount_pct, vat_rate, manufacturer_ref, match_status
    )
    values (
      v_id, v_line.product_id, v_description, v_line.quantity,
      round(v_line.unit_price, 3), v_line.discount_pct, v_line.vat_rate,
      v_line.manufacturer_ref,
      case
        when v_line.product_id is null and v_line.match_status <> 'manual' then 'new_product'
        else v_line.match_status
      end
    );

    v_count := v_count + 1;
    v_net := v_net + round(
      v_line.quantity * round(v_line.unit_price, 3) * (1 - v_line.discount_pct / 100), 3
    );
  end loop;

  update invoices set amount = case when p_draft then 0 else v_net end
  where id = v_id;

  return jsonb_build_object(
    'invoice_id', v_id,
    'number', v_number,
    'lines', v_count,
    'status', v_status
  );
end;
$function$;

grant execute on function public.save_supplier_invoice(integer, jsonb, jsonb, boolean) to authenticated;
revoke execute on function public.save_supplier_invoice(integer, jsonb, jsonb, boolean) from public, anon;

-- ---------------------------------------------------------------------------
-- Les brouillons ne sont pas des dettes
-- ---------------------------------------------------------------------------

/* Identique à 20261002120000, au filtre `status <> 'draft'` près. */
create or replace view supplier_debts_view with (security_invoker = true) as
with supplier_invoices as (
  select
    'supplier'::text        as source,
    i.id                    as invoice_id,
    i.lab_id,
    i.number,
    i.supplier_number       as external_number,
    s.name                  as creditor,
    i.supplier_id           as creditor_id,
    i.issue_date,
    i.due_date,
    i.payment_terms_days,
    i.expense_category,
    case
      when count(l.id) = 0 then i.amount
      else coalesce(sum(l.line_total_ht), 0)
           + coalesce(sum(l.line_vat), 0)
           + i.stamp_duty
    end                     as amount_due
  from invoices i
  join suppliers s on s.id = i.supplier_id
  left join invoice_lines l on l.invoice_id = i.id
  where i.status <> 'draft'
  group by i.id, i.lab_id, i.number, i.supplier_number, s.name,
           i.supplier_id, i.issue_date, i.due_date, i.payment_terms_days,
           i.expense_category, i.amount, i.stamp_duty
),
subcontractor as (
  select
    'subcontractor'::text   as source,
    i.id                    as invoice_id,
    i.lab_id,
    i.number,
    i.subcontractor_number  as external_number,
    c.name                  as creditor,
    i.subcontractor_id      as creditor_id,
    i.issue_date,
    i.due_date,
    i.payment_terms_days,
    i.expense_category,
    coalesce(sum(l.line_total_ht), 0)
      + coalesce(sum(l.line_vat), 0)
      + i.stamp_duty        as amount_due
  from subcontractor_invoices i
  join subcontractors c on c.id = i.subcontractor_id
  left join subcontractor_invoice_lines l on l.invoice_id = i.id
  group by i.id, i.lab_id, i.number, i.subcontractor_number, c.name,
           i.subcontractor_id, i.issue_date, i.due_date,
           i.payment_terms_days, i.expense_category, i.stamp_duty
),
all_invoices as (
  select * from supplier_invoices
  union all
  select * from subcontractor
),
settled as (
  select
    d.*,
    coalesce((
      select sum(p.amount) from supplier_payments p
      where p.reversed_at is null
        and ((d.source = 'supplier'      and p.invoice_id = d.invoice_id)
          or (d.source = 'subcontractor' and p.subcontractor_invoice_id = d.invoice_id))
    ), 0) as amount_paid
  from all_invoices d
)
select
  s.source,
  s.invoice_id,
  s.lab_id,
  s.number,
  s.external_number,
  s.creditor,
  s.creditor_id,
  s.issue_date,
  s.due_date,
  s.payment_terms_days,
  s.expense_category,
  s.amount_due,
  s.amount_paid,
  s.amount_due - s.amount_paid as balance,
  case when s.due_date is null then null
       else current_date - s.due_date
  end as days_late,
  public.debt_ageing_bucket(s.due_date, s.amount_due - s.amount_paid) as status
from settled s;

grant select on public.supplier_debts_view to authenticated;
