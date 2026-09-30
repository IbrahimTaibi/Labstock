/* Inventaire analytique : seuils par article et calcul des indicateurs.

   Les seuils étaient jusqu'ici réduits à `min_stock`. Le cahier des charges
   en demande quatre, paramétrables par article, parce qu'ils ne décrivent
   pas la même chose :
     safety_stock (SDS)  tampon intouchable — en dessous, c'est la rupture
     alert_stock  (SDA)  déclencheur de réapprovisionnement
     min_stock           borne basse de la plage saine (déjà présent)
     max_stock           borne haute — au-delà, sur-stock immobilisé */

alter table products
  add column safety_stock int not null default 0 check (safety_stock >= 0),
  add column alert_stock  int not null default 0 check (alert_stock >= 0),
  add column max_stock    int not null default 0 check (max_stock >= 0);

/* Initialisation depuis l'existant : le seuil minimum connu sert de socle.
   Des valeurs nulles partout rendraient tous les articles « sains » et
   l'écran inexploitable dès la première ouverture. */
update products
set safety_stock = greatest(min_stock, 0),
    alert_stock  = greatest(round(min_stock * 1.5)::int, 0),
    max_stock    = greatest(min_stock * 4, 1);

comment on column products.safety_stock is 'Stock de sécurité (SDS) : en dessous, rupture.';
comment on column products.alert_stock is 'Stock d''alerte (SDA) : déclenche le réapprovisionnement.';
comment on column products.max_stock is 'Stock maximum : au-delà, sur-stock.';

-- Emplacement physique du lot (§8.5 : traçabilité FEFO avec localisation).
alter table lots add column location text;
comment on column lots.location is 'Emplacement physique, ex. A1-S01.';

/* Indicateurs analytiques par article.

   SECURITY INVOKER : le RLS des tables sources cadre déjà au laboratoire de
   l'appelant, inutile d'ajouter un filtre qui pourrait diverger.

   `p_days_long` sert au taux de couverture ; `p_days_short` alimente la CMJ
   courte affichée à côté. La rotation porte sur la fenêtre longue, pour ne
   pas qualifier un article de « lent » sur la foi d'une semaine creuse. */
create or replace function public.inventory_analytics(
  p_days_long int default 90,
  p_days_short int default 30
)
returns table (
  product_id int,
  reference text,
  product_name text,
  category text,
  supplier text,
  packaging text,
  stock_initial int,
  entries int,
  exits int,
  stock_final int,
  stock_average numeric,
  cmj_short numeric,
  cmj_long numeric,
  coverage_days numeric,
  rotation numeric,
  cump numeric,
  stock_value numeric,
  safety_stock int,
  alert_stock int,
  min_stock int,
  max_stock int,
  status text,
  order_quantity int,
  order_value numeric
)
language sql
stable
set search_path = public
as $$
with bounds as (
  select
    greatest(coalesce(p_days_long, 90), 1) as days_long,
    greatest(coalesce(p_days_short, 30), 1) as days_short
),
moves as (
  select
    m.product_id,
    sum(m.quantity) filter (
      where m.type = 'in'
        and m.moved_at > current_date - (select days_long from bounds)
    ) as entries,
    sum(m.quantity) filter (
      where m.type = 'out'
        and m.moved_at > current_date - (select days_long from bounds)
    ) as exits_long,
    sum(m.quantity) filter (
      where m.type = 'out'
        and m.moved_at > current_date - (select days_short from bounds)
    ) as exits_short
  from stock_movements m
  group by m.product_id
),
/* CUMP réel : moyenne des prix d'achat pondérée par les quantités
   effectivement reçues. Les réceptions contre-passées sont exclues — elles
   n'ont rien fait entrer, leur prix ne doit pas peser dans la moyenne. */
