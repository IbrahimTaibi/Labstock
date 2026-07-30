/* Les régularisations d'inventaire restent des mouvements 'in'/'out' — elles
   modifient réellement le stock, donc la reconstruction d'historique doit les
   compter. Le drapeau permet en revanche de les exclure des indicateurs
   « entrées / sorties du mois », qui décrivent des flux réels et non des
   corrections de comptage. */
alter table stock_movements
  add column is_adjustment boolean not null default false;

create table inventory_sessions (
  id serial primary key,
  reference text not null unique,
  scope text not null check (scope in ('full', 'category')),
  category_id int references categories(id) on delete restrict,
  status text not null default 'open'
    check (status in ('open', 'closed', 'cancelled')),
  opened_at timestamptz not null default now(),
  opened_by text not null,
  closed_at timestamptz,
  closed_by text,
  counted_lines int not null default 0,
  variance_units int not null default 0,
  variance_value numeric(12, 2) not null default 0,
  constraint category_required_when_scoped
    check (scope = 'full' or category_id is not null)
);

/* Un seul comptage ouvert à la fois : deux sessions concurrentes
   compareraient leurs écarts au même stock et se neutraliseraient. */
create unique index idx_one_open_session
  on inventory_sessions ((status)) where status = 'open';

create table inventory_lines (
  id serial primary key,
  session_id int not null references inventory_sessions(id) on delete cascade,
  lot_id int not null references lots(id) on delete restrict,
  product_id int not null references products(id) on delete restrict,
  /* Quantité figée à l'ouverture : on compare le comptage à ce qu'on croyait
     détenir à cet instant, pas à un stock qui bouge pendant le comptage. */
  expected_qty int not null,
  counted_qty int check (counted_qty >= 0),
  unit_price numeric(10, 4) not null,
  counted_at timestamptz,
  counted_by text,
  unique (session_id, lot_id)
);
create index idx_inventory_lines_session on inventory_lines(session_id);

alter table inventory_sessions enable row level security;
alter table inventory_lines enable row level security;

create policy "lecture authentifiee" on inventory_sessions
  for select to authenticated using (true);
create policy "lecture authentifiee" on inventory_lines
  for select to authenticated using (true);

create view inventory_lines_view with (security_invoker = true) as
select
  il.id,
  il.session_id,
  il.lot_id,
  il.product_id,
  p.name as product_name,
  coalesce(p.reference, 'REF-' || lpad(p.id::text, 6, '0')) as reference,
  c.name as category,
  l.lot_number,
  l.expiry_date,
  il.expected_qty,
  il.counted_qty,
  il.unit_price,
  il.counted_at,
  il.counted_by,
  (il.counted_qty is not null) as is_counted,
  case when il.counted_qty is null then null
       else il.counted_qty - il.expected_qty end as variance_units,
  case when il.counted_qty is null then null
       else round((il.counted_qty - il.expected_qty) * il.unit_price, 2) end
    as variance_value
from inventory_lines il
join lots l on l.id = il.lot_id
join products p on p.id = il.product_id
join categories c on c.id = p.category_id;
