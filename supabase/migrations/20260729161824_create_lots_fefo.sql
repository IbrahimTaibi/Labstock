-- Lots de marchandises, gérés en FEFO (First Expired, First Out)
create table lots (
  id serial primary key,
  product_id int not null references products(id) on delete cascade,
  lot_number text not null unique,
  internal_ref text,
  manufacturer_ref text,
  manufacturer text,
  packaging text,
  expiry_date date not null,
  initial_qty int not null default 0 check (initial_qty >= 0),
  current_qty int not null default 0 check (current_qty >= 0),
  price_ht numeric(10, 2),
  unit_price numeric(10, 2),
  comment text,
  created_at timestamptz not null default now(),
  created_by text not null default 'Système',
  updated_at timestamptz,
  updated_by text
);

create index idx_lots_product on lots(product_id);
create index idx_lots_expiry on lots(expiry_date);

alter table lots enable row level security;

create policy "lecture publique" on lots
  for select to anon, authenticated using (true);

-- Démo sans authentification : l'écriture est ouverte, à restreindre
-- dès qu'un fournisseur d'identité est branché.
create policy "ecriture demo" on lots
  for insert to anon, authenticated with check (true);
create policy "mise a jour demo" on lots
  for update to anon, authenticated using (true) with check (true);

/* Vue de travail : rang FEFO calculé parmi les lots encore utilisables
   (non périmés, stock restant), le plus proche de la péremption d'abord. */
create view lots_view with (security_invoker = true) as
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
      order by l.expiry_date, l.id
    )
  end as fefo_rank
from lots l
join products p on p.id = l.product_id
join categories c on c.id = p.category_id
join suppliers s on s.id = p.supplier_id;
