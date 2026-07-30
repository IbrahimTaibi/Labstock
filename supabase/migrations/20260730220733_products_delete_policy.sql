-- Page Produits : suppression possible, cadrée au laboratoire.
-- Les FK (lots, mouvements, commandes, sorties, inventaires) bloquent
-- d'elles-mêmes la suppression d'un produit avec un historique.
grant delete on public.products to authenticated;

create policy "suppression par laboratoire" on public.products
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));
