/* Le tableau de bord accepte une période quelconque (deux dates) au lieu d'un
   nombre de mois glissants. Les séries ne sont donc plus calées sur des mois
   entiers : les seaux sont bornés à la période, et deviennent journaliers
   sous ~2 mois, sinon un graphique n'aurait qu'un ou deux points.

   Restent volontairement glissants et indépendants de la période : le stock
   dormant (90 j) et la rotation (180 j), qui décrivent l'état courant du
   stock et non la fenêtre observée. */

drop function public.dashboard(integer);

create or replace function public.dashboard(
  p_start date default null,
  p_end date default null
)
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with asked as (
  select
    coalesce(p_end, current_date) as end_date,
    coalesce(
      p_start,
      (date_trunc('month', coalesce(p_end, current_date)) - interval '5 months')::date
    ) as start_date
),
grain as (
  select
    -- Une borne inversée est ramenée à un point, jamais à une erreur.
    least(
      greatest(start_date, (end_date - interval '3 years')::date),
      end_date
    ) as start_date,
    end_date
  from asked
),
params as (
  select start_date, end_date,
         case when end_date - start_date <= 62 then 'day' else 'month' end as granularity
  from grain
),
buckets as (
  select
    case when p.granularity = 'day'
         then to_char(d::date, 'YYYY-MM-DD')
         else to_char(d::date, 'YYYY-MM') end as label,
    greatest(d::date, p.start_date) as bucket_start,
    least(
      case when p.granularity = 'day'
           then d::date
           else (date_trunc('month', d) + interval '1 month' - interval '1 day')::date end,
      p.end_date
    ) as bucket_end
  from params p,
       generate_series(
         case when p.granularity = 'day'
              then p.start_date
              else date_trunc('month', p.start_date)::date end,
         p.end_date,
         case when p.granularity = 'day'
              then interval '1 day'
              else interval '1 month' end
       ) as d
),
/* Stock reconstruit à la fin de chaque seau. Les régularisations sont
   incluses : elles ont bel et bien modifié le stock. */
stock_history as (
  select b.label, p.id as product_id, p.min_stock, p.unit_price,
         p.stock_qty - coalesce((
           select sum(case when m.type = 'in' then m.quantity else -m.quantity end)
           from stock_movements m
           where m.product_id = p.id and m.moved_at > b.bucket_end
         ), 0) as qty
  from buckets b
  cross join products p
),
kpi_history as (
  select label as month,
         count(*) filter (where qty > 0)::int as skus,
         sum(greatest(qty, 0))::int as units,
         round(sum(greatest(qty, 0) * unit_price))::numeric as value,
         count(*) filter (where qty > 0 and qty <= min_stock)::int as below_min,
         count(*) filter (where qty <= 0)::int as out_of_stock,
         count(*) filter (where qty > min_stock and qty <= min_stock * 2)::int as to_reorder
  from stock_history
  group by label
  order by label
),
/* Entrées / sorties = flux réels. Les corrections de comptage en sont
   exclues, sinon un écart d'inventaire se lirait comme une consommation.
   Les seaux sans mouvement valent 0 : la courbe reste continue. */
