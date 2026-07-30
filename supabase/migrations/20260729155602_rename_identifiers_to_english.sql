-- Les vues de reporting sont remplacées par la fonction dashboard()
drop view if exists v_stock_par_categorie, v_stock_evolution, v_etat_factures,
  v_factures_par_mois, v_mouvements_par_mois, v_mouvements_categorie_mois,
  v_top_fournisseurs_factures;
drop function if exists public.dashboard();

alter table fournisseurs rename to suppliers;
alter table produits rename to products;
alter table factures rename to invoices;
alter table mouvements rename to stock_movements;

alter table categories rename column nom to name;
alter table suppliers rename column nom to name;

alter table products rename column nom to name;
alter table products rename column categorie_id to category_id;
alter table products rename column fournisseur_id to supplier_id;
alter table products rename column prix_unitaire to unit_price;
alter table products rename column stock_actuel to stock_qty;
alter table products rename column stock_min to min_stock;

alter table invoices rename column numero to number;
alter table invoices rename column fournisseur_id to supplier_id;
alter table invoices rename column montant to amount;
alter table invoices rename column statut to status;
alter table invoices rename column date_emission to issue_date;
alter table invoices rename column date_echeance to due_date;
alter table invoices rename column date_paiement to payment_date;

alter table stock_movements rename column produit_id to product_id;
alter table stock_movements rename column quantite to quantity;
alter table stock_movements rename column date_mouvement to moved_at;

-- Valeurs d'énumération en anglais
alter table invoices drop constraint factures_statut_check;
update invoices set status = case status
  when 'payee' then 'paid'
  when 'en_attente' then 'pending'
  else 'overdue' end;
alter table invoices add constraint invoices_status_check
  check (status in ('paid', 'pending', 'overdue'));

alter table stock_movements drop constraint mouvements_type_check;
update stock_movements set type = case type when 'entree' then 'in' else 'out' end;
alter table stock_movements add constraint stock_movements_type_check
  check (type in ('in', 'out'));
