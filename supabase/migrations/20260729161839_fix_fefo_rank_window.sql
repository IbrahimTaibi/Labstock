create or replace view lots_view with (security_invoker = true) as
select
  l.id,
  l.lot_number,
  l.internal_ref,
  l.manufacturer_ref,
  l.manufacturer,
  l.packaging,
  l.expiry_date,
  l.initial_qty,
  l.current_qty,
  l.price_ht,
  l.unit_price,
  l.comment,
  l.created_at,
  l.created_by,
  l.updated_at,
  l.updated_by,
  l.product_id,
  p.name as product_name,
  c.name as category,
  s.name as supplier,
  (l.expiry_date - current_date)::int as days_left,
  (l.expiry_date < current_date) as is_expired,
  case
    when l.expiry_date < current_date or l.current_qty = 0 then null
    else rank() over (
      partition by l.product_id
      /* Les lots inutilisables sont repoussés en fin de fenêtre pour que
         le premier lot réellement consommable porte le rang 1. */
      order by
        (l.expiry_date < current_date or l.current_qty = 0),
        l.expiry_date,
        l.id
    )
  end as fefo_rank
from lots l
join products p on p.id = l.product_id
join categories c on c.id = p.category_id
join suppliers s on s.id = p.supplier_id;
