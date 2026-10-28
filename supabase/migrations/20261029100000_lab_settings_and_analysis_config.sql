/* Paramètres généraux du laboratoire et configuration complète des analyses.

   1. `lab_settings` — un document de configuration par laboratoire. Les
      rubriques de l'écran (identité, analyse, prélèvements, cultures, stock,
      validation, notifications, options générales) évolueront souvent et
      sont lues ensemble : un jsonb évite une migration à chaque option.
   2. `instruments` — les automates, partagés entre analyses.
   3. `analyses` — la fiche complète (prélèvement, délai, validation…).
   4. `analysis_consumables` — chaque ligne gagne un rôle (consommable,
      réactif, milieu de culture, disque d'antibiogramme), une unité, et
      surtout un drapeau de déstockage automatique.
   5. `pending_consumables` — la vue du déstockage automatique respecte
      désormais ce drapeau et le statut actif de l'analyse : une ligne
      « selon règle » ou une analyse désactivée ne sont plus déduites. */

-- ---------------------------------------------------------------------------
-- 1. Paramètres du laboratoire
-- ---------------------------------------------------------------------------

create table lab_settings (
  lab_id integer primary key default public.current_lab_id()
    references public.laboratories (id) on delete cascade,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);

comment on table lab_settings is
  'Configuration générale d''un laboratoire (écran Paramètres généraux), un document jsonb par laboratoire.';

alter table lab_settings enable row level security;

create policy "lecture par laboratoire" on lab_settings
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on lab_settings
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on lab_settings
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));

grant select, insert, update on lab_settings to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Automates
-- ---------------------------------------------------------------------------

create table instruments (
  id serial primary key,
  lab_id integer not null default public.current_lab_id()
    references public.laboratories (id),
  name text not null,
  category text,
  status text not null default 'in_service'
    check (status in ('in_service', 'maintenance', 'out_of_service')),
  lis_interface boolean not null default false,
  calibration text,
  maintenance text,
  created_at timestamptz not null default now()
);

create unique index instruments_name_key on instruments (lab_id, lower(name));

alter table instruments enable row level security;

create policy "lecture par laboratoire" on instruments
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on instruments
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on instruments
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));

grant select, insert, update on instruments to authenticated;
grant usage, select on sequence instruments_id_seq to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Fiche analyse
-- ---------------------------------------------------------------------------

alter table analyses
  add column category text,
  add column description text,
  add column turnaround_hours integer check (turnaround_hours >= 0),
  add column sample_type text,
  add column tube text,
  add column sample_volume_ml numeric check (sample_volume_ml >= 0),
  add column transport_conditions text,
  add column urgent_allowed boolean not null default false,
  add column bio_validation_required boolean not null default true,
  add column microscopy_control boolean not null default false,
  /* Une analyse inactive n'est plus déstockée automatiquement : on la
     désactive au lieu de la supprimer, ses commandes LIS passées y
     restent rattachées. */
  add column active boolean not null default true,
  add column instrument_id integer references instruments (id) on delete set null,
  add column notes text,
  add column updated_at timestamptz,
  add column updated_by text;

-- ---------------------------------------------------------------------------
-- 4. Lignes de consommation
-- ---------------------------------------------------------------------------

alter table analysis_consumables
  add column role text not null default 'consumable'
    check (role in ('consumable', 'reagent', 'culture', 'antibiotic')),
  add column consumption_unit text,
  /* Faux = « selon règle » : la ligne n'est pas déduite automatiquement,
     elle se sort à la main quand la condition est remplie. */
  add column auto_destock boolean not null default true,
  add column condition text,
  add column germ_type text,
  add column incubation text;

comment on column analysis_consumables.auto_destock is
  'Vrai : déduit automatiquement à chaque test. Faux : « selon règle », sortie manuelle quand `condition` est remplie.';

-- La configuration retire des lignes : il manquait la suppression.
create policy "suppression par laboratoire" on analysis_consumables
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));
grant delete on analysis_consumables to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Déstockage automatique
-- ---------------------------------------------------------------------------

/* Même vue, mêmes colonnes ; seul `needs` change : il ignore les lignes
   « selon règle » et les analyses désactivées. */