movements_by_month as (
  select b.label as month,
         coalesce(sum(m.quantity) filter (where m.type = 'in'), 0)::int as inbound,
         coalesce(sum(m.quantity) filter (where m.type = 'out'), 0)::int as outbound,
         coalesce(round(sum(m.quantity * p.unit_price) filter (where m.type = 'in')), 0)::numeric as inbound_value,
         coalesce(round(sum(m.quantity * p.unit_price) filter (where m.type = 'out')), 0)::numeric as outbound_value
  from buckets b
  left join stock_movements m
    on m.moved_at between b.bucket_start and b.bucket_end
   and not m.is_adjustment
  left join products p on p.id = m.product_id
  group by b.label
  order by b.label
),
invoices_by_month as (
  select b.label as month,
         count(i.id)::int as count,
         coalesce(round(sum(i.amount)), 0)::numeric as amount
  from buckets b
  left join invoices i on i.issue_date between b.bucket_start and b.bucket_end
  group by b.label
  order by b.label
),
-- Répartition des mouvements sur toute la période observée
movements_by_category as (
  select c.name as category, m.type,
         sum(m.quantity)::int as quantity,
         round(sum(m.quantity * p.unit_price))::numeric as value
  from stock_movements m
  join products p on p.id = m.product_id
  join categories c on c.id = p.category_id
  where m.moved_at between (select start_date from params) and (select end_date from params)
    and not m.is_adjustment
  group by c.name, m.type
),
dormant as (
  select coalesce(round(sum(p.stock_qty * p.unit_price)), 0)::numeric as value,
         count(*)::int as count
  from products p
  where p.stock_qty > 0
    and not exists (
      select 1 from stock_movements m
      where m.product_id = p.id
        and m.type = 'out'
        and not m.is_adjustment
        and m.moved_at >= current_date - interval '90 days'
    )
)
select jsonb_build_object(
  'kpiHistory', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) from kpi_history k),
  'stockByCategory', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select c.name as category,
             count(p.id)::int as products,
             coalesce(sum(p.stock_qty), 0)::int as units,
             coalesce(round(sum(p.stock_qty * p.unit_price)), 0)::numeric as value
      from categories c
      left join products p on p.category_id = c.id
      group by c.name
      order by value desc
    ) t
  ),
  'invoiceStatus', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select status, count(*)::int as count, round(sum(amount))::numeric as amount
      from invoices group by status
    ) t
  ),
  'invoicesByMonth', (select coalesce(jsonb_agg(to_jsonb(i)), '[]'::jsonb) from invoices_by_month i),
  'movementsByMonth', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from movements_by_month m),
  'movementsByCategory', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from movements_by_category m),
  'topProductsByValue', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.name, c.name as category, p.stock_qty as stock,
             round(p.stock_qty * p.unit_price)::numeric as value
      from products p join categories c on c.id = p.category_id
      order by p.stock_qty * p.unit_price desc
      limit 5
    ) t
  ),
  'topProductsByQuantity', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.name, c.name as category, p.stock_qty as quantity,
             round(p.stock_qty * p.unit_price)::numeric as value
      from products p join categories c on c.id = p.category_id
      order by p.stock_qty desc, p.id
      limit 5
    ) t
  ),
  'topSuppliers', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select s.name as supplier, count(i.id)::int as invoice_count,
             round(sum(i.amount))::numeric as total,
             round(100.0 * sum(i.amount) / nullif((select sum(amount) from invoices), 0), 1)::numeric as share
      from suppliers s
      join invoices i on i.supplier_id = s.id
      group by s.name
      order by total desc
      limit 5
    ) t
  ),
  'criticalProducts', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.name, c.name as category, p.stock_qty as stock, p.min_stock,
             round(p.stock_qty * p.unit_price)::numeric as value,
             case when p.stock_qty = 0 then 'out_of_stock'
                  when p.stock_qty <= p.min_stock then 'low'
                  else 'near_out' end as status
      from products p join categories c on c.id = p.category_id
      where p.stock_qty <= p.min_stock
      order by p.stock_qty, p.stock_qty * p.unit_price desc
      limit 8
    ) t
  ),
  'overdueInvoices', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select i.number, s.name as supplier, i.due_date, i.amount,
             (current_date - i.due_date)::int as days_late
      from invoices i join suppliers s on s.id = i.supplier_id
      where i.status = 'overdue'
      order by i.amount desc
      limit 8
    ) t
  ),
  'indicators', jsonb_build_object(
    'availabilityRate', (
      select round(100.0 * count(*) filter (where stock_qty > 0) / nullif(count(*), 0), 1) from products
    ),
    'stockTurnover', (
      select round(
        (sum(m.quantity * p.unit_price) * 2.0) / nullif((select sum(stock_qty * unit_price) from products), 0)
      , 1)
      from stock_movements m join products p on p.id = m.product_id
      where m.type = 'out' and not m.is_adjustment
        and m.moved_at >= current_date - interval '180 days'
    ),
    'avgPaymentDays', (
      select round(avg(payment_date - issue_date)) from invoices where payment_date is not null
    ),
    'dormantValue', (select value from dormant),
    'dormantCount', (select count from dormant)
  ),
  'alerts', jsonb_build_object(
    'belowMin', (select count(*)::int from products where stock_qty > 0 and stock_qty <= min_stock),
    'outOfStock', (select count(*)::int from products where stock_qty = 0),
    'toReorder', (select count(*)::int from products where stock_qty > min_stock and stock_qty <= min_stock * 2),
    'overdueInvoices', (select count(*)::int from invoices where status = 'overdue')
  ),
  'period', jsonb_build_object(
    'start', (select start_date from params),
    'end', (select end_date from params),
    'granularity', (select granularity from params)
  )
)
$$;

revoke all on function public.dashboard(date, date) from public, anon;
grant execute on function public.dashboard(date, date) to authenticated;
