/* Dettes fournisseurs : socle de données (cahier des charges §5, §6, §7, §10).

   Décision de conception centrale — §11.1.

   Le cahier des charges décrit une « fiche de dette » que l'on créerait par
   facture, avec son montant à payer, son fournisseur et sa date. Toutes ces
   données existent déjà sur la facture. Les recopier dans une table dédiée
   créerait deux vérités pour un même montant, et la question « 100%
   automatique ou saisie manuelle ? » (§11.1) ne se poserait que parce que
   cette copie peut diverger.

   On prend donc l'autre route : une dette N'EST PAS un enregistrement, c'est
   une lecture de la facture. `supplier_debts_view` compose les deux familles
   de factures avec leurs règlements. Conséquences :
     - la liaison est automatique par construction, rien à synchroniser ;
     - le solde ne peut pas contredire la facture ;
     - §10.2 (job quotidien de recalcul des statuts) devient inutile : le
       statut est calculé à la lecture, il est donc juste à la seconde près,
       sans tâche planifiée à surveiller.

   Ce que ce fichier ajoute réellement, parce que cela n'existe nulle part :
     - les règlements, partiels et multiples (§10.3, §11.4) ;
     - le délai de paiement en jours, qui calcule l'échéance (§5.1) ;
     - la catégorie de dépense (§5.1) ;
     - l'échéance des factures sous-traitant, absente jusqu'ici ;
     - les tranches d'ancienneté, en un seul endroit (§11.6). */

-- ---------------------------------------------------------------------------
-- §5.1 — Délai de paiement et catégorie de dépense
-- ---------------------------------------------------------------------------

/* `payment_terms` était un texte libre (« À 30 jours ») posé pour l'en-tête
   de Facture Fournisseur. L'échéance se calcule sur un nombre de jours, pas
   sur une phrase, et toutes les options citées par ce cahier des charges
   — comptant, 30, 60, 90 — s'expriment en jours. La colonne texte n'a
   jamais été alimentée (aucune ligne, aucun écran) : on la remplace plutôt
   que de garder deux colonnes pour une seule idée. */
alter table invoices drop column payment_terms;

alter table invoices
  add column payment_terms_days int check (payment_terms_days >= 0),
  /* Catégorie de dépense (§5.1). Volontairement du texte libre et non une
     clé vers `categories` : les exemples du cahier des charges
     (CONSOMMABLE, MAINTENANCE, HYGIÈNE) ne sont pas des familles d'analyse,
     et §11.8 n'a pas tranché le périmètre. Une clé étrangère viendra quand
     le référentiel de dépenses existera. */
  add column expense_category text;

comment on column invoices.payment_terms_days is
  'Délai de paiement convenu, en jours (§5.1). 0 = comptant. Sert au calcul de l''échéance.';
comment on column invoices.expense_category is
  'Catégorie de dépense (§5.1). Texte libre tant que le référentiel de dépenses n''est pas arbitré (§11.8).';

/* Les factures sous-traitant n'avaient ni échéance ni suivi de paiement :
   leur cahier des charges n'en montrait aucun, et rien n'avait été inventé.
   Celui-ci les fait entrer dans le suivi des dettes, elles en ont donc
   besoin. `due_date` est nullable : une facture sans délai convenu n'a pas
   d'échéance, et une date inventée vaudrait moins que rien. */
alter table subcontractor_invoices
  add column payment_terms_days int check (payment_terms_days >= 0),
  add column due_date date,
  add column expense_category text;

-- ---------------------------------------------------------------------------
-- §10.3 / §11.4 — Règlements
-- ---------------------------------------------------------------------------

/* Un règlement par versement, et non un « montant payé » sur la facture :
   §10.3 prévoit explicitement des paiements partiels et successifs, et
   l'« Historique des paiements » (§8) n'a de contenu que si chaque
   versement existe en propre. Le « Montant payé » de l'écran est la somme
   de ces lignes, pas une saisie. */
