/* Évaluation de la satisfaction des fournisseurs, livraison par livraison.

   Distincte de `supplier_evaluations` (20261028174605), qui note un
   fournisseur une fois par mois sur cinq critères. Ici, chaque bon de
   commande livré reçoit sa propre évaluation : date prévue contre date
   réelle, conformité, qualité constatée, note. Les indicateurs de l'écran
   (taux de conformité, livraisons à l'heure, délai moyen) se calculent sur
   ces lignes.

   Les deux dates sont figées dans l'évaluation plutôt que relues à chaque
   affichage : la date prévue dépend du délai saisi sur le B.C., la date
   réelle des réceptions, et l'une comme l'autre peuvent bouger après coup.
   L'évaluation documente ce qui a été constaté au moment où elle a été
   faite. */

create table delivery_evaluations (
  id serial primary key,
  lab_id integer not null default public.current_lab_id()
    references public.laboratories (id),
  /* Une évaluation par B.C. : la réévaluer, c'est la modifier. */
  order_id integer not null unique references purchase_orders (id) on delete cascade,
  expected_date date not null,
  delivered_date date not null,
  /* Une livraison en avance n'est pas un retard négatif à porter au crédit
     du fournisseur : elle compte comme « à l'heure ». */
  delay_days integer generated always as (greatest(delivered_date - expected_date, 0)) stored,
  conforming boolean not null,
  quality text not null,
  remark text not null,
  delay_cause text,
  rating smallint not null check (rating between 1 and 5),
  /* Score objectif, à côté de la note donnée : 5, moins 1 à 3 points selon
     le retard (1–2 j, 3–5 j, > 5 j), moins 2 si la livraison n'est pas
     conforme, jamais sous 1. L'expression du retard est répétée : une
     colonne générée ne peut pas en lire une autre. */
  auto_score smallint generated always as (
    greatest(
      1,
      5
      - case
          when delivered_date - expected_date <= 0 then 0
          when delivered_date - expected_date <= 2 then 1
          when delivered_date - expected_date <= 5 then 2
          else 3
        end
      - case when conforming then 0 else 2 end
    )
  ) stored,
  comment text,
  evaluated_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table delivery_evaluations is
  'Évaluation d''une livraison fournisseur, une par bon de commande : ponctualité, conformité, qualité et note sur 5.';
comment on column delivery_evaluations.auto_score is
  'Score calculé : 5 − pénalité de retard (0 à 3) − 2 si non conforme, minimum 1.';

create index delivery_evaluations_lab_idx
  on delivery_evaluations (lab_id, delivered_date desc);

alter table delivery_evaluations enable row level security;

create policy "lecture par laboratoire" on delivery_evaluations
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on delivery_evaluations
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on delivery_evaluations
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));
create policy "suppression par laboratoire" on delivery_evaluations
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

grant select, insert, update, delete on delivery_evaluations to authenticated;
grant usage, select on sequence delivery_evaluations_id_seq to authenticated;