create or replace view pending_consumables with (security_invoker = true) as
with pending as (
  select analysis_id, sum(sample_count)::int as samples
  from lis_orders
  where status = 'pending'
  group by analysis_id
),
needs as (
  select ac.product_id,
         sum(p.samples * ac.coefficient) as raw_quantity,
         min(ac.coefficient) as min_coefficient,
         max(ac.coefficient) as max_coefficient,
         sum(p.samples)::int as covered_samples
  from pending p
  join analyses a on a.id = p.analysis_id and a.active
  join analysis_consumables ac
    on ac.analysis_id = p.analysis_id and ac.auto_destock
  group by ac.product_id
)
select
  pr.id as product_id,
  pr.name as product_name,
  pr.reference,
  c.name as category,
  pr.stock_qty as stock_available,
  n.raw_quantity,
  /* Les consommables sont des unités indivisibles : on arrondit au
     supérieur, jamais en dessous du besoin réel. */
  ceil(n.raw_quantity)::int as required_quantity,
  n.covered_samples,
  case
    when n.min_coefficient = n.max_coefficient then n.min_coefficient
    else null
  end as coefficient,
  pr.stock_qty - ceil(n.raw_quantity)::int as remaining_stock,
  pr.stock_qty >= ceil(n.raw_quantity)::int as is_available,
  fefo.id as lot_id,
  fefo.lot_number,
  fefo.expiry_date,
  fefo.current_qty as lot_quantity
from needs n
join products pr on pr.id = n.product_id
join categories c on c.id = pr.category_id
left join lateral (
  -- Lot retenu = premier lot consommable en FEFO
  select l.id, l.lot_number, l.expiry_date, l.current_qty
  from lots l
  where l.product_id = n.product_id
    and l.current_qty > 0
    and l.expiry_date >= current_date
  order by l.expiry_date, l.id
  limit 1
) fefo on true;

-- ---------------------------------------------------------------------------
-- 6. Enregistrement d'une configuration d'analyse
-- ---------------------------------------------------------------------------

/* Fiche, automate et lignes en une transaction : une configuration à
   moitié écrite fausserait le prochain déstockage. Les lignes sont
   réécrites — elles n'ont pas d'identité propre hors de leur couple
   (analyse, article). */
create or replace function public.save_analysis_config(
  p_analysis_id integer,
  p_analysis jsonb,
  p_instrument jsonb,
  p_items jsonb,
  p_operator text
)
returns jsonb
language plpgsql
set search_path = public
as $function$
declare
  v_lab int;
  v_id int;
  v_instrument int;
  v_code text := nullif(trim(coalesce(p_analysis ->> 'code', '')), '');
  v_name text := nullif(trim(coalesce(p_analysis ->> 'name', '')), '');
  v_count int := 0;