create table supplier_payments (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  /* Une facture marchandise OU une facture sous-traitance, jamais les deux.
     Deux colonnes plutôt qu'un couple (type, id) : la clé étrangère reste
     vérifiée par la base dans les deux cas. */
  invoice_id integer references invoices(id) on delete cascade,
  subcontractor_invoice_id integer
    references subcontractor_invoices(id) on delete cascade,
  constraint supplier_payments_one_target
    check (num_nonnulls(invoice_id, subcontractor_invoice_id) = 1),
  amount numeric not null check (amount > 0),
  paid_at date not null default current_date,
  /* §11.5 — mode de règlement. La question était « un champ est-il prévu ? » ;
     il l'est, avec les modes usuels et une porte de sortie. */
  method text not null default 'transfer'
    check (method in ('transfer', 'check', 'cash', 'card', 'other')),
  -- §11.4 — référence du virement ou numéro de chèque.
  reference text,
  note text,
  created_at timestamptz not null default now(),
  created_by text
);

comment on table supplier_payments is
  'Règlements fournisseurs, un par versement (§10.3). Le « Montant payé » d''une dette est la somme de ces lignes.';

create index supplier_payments_invoice_idx on supplier_payments (invoice_id)
  where invoice_id is not null;
create index supplier_payments_subcontractor_idx
  on supplier_payments (subcontractor_invoice_id)
  where subcontractor_invoice_id is not null;
create index supplier_payments_lab_date_idx
  on supplier_payments (lab_id, paid_at desc);

-- ---------------------------------------------------------------------------
-- §7.1 / §11.6 — Tranches d'ancienneté
-- ---------------------------------------------------------------------------

/* §11.6 demande que ces seuils soient « une référence unique dans toute
   l'application ». Ils sont donc définis ici, une fois, et la vue comme les
   écrans les lisent d'ici. Changer une borne se fait à un seul endroit.

   `stable` et non `immutable` : le résultat dépend de current_date, il est
   donc constant le temps d'une requête, pas éternellement. */
create or replace function public.debt_ageing_bucket(
  p_due_date date,
  p_balance numeric
)
returns text
language sql
stable
set search_path = public
as $$
  select case
    -- Un solde nul clôt la dette, quelle que soit l'échéance.
    when coalesce(p_balance, 0) <= 0 then 'paid'
    when p_due_date is null then 'no_due_date'
    when p_due_date >= current_date then 'not_due'
    when current_date - p_due_date <= 30 then 'late_1_30'
    when current_date - p_due_date <= 60 then 'late_31_60'
    when current_date - p_due_date <= 90 then 'late_61_90'
    else 'late_90_plus'
  end;
$$;

comment on function public.debt_ageing_bucket(date, numeric) is
  'Tranche d''ancienneté d''une dette (§7.1). Référence unique des seuils 30/60/90 jours (§11.6).';

revoke all on function public.debt_ageing_bucket(date, numeric) from public, anon;
grant execute on function public.debt_ageing_bucket(date, numeric) to authenticated;

-- ---------------------------------------------------------------------------
-- §6 — Liste des dettes
-- ---------------------------------------------------------------------------

/* Les deux familles de factures présentées sous un même toit, avec leur
   solde et leur retard. `security_invoker` : le RLS des tables sources
   cadre déjà chaque ligne au laboratoire de l'appelant.

   Le montant dû est le TTC recomposé depuis les lignes. Pour une facture
   sans ligne — cas qui n'existe pas aujourd'hui mais que la base autorise —
   on retombe sur `invoices.amount`, qui est le seul montant connu. */
create view supplier_debts_view with (security_invoker = true) as
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
      where (d.source = 'supplier'      and p.invoice_id = d.invoice_id)
         or (d.source = 'subcontractor' and p.subcontractor_invoice_id = d.invoice_id)
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
  /* Retard en jours : positif si l'échéance est dépassée, négatif si elle
     est à venir — c'est la convention de l'écran (§5.2). */
  case when s.due_date is null then null
       else current_date - s.due_date
  end as days_late,
  public.debt_ageing_bucket(s.due_date, s.amount_due - s.amount_paid) as status
from settled s;

grant select on public.supplier_debts_view to authenticated;

-- ---------------------------------------------------------------------------
-- Cloisonnement par laboratoire
-- ---------------------------------------------------------------------------

alter table supplier_payments enable row level security;

create policy "lecture par laboratoire" on supplier_payments
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on supplier_payments
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on supplier_payments
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));
/* §11.7 — restreindre le règlement à un rôle comptable n'est pas tranché :
   la politique reste cadrée au laboratoire, comme partout ailleurs. */
create policy "suppression par laboratoire" on supplier_payments
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

grant select, insert, update, delete on public.supplier_payments to authenticated;
grant usage, select on sequence public.supplier_payments_id_seq to authenticated;
