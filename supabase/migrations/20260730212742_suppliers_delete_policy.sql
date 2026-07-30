-- Page Fournisseurs : la suppression devient possible, cadrée au laboratoire.
-- Les contraintes FK (produits, commandes, factures) bloquent d'elles-mêmes
-- la suppression d'un fournisseur encore référencé.
grant delete on public.suppliers to authenticated;

create policy "suppression par laboratoire" on public.suppliers
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));
