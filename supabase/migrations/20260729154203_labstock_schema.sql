-- Schéma LABSTOCK : stock & factures de laboratoire

create table categories (
  id serial primary key,
  nom text not null unique
);

create table fournisseurs (
  id serial primary key,
  nom text not null unique
);

create table produits (
  id serial primary key,
  nom text not null,
  categorie_id int not null references categories(id),
  fournisseur_id int not null references fournisseurs(id),
  prix_unitaire numeric(10,2) not null,
  stock_actuel int not null default 0,
  stock_min int not null default 5,
  created_at timestamptz not null default now()
);
create index idx_produits_categorie on produits(categorie_id);
create index idx_produits_fournisseur on produits(fournisseur_id);

create table factures (
  id serial primary key,
  numero text not null unique,
  fournisseur_id int not null references fournisseurs(id),
  montant numeric(12,2) not null,
  statut text not null check (statut in ('payee','en_attente','en_retard')),
  date_emission date not null,
  date_echeance date not null
);
create index idx_factures_fournisseur on factures(fournisseur_id);
create index idx_factures_emission on factures(date_emission);

create table mouvements (
  id serial primary key,
  produit_id int not null references produits(id),
  type text not null check (type in ('entree','sortie')),
  quantite int not null check (quantite > 0),
  date_mouvement date not null
);
create index idx_mouvements_produit on mouvements(produit_id);
create index idx_mouvements_date on mouvements(date_mouvement);

-- RLS : tableau de bord en lecture seule
alter table categories enable row level security;
alter table fournisseurs enable row level security;
alter table produits enable row level security;
alter table factures enable row level security;
alter table mouvements enable row level security;

create policy "lecture publique" on categories for select to anon, authenticated using (true);
create policy "lecture publique" on fournisseurs for select to anon, authenticated using (true);
create policy "lecture publique" on produits for select to anon, authenticated using (true);
create policy "lecture publique" on factures for select to anon, authenticated using (true);
create policy "lecture publique" on mouvements for select to anon, authenticated using (true);

-- Vues de reporting (security_invoker pour respecter la RLS)

create view v_stock_par_categorie with (security_invoker = true) as
select c.id, c.nom as categorie,
       count(p.id)::int as nb_produits,
       coalesce(sum(p.stock_actuel), 0)::int as unites,
       coalesce(sum(p.stock_actuel * p.prix_unitaire), 0)::numeric(14,2) as valeur
from categories c
left join produits p on p.categorie_id = c.id
group by c.id, c.nom
order by c.nom;

create view v_stock_evolution with (security_invoker = true) as
with mois as (
  select date_trunc('month', now())::date - (interval '1 month' * g) as debut
  from generate_series(5, 0, -1) as g
),
valeur_actuelle as (
  select coalesce(sum(stock_actuel * prix_unitaire), 0) as v from produits
),
net_apres as (
  select m.debut,
         coalesce(sum(case when mv.type = 'entree' then mv.quantite else -mv.quantite end * p.prix_unitaire)
                  filter (where mv.date_mouvement > (m.debut + interval '1 month' - interval '1 day')::date), 0) as net
  from mois m
  cross join mouvements mv
  join produits p on p.id = mv.produit_id
  group by m.debut
)
select to_char(m.debut, 'YYYY-MM') as mois,
       greatest(0, (va.v - coalesce(na.net, 0)))::numeric(14,2) as valeur
from mois m
cross join valeur_actuelle va
left join net_apres na on na.debut = m.debut
order by m.debut;

create view v_etat_factures with (security_invoker = true) as
select statut, count(*)::int as nb, sum(montant)::numeric(14,2) as montant
from factures
group by statut;

create view v_factures_par_mois with (security_invoker = true) as
select to_char(date_trunc('month', date_emission), 'YYYY-MM') as mois,
       count(*)::int as nb,
       sum(montant)::numeric(14,2) as montant
from factures
where date_emission >= date_trunc('month', now())::date - interval '5 months'
group by 1
order by 1;

create view v_mouvements_par_mois with (security_invoker = true) as
select to_char(date_trunc('month', mv.date_mouvement), 'YYYY-MM') as mois,
       sum(case when mv.type = 'entree' then mv.quantite else 0 end)::int as entrees,
       sum(case when mv.type = 'sortie' then mv.quantite else 0 end)::int as sorties,
       sum(case when mv.type = 'entree' then mv.quantite * p.prix_unitaire else 0 end)::numeric(14,2) as valeur_entrees,
       sum(case when mv.type = 'sortie' then mv.quantite * p.prix_unitaire else 0 end)::numeric(14,2) as valeur_sorties
from mouvements mv
join produits p on p.id = mv.produit_id
where mv.date_mouvement >= date_trunc('month', now())::date - interval '5 months'
group by 1
order by 1;

create view v_mouvements_categorie_mois with (security_invoker = true) as
select c.nom as categorie, mv.type,
       sum(mv.quantite)::int as quantite,
       sum(mv.quantite * p.prix_unitaire)::numeric(14,2) as valeur
from mouvements mv
join produits p on p.id = mv.produit_id
join categories c on c.id = p.categorie_id
where mv.date_mouvement >= date_trunc('month', now())::date
group by c.nom, mv.type;

create view v_top_fournisseurs_factures with (security_invoker = true) as
select f.nom as fournisseur,
       count(fa.id)::int as nb_factures,
       sum(fa.montant)::numeric(14,2) as total
from fournisseurs f
join factures fa on fa.fournisseur_id = f.id
group by f.nom
order by total desc;
