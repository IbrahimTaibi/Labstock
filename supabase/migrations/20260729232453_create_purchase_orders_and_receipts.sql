create table purchase_orders (
  id serial primary key,
  number text not null unique,
  supplier_id int not null references suppliers(id) on delete restrict,
  ordered_at date not null,
  /* Dérivé des lignes par recompute_order_status(), jamais saisi à la main. */
  status text not null default 'pending'
    check (status in ('pending', 'partial', 'received')),
  created_at timestamptz not null default now()
);

create table purchase_order_lines (
  id serial primary key,
  order_id int not null references purchase_orders(id) on delete cascade,
  product_id int not null references products(id) on delete restrict,
  quantity_ordered int not null check (quantity_ordered > 0),
  quantity_received int not null default 0 check (quantity_received >= 0),
  /* Prix figé à la commande : le prix courant du produit peut changer. */
  unit_price numeric(10, 4) not null,
  packaging text,
  constraint received_within_ordered
    check (quantity_received <= quantity_ordered),
  unique (order_id, product_id)
);
create index idx_po_lines_order on purchase_order_lines(order_id);

create table goods_receipts (
  id serial primary key,
  order_id int not null references purchase_orders(id) on delete restrict,
  operator text not null,
  received_at timestamptz not null default now(),
  total_quantity int not null default 0,
  total_value numeric(12, 2) not null default 0
);

create table goods_receipt_lines (
  id serial primary key,
  receipt_id int not null references goods_receipts(id) on delete cascade,
  order_line_id int not null references purchase_order_lines(id) on delete restrict,
  product_id int not null references products(id) on delete restrict,
  lot_id int references lots(id) on delete set null,
  quantity int not null check (quantity > 0),
  unit_price numeric(10, 4) not null
);
create index idx_receipt_lines_receipt on goods_receipt_lines(receipt_id);

alter table purchase_orders enable row level security;
alter table purchase_order_lines enable row level security;
alter table goods_receipts enable row level security;
alter table goods_receipt_lines enable row level security;

create policy "lecture authentifiee" on purchase_orders
  for select to authenticated using (true);
create policy "lecture authentifiee" on purchase_order_lines
  for select to authenticated using (true);
create policy "lecture authentifiee" on goods_receipts
  for select to authenticated using (true);
create policy "lecture authentifiee" on goods_receipt_lines
  for select to authenticated using (true);

/* Vue de travail des lignes de commande, avec le reste à recevoir et le
   statut de livraison déduits plutôt que stockés. */
create view purchase_order_lines_view with (security_invoker = true) as
select
  pol.id,
  pol.order_id,
  po.number as order_number,
  pol.product_id,
  p.name as product_name,
  coalesce(p.reference, 'REF-' || lpad(p.id::text, 6, '0')) as reference,
  c.name as category,
  s.name as supplier,
  pol.quantity_ordered,
  pol.quantity_received,
  pol.quantity_ordered - pol.quantity_received as quantity_remaining,
  pol.unit_price,
  pol.packaging,
  case
    when pol.quantity_received = 0 then 'pending'
    when pol.quantity_received < pol.quantity_ordered then 'partial'
    else 'received'
  end as delivery_status
from purchase_order_lines pol
join purchase_orders po on po.id = pol.order_id
join products p on p.id = pol.product_id
join categories c on c.id = p.category_id
join suppliers s on s.id = po.supplier_id;
