-- Page Marchandises : suppression d'un lot, cadrée au laboratoire.
--
-- Les FK portent déjà la règle métier et n'ont pas à être relâchées :
--   inventory_lines.lot_id  on delete restrict -> un lot compté est figé
--   stock_issue_lines       on delete set null -> la sortie survit au lot
--   goods_receipt_lines     on delete set null -> la réception survit au lot
-- Autrement dit, un lot entré dans un comptage d'inventaire n'est plus
-- supprimable : la traçabilité ISO 15189 prime sur le ménage.
grant delete on public.lots to authenticated;

create policy "suppression par laboratoire" on public.lots
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));
