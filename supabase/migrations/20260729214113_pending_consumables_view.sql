/* Consommables à déduire pour les analyses encore en attente.

   La quantité est calculée par analyse : pour chaque consommable on ne
   somme que les échantillons des analyses qui l'utilisent réellement.
   Multiplier chaque consommable par le total des échantillons imputerait
   par exemple des tubes EDTA à une glycémie, qui n'en consomme aucun. */
create view pending_consumables with (security_invoker = true) as
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
  join analysis_consumables ac on ac.analysis_id = p.analysis_id
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

/* Import simulé depuis le logiciel de laboratoire.

   Il n'y a pas de connecteur LIS réel : cette fonction fabrique un lot
   d'analyses prescrites pour rendre le flux exécutable de bout en bout.
   Un vrai connecteur remplacerait ce corps en insérant dans `lis_orders`. */
create or replace function public.sync_lis_orders(sample_count int default 10)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  batch text := 'LIS-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  inserted int;
begin
  if sample_count is null or sample_count < 1 or sample_count > 500 then
    raise exception 'Nombre d''échantillons hors bornes (1-500) : %', sample_count;
  end if;

  insert into lis_orders (batch_ref, analysis_id, sample_count)
  select batch, a.id, sample_count
  from analyses a;

  select count(*) into inserted from analyses;

  return jsonb_build_object(
    'batch_ref', batch,
    'analyses', inserted,
    'samples', inserted * sample_count,
    'imported_at', now()
  );
end;
$$;

revoke all on function public.sync_lis_orders(int) from public;
grant execute on function public.sync_lis_orders(int) to authenticated;
