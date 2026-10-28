/* Gestion des fournisseurs : fiche complète et évaluation.

   1. La fiche gagne les champs du référentiel (code FOURN-NNNN, code postal,
      GSM, matricule fiscal, catégorie, conditions de paiement, devise,
      statut, date de création). Les fiches importées par
      replace_suppliers.sql rangeaient code et matricule dans `notes` et le
      GSM dans `phone` : ils sont redistribués dans leurs colonnes.
   2. Évaluation mensuelle sur cinq critères notés de 1 à 5. La note globale
      d'un fournisseur est la moyenne des critères. */

-- ---------------------------------------------------------------------------
-- 1. Fiche fournisseur
-- ---------------------------------------------------------------------------

alter table suppliers
  add column code text,
  add column postal_code text,
  add column mobile text,
  add column tax_id text,
  add column category text,
  add column payment_terms_days int check (payment_terms_days >= 0),
  add column currency text not null default 'TND',
  add column active boolean not null default true,
  add column created_on date not null default current_date;

comment on column suppliers.code is 'Code fournisseur FOURN-NNNN, attribué automatiquement par laboratoire.';
comment on column suppliers.tax_id is 'Matricule fiscal.';
comment on column suppliers.payment_terms_days is 'Conditions de paiement par défaut, en jours (0 = comptant).';

-- Redistribution des fiches importées.
update suppliers set
  code        = substring(notes from 'Code : (FOURN-\d+)'),
  tax_id      = nullif(trim(substring(notes from 'Matricule fiscal : ([^\n]+)')), ''),
  mobile      = case when phone like '% — GSM %'
                     then nullif(trim(split_part(phone, ' — GSM ', 2)), '') end,
  phone       = case when phone like '% — GSM %'
                     then nullif(trim(split_part(phone, ' — GSM ', 1)), '') else phone end,
  postal_code = substring(address from ', (\d{4})$'),
  address     = regexp_replace(address, ', \d{4}$', ''),
  category    = 'Fournisseur de réactifs',
  payment_terms_days = 60
where notes like 'Code : FOURN-%';

update suppliers set notes = nullif(trim(
  regexp_replace(
    regexp_replace(notes, 'Code : FOURN-\d+\n?', ''),
    'Matricule fiscal : [^\n]*\n?', ''
  )
), '')
where code is not null;

-- Codes des fiches qui n'en ont pas encore, à la suite des existants.
update suppliers s
set code = 'FOURN-' || lpad((m.max_n + n.rn)::text, 4, '0')
from (
  select id, lab_id, row_number() over (partition by lab_id order by id) as rn
  from suppliers where code is null
) n
join (
  select lab_id, coalesce(max(substring(code from '(\d+)$')::int), 0) as max_n
  from suppliers group by lab_id
) m on m.lab_id = n.lab_id
where s.id = n.id;

create unique index suppliers_code_key on suppliers (lab_id, code);
alter table suppliers alter column code set not null;

/* Code attribué à la création quand il n'est pas fourni. Verrou par
   laboratoire : deux créations simultanées ne tirent pas le même numéro. */
create or replace function public.assign_supplier_code()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_next int;
begin
  if new.code is not null and trim(new.code) <> '' then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtext('supplier_code'), new.lab_id);
  select coalesce(max(substring(code from '(\d+)$')::int), 0) + 1
  into v_next
  from suppliers
  where lab_id = new.lab_id and code like 'FOURN-%';
  new.code := 'FOURN-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

create trigger suppliers_assign_code
  before insert on suppliers
  for each row execute function public.assign_supplier_code();

-- ---------------------------------------------------------------------------
-- 2. Évaluations
-- ---------------------------------------------------------------------------

create table supplier_evaluations (
  id serial primary key,
  lab_id integer not null default public.current_lab_id()
    references public.laboratories (id),
  supplier_id integer not null references suppliers (id) on delete cascade,
  -- Mois évalué, ramené au premier jour.
  period date not null check (period = date_trunc('month', period)::date),
  quality   numeric(2, 1) not null check (quality   between 1 and 5),
  delays    numeric(2, 1) not null check (delays    between 1 and 5),
  documents numeric(2, 1) not null check (documents between 1 and 5),
  service   numeric(2, 1) not null check (service   between 1 and 5),
  pricing   numeric(2, 1) not null check (pricing   between 1 and 5),
  comment text,
  evaluated_by text,
  created_at timestamptz not null default now(),
  unique (supplier_id, period)
);

comment on table supplier_evaluations is
  'Évaluation mensuelle d''un fournisseur : qualité produits, respect des délais, conformité documentaire, service client, tarification (1 à 5).';

create index supplier_evaluations_lab_idx on supplier_evaluations (lab_id, period desc);

alter table supplier_evaluations enable row level security;

create policy "lecture par laboratoire" on supplier_evaluations
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on supplier_evaluations
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on supplier_evaluations
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));
create policy "suppression par laboratoire" on supplier_evaluations
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

grant select, insert, update, delete on supplier_evaluations to authenticated;
grant usage, select on sequence supplier_evaluations_id_seq to authenticated;
