/* Règlement des dettes fournisseurs (cahier des charges §9, §10).

   L'écran de saisie lit et écrit `supplier_payments`, posée avec le module
   « Gestion des Dettes Fournisseurs » : §9.1 exige que les deux écrans
   partagent la même base, c'est déjà le cas et rien n'est dupliqué ici.

   Ce cahier des charges apporte en revanche deux règles que la table
   enfreignait :

     §9.2 — un règlement ne peut pas dépasser le solde restant dû. Rien ne
     l'empêchait : on pouvait solder deux fois la même facture.

     §9.3 — un règlement est une écriture définitive, non modifiable. Or la
     table accordait UPDATE et DELETE à tout utilisateur authentifié : une
     erreur de saisie se corrigeait en effaçant la trace, exactement ce que
     la traçabilité ISO 15189 interdit.

   La correction suit la posture déjà retenue pour les réceptions
   (reverse_goods_receipt) : on n'efface pas, on contre-passe. */

-- ---------------------------------------------------------------------------
-- §9.3 / §10.3 — Contre-passation plutôt que suppression
-- ---------------------------------------------------------------------------

alter table supplier_payments
  add column reversed_at timestamptz,
  add column reversed_by text,
  add column reversal_reason text;

comment on column supplier_payments.reversed_at is
  'Horodatage de l''annulation (§10.3). Null tant que le règlement est valide. La ligne est conservée : on contre-passe, on n''efface pas.';

/* Plus aucun chemin d'écriture destructif : la ligne de règlement devient
   immuable dès son insertion. L'annulation passe par la fonction dédiée,
   qui laisse la ligne en place et horodate son invalidation. */
drop policy "modification par laboratoire" on supplier_payments;
drop policy "suppression par laboratoire" on supplier_payments;
revoke update, delete on public.supplier_payments from authenticated;

-- ---------------------------------------------------------------------------
-- §9.2 — Un règlement ne peut pas dépasser le solde
-- ---------------------------------------------------------------------------

/* Le contrôle est posé dans la base et non seulement dans l'écran : le
   plafond protège une donnée comptable, il ne doit pas dépendre du chemin
   qui écrit. Un contrôle de saisie reste utile côté interface — il donnera
   un message avant l'aller-retour — mais il ne peut pas être le seul.

   Le verrou consultatif sérialise les règlements d'une même facture : deux
   paiements simultanés de 60% du solde passeraient tous deux le contrôle
   s'ils le lisaient en parallèle. */
create or replace function public.check_payment_within_balance()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_source text;
  v_target int;
  v_due numeric;
  v_paid numeric;
  v_balance numeric;
begin
  if new.invoice_id is not null then
    v_source := 'supplier';
    v_target := new.invoice_id;
  else
    v_source := 'subcontractor';
    v_target := new.subcontractor_invoice_id;
  end if;

  perform pg_advisory_xact_lock(hashtext('supplier_payment' || v_source), v_target);

  select d.amount_due, d.amount_paid
  into v_due, v_paid
  from supplier_debts_view d
  where d.source = v_source and d.invoice_id = v_target;

  if not found then
    raise exception 'Facture introuvable pour ce règlement';
  end if;

  v_balance := v_due - v_paid;

  if v_balance <= 0 then
    raise exception
      'Cette facture est déjà soldée : aucun règlement supplémentaire ne peut être enregistré.';
  end if;

  if new.amount > v_balance then
    raise exception
      'Règlement de % TND supérieur au solde restant dû (% TND).',
      trim(to_char(new.amount, 'FM999999990.000')),
      trim(to_char(v_balance, 'FM999999990.000'));
  end if;

  return new;
end;
$$;

create trigger supplier_payments_within_balance
  before insert on supplier_payments
  for each row execute function public.check_payment_within_balance();

-- ---------------------------------------------------------------------------
-- §9.1 — Le solde ignore les règlements annulés
-- ---------------------------------------------------------------------------

/* Une contre-passation doit rendre son montant à la dette, sans quoi
   l'annulation n'annulerait rien. Seule la sous-requête des règlements
   change ; la liste des colonnes est identique. */
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

-- ---------------------------------------------------------------------------
-- §10.3 — Annulation d'un règlement
-- ---------------------------------------------------------------------------

/* SECURITY DEFINER assumé : le rôle `authenticated` n'a plus le droit
   d'écrire sur `supplier_payments` en dehors d'une insertion, et c'est bien
   l'intention. La fonction est le seul chemin d'annulation, et elle vérifie
   explicitement le laboratoire de l'appelant — sans quoi elle annulerait
   les règlements de n'importe quel locataire. */
