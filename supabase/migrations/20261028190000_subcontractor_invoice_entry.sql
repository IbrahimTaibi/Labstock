/* Facture sous-traitant — écran de saisie.

   Le socle (20261002100000) posait les tables sans écran. Celui-ci ajoute
   l'enregistrement atomique en-tête + lignes, sur le modèle de
   save_supplier_invoice(). */

-- ---------------------------------------------------------------------------
-- lab_id par défaut
-- ---------------------------------------------------------------------------

/* Les tables créées après 20260730211315 n'avaient pas reçu le défaut
   current_lab_id() : sans lui, chaque insertion côté application devrait
   passer lab_id à la main. */
alter table subcontractors
  alter column lab_id set default public.current_lab_id();
alter table subcontractor_invoices
  alter column lab_id set default public.current_lab_id();
alter table subcontractor_invoice_lines
  alter column lab_id set default public.current_lab_id();

-- ---------------------------------------------------------------------------
-- Enregistrement
-- ---------------------------------------------------------------------------

/* Crée la facture (p_invoice_id null) ou la remplace entièrement. Les
   lignes sont réécrites : elles n'ont aucune existence propre (§6).

   Une facture déjà partiellement réglée peut être corrigée, mais pas
   au point que son total passe sous le montant déjà payé — la dette
   deviendrait négative. */
create or replace function public.save_subcontractor_invoice(
  p_invoice_id integer,
  p_header jsonb,
  p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_lab int;
  v_id int;
  v_number text;
  v_subcontractor int := nullif(p_header ->> 'subcontractor_id', '')::int;
  v_issue date := nullif(p_header ->> 'issue_date', '')::date;
  v_description text := nullif(trim(coalesce(p_header ->> 'description', '')), '');
  v_vat numeric := coalesce(nullif(p_header ->> 'default_vat_rate', '')::numeric, 0);
  v_stamp numeric := coalesce(nullif(p_header ->> 'stamp_duty', '')::numeric, 0);
  v_external text := nullif(trim(coalesce(p_header ->> 'subcontractor_number', '')), '');
  v_line record;
  v_count int := 0;
  v_due numeric;
  v_paid numeric;
begin
  v_lab := public.assert_lab_context();

  if v_subcontractor is null
     or not exists (select 1 from subcontractors where id = v_subcontractor) then
    raise exception 'Sous-traitant introuvable';
  end if;
  if v_issue is null then
    raise exception 'La date de facture est obligatoire';
  end if;
  if v_description is null then
    raise exception 'La description de la prestation est obligatoire';
  end if;
  if v_vat < 0 then
    raise exception 'Taux de TVA invalide';
  end if;
  if v_stamp < 0 then
    raise exception 'Le timbre fiscal ne peut pas être négatif';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ajoutez au moins une ligne de prestation';
  end if;

  if p_invoice_id is not null then
    select id, number into v_id, v_number
    from subcontractor_invoices
    where id = p_invoice_id
    for update;
    if not found then
      raise exception 'Facture sous-traitant introuvable';
    end if;

    update subcontractor_invoices set
      subcontractor_id     = v_subcontractor,
      subcontractor_number = v_external,
      issue_date           = v_issue,
      description          = v_description,
      default_vat_rate     = v_vat,
      stamp_duty           = v_stamp
    where id = v_id;

    delete from subcontractor_invoice_lines where invoice_id = v_id;
  else
    -- Même transaction : le verrou de la fonction couvre l'insertion.
    v_number := public.next_subcontractor_invoice_number(v_issue);

    insert into subcontractor_invoices (
      lab_id, number, subcontractor_number, subcontractor_id, issue_date,
      description, default_vat_rate, stamp_duty, created_by
    )
    values (
      v_lab, v_number, v_external, v_subcontractor, v_issue,
      v_description, v_vat, v_stamp, auth.uid()::text
    )
    returning id into v_id;
  end if;

  for v_line in
    select coalesce(nullif(o ->> 'kind', ''), 'prestation')           as kind,
           nullif(trim(coalesce(o ->> 'designation', '')), '')        as designation,
           (o ->> 'quantity')::int                                    as quantity,
           (o ->> 'unit_price')::numeric                              as unit_price,
           coalesce(nullif(o ->> 'discount_pct', '')::numeric, 0)     as discount_pct,
           coalesce(nullif(o ->> 'vat_rate', '')::numeric, 0)         as vat_rate
    from jsonb_array_elements(p_lines) o
  loop
    if v_line.designation is null then
      raise exception 'Chaque ligne doit avoir une désignation';
    end if;
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantité invalide sur une ligne de prestation';
    end if;
    if v_line.unit_price is null or v_line.unit_price < 0 then
      raise exception 'Prix unitaire invalide sur une ligne de prestation';
    end if;
    if v_line.discount_pct < 0 or v_line.discount_pct > 100 then
      raise exception 'Remise invalide sur une ligne de prestation';
    end if;

    insert into subcontractor_invoice_lines (
      lab_id, invoice_id, kind, designation, quantity, unit_price,
      discount_pct, vat_rate
    )
    values (
      v_lab, v_id, v_line.kind, v_line.designation, v_line.quantity,
      round(v_line.unit_price, 3), v_line.discount_pct, v_line.vat_rate
    );

    v_count := v_count + 1;
  end loop;

  if p_invoice_id is not null then
    -- Même verrou que check_payment_within_balance().
    perform pg_advisory_xact_lock(hashtext('supplier_paymentsubcontractor'), v_id);

    select d.amount_due, d.amount_paid into v_due, v_paid
    from supplier_debts_view d
    where d.source = 'subcontractor' and d.invoice_id = v_id;

    if v_paid > v_due then
      raise exception
        'Total TTC (% TND) inférieur aux règlements déjà enregistrés (% TND).',
        trim(to_char(v_due, 'FM999999990.000')),
        trim(to_char(v_paid, 'FM999999990.000'));
    end if;
  end if;

  return jsonb_build_object(
    'invoice_id', v_id,
    'number', v_number,
    'lines', v_count
  );
end;
$function$;

revoke execute on function public.save_subcontractor_invoice(integer, jsonb, jsonb)
  from public, anon;
grant execute on function public.save_subcontractor_invoice(integer, jsonb, jsonb)
  to authenticated;