begin
  v_lab := public.assert_lab_context();

  if v_code is null then
    raise exception 'Le code LIS est obligatoire';
  end if;
  if v_name is null then
    raise exception 'Le nom de l''analyse est obligatoire';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' then
    raise exception 'Lignes de consommation invalides';
  end if;
  if (select count(*) from jsonb_array_elements(p_items) o)
     <> (select count(distinct (o ->> 'product_id')) from jsonb_array_elements(p_items) o) then
    raise exception 'Un même article ne peut figurer qu''une fois dans la configuration';
  end if;

  -- Automate : créé ou mis à jour d'après la fiche saisie.
  if p_instrument is not null and nullif(trim(coalesce(p_instrument ->> 'name', '')), '') is not null then
    v_instrument := nullif(p_instrument ->> 'id', '')::int;
    if v_instrument is null then
      select id into v_instrument from instruments
      where lab_id = v_lab and lower(name) = lower(trim(p_instrument ->> 'name'));
    end if;
    if v_instrument is null then
      insert into instruments (lab_id, name, category, status, lis_interface, calibration, maintenance)
      values (
        v_lab,
        trim(p_instrument ->> 'name'),
        nullif(trim(coalesce(p_instrument ->> 'category', '')), ''),
        coalesce(nullif(p_instrument ->> 'status', ''), 'in_service'),
        coalesce((p_instrument ->> 'lis_interface')::boolean, false),
        nullif(trim(coalesce(p_instrument ->> 'calibration', '')), ''),
        nullif(trim(coalesce(p_instrument ->> 'maintenance', '')), '')
      )
      returning id into v_instrument;
    else
      update instruments set
        name          = trim(p_instrument ->> 'name'),
        category      = nullif(trim(coalesce(p_instrument ->> 'category', '')), ''),
        status        = coalesce(nullif(p_instrument ->> 'status', ''), 'in_service'),
        lis_interface = coalesce((p_instrument ->> 'lis_interface')::boolean, false),
        calibration   = nullif(trim(coalesce(p_instrument ->> 'calibration', '')), ''),
        maintenance   = nullif(trim(coalesce(p_instrument ->> 'maintenance', '')), '')
      where id = v_instrument;
      if not found then
        raise exception 'Automate introuvable';
      end if;
    end if;
  end if;

  if p_analysis_id is null then
    insert into analyses (lab_id, code, name, section)
    values (v_lab, v_code, v_name, coalesce(nullif(trim(p_analysis ->> 'category'), ''), 'Non classée'))
    returning id into v_id;
  else
    select id into v_id from analyses where id = p_analysis_id for update;
    if not found then
      raise exception 'Analyse introuvable';
    end if;
  end if;

  update analyses set
    code                    = v_code,
    name                    = v_name,
    /* `section` reste la rubrique historique, lue par les sorties de
       stock : elle suit la catégorie saisie. */
    section                 = coalesce(nullif(trim(p_analysis ->> 'category'), ''), section),
    category                = nullif(trim(coalesce(p_analysis ->> 'category', '')), ''),
    description             = nullif(trim(coalesce(p_analysis ->> 'description', '')), ''),
    turnaround_hours        = nullif(p_analysis ->> 'turnaround_hours', '')::int,
    sample_type             = nullif(trim(coalesce(p_analysis ->> 'sample_type', '')), ''),
    tube                    = nullif(trim(coalesce(p_analysis ->> 'tube', '')), ''),
    sample_volume_ml        = nullif(p_analysis ->> 'sample_volume_ml', '')::numeric,
    transport_conditions    = nullif(trim(coalesce(p_analysis ->> 'transport_conditions', '')), ''),
    urgent_allowed          = coalesce((p_analysis ->> 'urgent_allowed')::boolean, false),
    bio_validation_required = coalesce((p_analysis ->> 'bio_validation_required')::boolean, true),
    microscopy_control      = coalesce((p_analysis ->> 'microscopy_control')::boolean, false),
    active                  = coalesce((p_analysis ->> 'active')::boolean, true),
    instrument_id           = v_instrument,
    notes                   = nullif(trim(coalesce(p_analysis ->> 'notes', '')), ''),
    updated_at              = now(),
    updated_by              = p_operator
  where id = v_id;

  delete from analysis_consumables where analysis_id = v_id;

  insert into analysis_consumables (
    lab_id, analysis_id, product_id, coefficient, role, consumption_unit,
    auto_destock, condition, germ_type, incubation
  )
  select
    v_lab,
    v_id,
    (o ->> 'product_id')::int,
    (o ->> 'coefficient')::numeric,
    coalesce(nullif(o ->> 'role', ''), 'consumable'),
    nullif(trim(coalesce(o ->> 'consumption_unit', '')), ''),
    coalesce((o ->> 'auto_destock')::boolean, true),
    nullif(trim(coalesce(o ->> 'condition', '')), ''),
    nullif(trim(coalesce(o ->> 'germ_type', '')), ''),
    nullif(trim(coalesce(o ->> 'incubation', '')), '')
  from jsonb_array_elements(p_items) o;
  get diagnostics v_count = row_count;

  return jsonb_build_object('analysis_id', v_id, 'items', v_count, 'instrument_id', v_instrument);
end;
$function$;

revoke execute on function public.save_analysis_config(integer, jsonb, jsonb, jsonb, text)
  from public, anon;
grant execute on function public.save_analysis_config(integer, jsonb, jsonb, jsonb, text)
  to authenticated;
