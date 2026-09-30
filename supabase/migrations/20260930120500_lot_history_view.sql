/* Historique complet d'un lot (§5.5 du cahier des charges).

   Le lot n'a pas de journal dédié : sa vie est déjà écrite dans les tables
   qui le touchent. Plutôt que de dupliquer un audit log — qui pourrait
   diverger du réel — on recompose la chronologie à la lecture.

   `stock_movements` est volontairement absent : cette table est agrégée au
   produit, pas au lot, et ne saurait pas dire *quel* lot a bougé. */
create view lot_history_view with (security_invoker = true) as

-- Création du lot
select
  l.id            as lot_id,
  l.lab_id        as lab_id,
  'created'::text as kind,
  l.created_at    as occurred_at,
  l.created_by    as actor,
  l.initial_qty   as quantity,
  null::text      as reference
from lots l

union all

-- Dernière modification déclarée sur la fiche
select l.id, l.lab_id, 'updated', l.updated_at, l.updated_by, null::int, null::text
from lots l
where l.updated_at is not null

union all

-- Entrées : réceptions de commande fournisseur
select
  gl.lot_id, gl.lab_id, 'receipt', g.received_at, g.operator, gl.quantity,
  'Réception n° ' || g.id
from goods_receipt_lines gl
join goods_receipts g on g.id = gl.receipt_id
where gl.lot_id is not null

union all

-- Sorties : consommation pour analyses
select
  sl.lot_id, sl.lab_id, 'issue', s.issued_at, s.operator, -sl.quantity,
  'Sortie n° ' || s.id
from stock_issue_lines sl
join stock_issues s on s.id = sl.issue_id
where sl.lot_id is not null

union all

-- Comptages d'inventaire : on retient l'écart constaté, pas le comptage brut
select
  il.lot_id, il.lab_id, 'count', il.counted_at, il.counted_by,
  il.counted_qty - il.expected_qty,
  'Inventaire n° ' || il.session_id
from inventory_lines il
where il.counted_at is not null;

/* Le `grant ... on all tables` de la migration des politiques par
   laboratoire était un instantané : il ne couvre pas les objets créés
   après lui. La vue a donc besoin de son propre droit de lecture.
   `security_invoker` fait que le RLS des tables sources s'applique
   toujours à l'appelant : ce grant n'ouvre rien de plus. */
grant select on public.lot_history_view to authenticated;