cost as (
  select
    grl.product_id,
    sum(grl.quantity * grl.unit_price) / nullif(sum(grl.quantity), 0) as cump
  from goods_receipt_lines grl
  join goods_receipts gr on gr.id = grl.receipt_id
  where gr.reversed_at is null
  group by grl.product_id
),
base as (
  select
    p.id,
    coalesce(p.reference, 'REF-' || lpad(p.id::text, 6, '0')) as reference,
    p.name,
    c.name as category,
    s.name as supplier,
    p.stock_qty as stock_final,
    coalesce(mv.entries, 0)::int as entries,
    coalesce(mv.exits_long, 0)::int as exits,
    coalesce(mv.exits_short, 0)::int as exits_short,
    p.safety_stock,
    p.alert_stock,
    p.min_stock,
    p.max_stock,
    coalesce(ct.cump, p.unit_price) as cump,
    /* Le conditionnement n'est pas porté par l'article mais par ses lots :
       on retient celui du lot le plus récemment enregistré. */
    pk.packaging
  from products p
  join categories c on c.id = p.category_id
  join suppliers s on s.id = p.supplier_id
  left join moves mv on mv.product_id = p.id
  left join cost ct on ct.product_id = p.id
  left join lateral (
    select l.packaging
    from lots l
    where l.product_id = p.id and l.packaging is not null
    order by l.created_at desc, l.id desc
    limit 1
  ) pk on true
),
computed as (
  select
    b.*,
    /* Le stock de début de période se reconstitue à rebours : on retire les
       entrées et on rend les sorties au stock d'aujourd'hui. */
    greatest(b.stock_final - b.entries + b.exits, 0) as stock_initial,
    (select days_long from bounds) as days_long,
    (select days_short from bounds) as days_short
  from base b
)
select
  c.id,
  c.reference,
  c.name,
  c.category,
  c.supplier,
  c.packaging,
  c.stock_initial,
  c.entries,
  c.exits,
  c.stock_final,
  round((c.stock_initial + c.stock_final) / 2.0, 2) as stock_average,
  round(c.exits_short::numeric / c.days_short, 3) as cmj_short,
  round(c.exits::numeric / c.days_long, 3) as cmj_long,
  /* Sans consommation, l'autonomie n'est pas « infinie » mais indéfinie :
     null se distingue à l'affichage, 0 ou 9999 mentiraient. */
  case
    when c.exits = 0 then null
    else round(c.stock_final / (c.exits::numeric / c.days_long), 1)
  end as coverage_days,
  case
    when (c.stock_initial + c.stock_final) = 0 then null
    else round(c.exits / ((c.stock_initial + c.stock_final) / 2.0), 2)
  end as rotation,
  round(c.cump, 3) as cump,
  round(c.stock_final * c.cump, 2) as stock_value,
  c.safety_stock,
  c.alert_stock,
  c.min_stock,
  c.max_stock,
  case
    when c.stock_final <= c.safety_stock then 'rupture'
    when c.stock_final <= c.alert_stock then 'alerte'
    when c.max_stock > 0 and c.stock_final > c.max_stock then 'surstock'
    else 'sain'
  end as status,
  /* On ne propose une commande que lorsque le seuil d'alerte est franchi :
     recompléter en permanence jusqu'au maximum immobiliserait la trésorerie
     et gonflerait le risque de péremption. */
  case
    when c.stock_final <= c.alert_stock
      then greatest(c.max_stock - c.stock_final, 0)
    else 0
  end as order_quantity,
  round(
    case
      when c.stock_final <= c.alert_stock
        then greatest(c.max_stock - c.stock_final, 0)
      else 0
    end * c.cump,
    2
  ) as order_value
from computed c
order by c.name;
$$;

revoke all on function public.inventory_analytics(int, int) from public, anon;
grant execute on function public.inventory_analytics(int, int) to authenticated;

/* Sorties quotidiennes agrégées, pour la courbe d'évolution (§6.3). */
create or replace function public.inventory_exits_series(p_days int default 30)
returns table (day date, quantity int)
language sql
stable
set search_path = public
as $$
  select d::date as day,
         coalesce(sum(m.quantity) filter (where m.type = 'out'), 0)::int
  from generate_series(
         current_date - greatest(coalesce(p_days, 30), 1) + 1,
         current_date,
         interval '1 day'
       ) d
  left join stock_movements m on m.moved_at = d::date
  group by d
  order by d;
$$;

revoke all on function public.inventory_exits_series(int) from public, anon;
grant execute on function public.inventory_exits_series(int) to authenticated;
