create or replace function public.dashboard()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
with mois as (
  select (date_trunc('month', now())::date - (interval '1 month' * g))::date as debut
  from generate_series(5, 0, -1) as g
),
bornes as (
  select debut,
         least((debut + interval '1 month' - interval '1 day')::date, current_date) as fin
  from mois
),
-- Reconstruction du stock à la fin de chaque mois à partir des mouvements
stock_hist as (
  select b.debut, b.fin, p.id as produit_id, p.stock_min, p.prix_unitaire,
         p.stock_actuel - coalesce((
           select sum(case when mv.type = 'entree' then mv.quantite else -mv.quantite end)
           from mouvements mv
           where mv.produit_id = p.id and mv.date_mouvement > b.fin
         ), 0) as stock
  from bornes b
  cross join produits p
),
kpi_hist as (
  select to_char(debut, 'YYYY-MM') as mois,
         count(*) filter (where stock > 0)::int as articles,
         sum(greatest(stock, 0))::int as unites,
         round(sum(greatest(stock, 0) * prix_unitaire))::numeric as valeur,
         count(*) filter (where stock > 0 and stock <= stock_min)::int as sous_seuil,
         count(*) filter (where stock <= 0)::int as rupture,
         count(*) filter (where stock > stock_min and stock <= stock_min * 2)::int as reappro
  from stock_hist
  group by debut
  order by debut
),
mvt_mois as (
  select to_char(date_trunc('month', mv.date_mouvement), 'YYYY-MM') as mois,
         sum(mv.quantite) filter (where mv.type = 'entree')::int as entrees,
         sum(mv.quantite) filter (where mv.type = 'sortie')::int as sorties,
         round(sum(mv.quantite * p.prix_unitaire) filter (where mv.type = 'entree'))::numeric as valeur_entrees,
         round(sum(mv.quantite * p.prix_unitaire) filter (where mv.type = 'sortie'))::numeric as valeur_sorties
  from mouvements mv
  join produits p on p.id = mv.produit_id
  where mv.date_mouvement >= (select min(debut) from mois)
  group by 1
  order by 1
),
fact_mois as (
  select to_char(date_trunc('month', date_emission), 'YYYY-MM') as mois,
         count(*)::int as nb,
         round(sum(montant))::numeric as montant
  from factures
  where date_emission >= (select min(debut) from mois)
  group by 1
  order by 1
),
-- Mouvements du mois en cours, par catégorie
mvt_cat as (
  select c.nom as categorie, mv.type,
         sum(mv.quantite)::int as quantite,
         round(sum(mv.quantite * p.prix_unitaire))::numeric as valeur
  from mouvements mv
  join produits p on p.id = mv.produit_id
  join categories c on c.id = p.categorie_id
  where mv.date_mouvement >= date_trunc('month', now())::date
  group by c.nom, mv.type
),
-- Produits sans aucune sortie depuis 90 jours = stock dormant
dormant as (
  select coalesce(round(sum(p.stock_actuel * p.prix_unitaire)), 0)::numeric as valeur,
         count(*)::int as nb
  from produits p
  where p.stock_actuel > 0
    and not exists (
      select 1 from mouvements mv
      where mv.produit_id = p.id
        and mv.type = 'sortie'
        and mv.date_mouvement >= current_date - interval '90 days'
    )
)
select jsonb_build_object(
  'kpiHist', (select coalesce(jsonb_agg(to_jsonb(k)), '[]'::jsonb) from kpi_hist k),
  'stockParCategorie', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select c.nom as categorie,
             count(p.id)::int as nb_produits,
             coalesce(sum(p.stock_actuel), 0)::int as unites,
             coalesce(round(sum(p.stock_actuel * p.prix_unitaire)), 0)::numeric as valeur
      from categories c
      left join produits p on p.categorie_id = c.id
      group by c.nom
      order by valeur desc
    ) t
  ),
  'etatFactures', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select statut, count(*)::int as nb, round(sum(montant))::numeric as montant
      from factures group by statut
    ) t
  ),
  'facturesParMois', (select coalesce(jsonb_agg(to_jsonb(f)), '[]'::jsonb) from fact_mois f),
  'mouvementsParMois', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from mvt_mois m),
  'mouvementsParCategorie', (select coalesce(jsonb_agg(to_jsonb(m)), '[]'::jsonb) from mvt_cat m),
  'topProduitsValeur', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.nom, c.nom as categorie, p.stock_actuel as stock,
             round(p.stock_actuel * p.prix_unitaire)::numeric as valeur
      from produits p join categories c on c.id = p.categorie_id
      order by p.stock_actuel * p.prix_unitaire desc
      limit 5
    ) t
  ),
  'topProduitsQuantite', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.nom, c.nom as categorie, p.stock_actuel as quantite,
             round(p.stock_actuel * p.prix_unitaire)::numeric as valeur
      from produits p join categories c on c.id = p.categorie_id
      order by p.stock_actuel desc, p.id
      limit 5
    ) t
  ),
  'topFournisseurs', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select f.nom as fournisseur, count(fa.id)::int as nb_factures,
             round(sum(fa.montant))::numeric as total,
             round(100.0 * sum(fa.montant) / nullif((select sum(montant) from factures), 0), 1)::numeric as part
      from fournisseurs f
      join factures fa on fa.fournisseur_id = f.id
      group by f.nom
      order by total desc
      limit 5
    ) t
  ),
  'produitsCritiques', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select p.nom, c.nom as categorie, p.stock_actuel as stock, p.stock_min,
             round(p.stock_actuel * p.prix_unitaire)::numeric as valeur,
             case when p.stock_actuel = 0 then 'rupture'
                  when p.stock_actuel <= p.stock_min then 'faible'
                  else 'rupture_proche' end as statut
      from produits p join categories c on c.id = p.categorie_id
      where p.stock_actuel <= p.stock_min
      order by p.stock_actuel, p.stock_actuel * p.prix_unitaire desc
      limit 8
    ) t
  ),
  'facturesEnRetard', (
    select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb) from (
      select fa.numero, f.nom as fournisseur, fa.date_echeance, fa.montant,
             (current_date - fa.date_echeance)::int as jours_retard
      from factures fa join fournisseurs f on f.id = fa.fournisseur_id
      where fa.statut = 'en_retard'
      order by fa.montant desc
      limit 8
    ) t
  ),
  'indicateurs', jsonb_build_object(
    'tauxDisponibilite', (
      select round(100.0 * count(*) filter (where stock_actuel > 0) / nullif(count(*), 0), 1) from produits
    ),
    'rotationStock', (
      select round(
        (sum(mv.quantite * p.prix_unitaire) * 2.0) / nullif((select sum(stock_actuel * prix_unitaire) from produits), 0)
      , 1)
      from mouvements mv join produits p on p.id = mv.produit_id
      where mv.type = 'sortie' and mv.date_mouvement >= current_date - interval '180 days'
    ),
    'delaiMoyenPaiement', (
      select round(avg(date_paiement - date_emission)) from factures where date_paiement is not null
    ),
    'stockDormantValeur', (select valeur from dormant),
    'stockDormantNb', (select nb from dormant)
  ),
  'alertes', jsonb_build_object(
    'sousSeuil', (select count(*)::int from produits where stock_actuel > 0 and stock_actuel <= stock_min),
    'rupture', (select count(*)::int from produits where stock_actuel = 0),
    'reappro', (select count(*)::int from produits where stock_actuel > stock_min and stock_actuel <= stock_min * 2),
    'facturesRetard', (select count(*)::int from factures where statut = 'en_retard')
  ),
  'periode', jsonb_build_object(
    'debut', (select min(debut) from mois),
    'fin', current_date
  )
)
$$;

revoke all on function public.dashboard() from public;
grant execute on function public.dashboard() to anon, authenticated;
