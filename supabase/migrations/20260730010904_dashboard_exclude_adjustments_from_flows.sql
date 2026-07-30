create or replace function public.dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with months as (
  select (date_trunc('month', now())::date - (interval '1 month' * g))::date as start_date
  from generate_series(5, 0, -1) as g
),
bounds as (
  select start_date,
         least((start_date + interval '1 month' - interval '1 day')::date, current_date) as end_date
  from months
),
/* Stock reconstruit à la fin de chaque mois. Les régularisations sont
   incluses : elles ont bel et bien modifié le stock. */
stock_history as (
  select b.start_date, p.id as product_id, p.min_stock, p.unit_price,
         p.stock_qty - coalesce((
           select sum(case when m.type = 'in' then m.quantity else -m.quantity end)
           from stock_movements m
           where m.product_id = p.id and m.moved_at > b.end_date
         ), 0) as qty
  from bounds b
  cross join products p
),
kpi_history as (
  select to_char(start_date, 'YYYY-MM') as month,
         count(*) filter (where qty > 0)::int as skus,
         sum(greatest(qty, 0))::int as units,
         round(sum(greatest(qty, 0) * unit_price))::numeric as value,
         count(*) filter (where qty > 0 and qty <= min_stock)::int as below_min,
         count(*) filter (where qty <= 0)::int as out_of_stock,
         count(*) filter (where qty > min_stock and qty <= min_stock * 2)::int as to_reorder
  from stock_history
  group by start_date
  order by start_date
),
/* Entrées / sorties = flux réels. Les corrections de comptage en sont
   exclues, sinon un écart d'inventaire se lirait comme une consommation. */
movements_by_month as (
  select to_char(date_trunc('month', m.moved_at), 'YYYY-MM') as month,
         sum(m.quantity) filter (where m.type = 'in')::int as inbound,
         sum(m.quantity) filter (where m.type = 'out')::int as outbound,
         round(sum(m.quantity * p.unit_price) filter (where m.type = 'in'))::numeric as inbound_value,
         round(sum(m.quantity * p.unit_price) filter (where m.type = 'out'))::numeric as outbound_value
  from stock_movements m
  join products p on p.id = m.product_id
  where m.moved_at >= (select min(start_date) from months)
    and not m.is_adjustment
  group by 1
  order by 1
),
invoices_by_month as (
  select to_char(date_trunc('month', issue_date), 'YYYY-MM') as month,
         count(*)::int as count,
         round(sum(amount))::numeric as amount
  from invoices
  where issue_date >= (select min(start_date) from months)
  group by 1
  order by 1
),
movements_by_category as (
  select c.name as category, m.type,
         sum(m.quantity)::int as quantity,
         round(sum(m.quantity * p.unit_price))::numeric as value
  from stock_movements m
  join products p on p.id = m.product_id
  join categories c on c.id = p.category_id
  where m.moved_at >= date_trunc('month', now())::date
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
    'start', (select min(start_date) from months),
    'end', current_date
  )
)
$$;

revoke all on function public.dashboard() from public;
grant execute on function public.dashboard() to authenticated;