create or replace function public.reverse_supplier_payment(
  p_payment_id int,
  p_operator text,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lab int;
  v_payment record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  v_lab := public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_payment
  from supplier_payments
  where id = p_payment_id
    -- Cadrage explicite : SECURITY DEFINER contourne le RLS.
    and lab_id = v_lab
  for update;

  if not found then
    raise exception 'Règlement introuvable : %', p_payment_id;
  end if;
  if v_payment.reversed_at is not null then
    raise exception
      'Ce règlement a déjà été annulé le %',
      to_char(v_payment.reversed_at, 'DD/MM/YYYY "à" HH24:MI');
  end if;

  update supplier_payments
  set reversed_at = now(),
      reversed_by = p_operator,
      reversal_reason = v_reason
  where id = p_payment_id;

  return jsonb_build_object(
    'payment_id', p_payment_id,
    'amount', v_payment.amount,
    'reversed_at', now()
  );
end;
$$;

revoke all on function public.reverse_supplier_payment(int, text, text)
  from public, anon;
grant execute on function public.reverse_supplier_payment(int, text, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- §10.2 — Référence de paiement
-- ---------------------------------------------------------------------------

/* Format relevé sur la maquette : VIR-2026-0626-001, soit préfixe du mode,
   année, jour-mois, puis séquence du jour. Le préfixe suit le mode de
   règlement, comme le laisse entendre §4.1.

   Proposée, non imposée : la colonne `reference` reste libre, parce qu'une
   référence de virement vient souvent de la banque et non de nous. */
create or replace function public.next_payment_reference(
  p_method text,
  p_paid_at date default current_date
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_lab int;
  v_prefix text;
  v_day date := coalesce(p_paid_at, current_date);
  v_stem text;
  v_next int;
begin
  v_lab := public.assert_lab_context();

  v_prefix := case p_method
    when 'transfer' then 'VIR'
    when 'check'    then 'CHQ'
    when 'cash'     then 'ESP'
    when 'card'     then 'CB'
    else 'REG'
  end;

  v_stem := v_prefix || '-' || to_char(v_day, 'YYYY') || '-' || to_char(v_day, 'MMDD');

  perform pg_advisory_xact_lock(hashtext('payment_reference' || v_stem), v_lab);

  select coalesce(
           max((regexp_match(reference, '^' || v_stem || '-(\d+)$'))[1]::int),
           0
         ) + 1
  into v_next
  from supplier_payments
  where lab_id = v_lab and reference like v_stem || '-%';

  return v_stem || '-' || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function public.next_payment_reference(text, date) from public, anon;
grant execute on function public.next_payment_reference(text, date) to authenticated;

-- ---------------------------------------------------------------------------
-- §6 — Historique des règlements
-- ---------------------------------------------------------------------------

/* Le tableau de l'écran, prêt à lire : chaque règlement avec sa facture et
   son créancier, les deux familles confondues. §10.1 n'a pas tranché si la
   vue est filtrée sur la facture sélectionnée ou globale — la vue rend les
   deux possibles, le filtre est affaire d'écran. */
create view supplier_payment_history_view with (security_invoker = true) as
select
  p.id            as payment_id,
  p.lab_id,
  p.paid_at,
  d.source,
  d.invoice_id,
  d.number        as invoice_number,
  d.creditor,
  d.creditor_id,
  p.method,
  p.reference,
  p.amount,
  p.note,
  p.reversed_at,
  p.reversed_by,
  p.reversal_reason,
  p.created_at,
  p.created_by
from supplier_payments p
join supplier_debts_view d
  on (p.invoice_id is not null and d.source = 'supplier'
      and d.invoice_id = p.invoice_id)
  or (p.subcontractor_invoice_id is not null and d.source = 'subcontractor'
      and d.invoice_id = p.subcontractor_invoice_id);

grant select on public.supplier_payment_history_view to authenticated;

-- ---------------------------------------------------------------------------
-- §9.3 — Une facture réglée n'est plus supprimable
-- ---------------------------------------------------------------------------

/* `on delete cascade` rendait la contre-passation illusoire : supprimer la
   facture emportait silencieusement tout son historique de règlements.
   `restrict` ferme la porte — une pièce comptable réglée se contre-passe,
   elle ne se supprime pas. */
alter table supplier_payments
  drop constraint supplier_payments_invoice_id_fkey,
  add constraint supplier_payments_invoice_id_fkey
    foreign key (invoice_id) references invoices(id) on delete restrict;

alter table supplier_payments
  drop constraint supplier_payments_subcontractor_invoice_id_fkey,
  add constraint supplier_payments_subcontractor_invoice_id_fkey
    foreign key (subcontractor_invoice_id)
    references subcontractor_invoices(id) on delete restrict;
