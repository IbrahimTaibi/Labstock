-- Référence catalogue au niveau produit (code consommable)
alter table products add column if not exists reference text unique;

-- Catalogue des analyses prescriptibles
create table analyses (
  id serial primary key,
  code text not null unique,
  name text not null,
  section text not null
);

/* Coefficient de consommation : quantité de consommable par test.
   La clé primaire empêche de déclarer deux fois le même couple. */
create table analysis_consumables (
  analysis_id int not null references analyses(id) on delete cascade,
  product_id int not null references products(id) on delete restrict,
  coefficient numeric(10, 4) not null check (coefficient > 0),
  primary key (analysis_id, product_id)
);

-- Sorties de stock enregistrées (en-tête)
create table stock_issues (
  id serial primary key,
  source text not null,
  mode text not null check (mode in ('automatic', 'manual')),
  operator text not null,
  issued_at timestamptz not null default now(),
  total_analyses int not null default 0,
  total_samples int not null default 0,
  total_references int not null default 0,
  total_quantity int not null default 0
);

create table stock_issue_lines (
  id serial primary key,
  issue_id int not null references stock_issues(id) on delete cascade,
  product_id int not null references products(id) on delete restrict,
  lot_id int references lots(id) on delete set null,
  quantity int not null check (quantity > 0)
);
create index idx_issue_lines_issue on stock_issue_lines(issue_id);

/* Analyses prescrites importées du logiciel de laboratoire.
   `status` passe à 'consumed' une fois la sortie enregistrée, ce qui évite
   de déduire deux fois le même lot d'analyses. */
create table lis_orders (
  id serial primary key,
  batch_ref text not null,
  analysis_id int not null references analyses(id) on delete restrict,
  sample_count int not null check (sample_count > 0),
  status text not null default 'pending' check (status in ('pending', 'consumed')),
  imported_at timestamptz not null default now(),
  issue_id int references stock_issues(id) on delete set null
);
create index idx_lis_orders_status on lis_orders(status);

alter table analyses enable row level security;
alter table analysis_consumables enable row level security;
alter table stock_issues enable row level security;
alter table stock_issue_lines enable row level security;
alter table lis_orders enable row level security;

create policy "lecture authentifiee" on analyses
  for select to authenticated using (true);
create policy "lecture authentifiee" on analysis_consumables
  for select to authenticated using (true);
create policy "lecture authentifiee" on stock_issues
  for select to authenticated using (true);
create policy "lecture authentifiee" on stock_issue_lines
  for select to authenticated using (true);
create policy "lecture authentifiee" on lis_orders
  for select to authenticated using (true);
