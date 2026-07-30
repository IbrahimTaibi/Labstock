-- Page Paramètres : gestion des catégories, suppression comprise.
-- Les FK (produits, comptages) bloquent la suppression d'une catégorie utilisée.
grant delete on public.categories to authenticated;

create policy "suppression par laboratoire" on public.categories
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));
