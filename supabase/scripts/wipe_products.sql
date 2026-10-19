/* Suppression de tous les articles du laboratoire.

   À exécuter une fois dans l'éditeur SQL Supabase (rôle postgres).
   Tout se fait dans une transaction : en cas d'erreur, rien n'est modifié.

   Laboratoire cible : le premier laboratoire (min(id)). Pour en viser un
   autre, remplacer la ligne `v_lab := ...` ci-dessous.

   Avec les articles partent tout ce qui les référence : lots, mouvements,
   lignes de sortie, de commande, de réception, d'inventaire, coefficients
   d'analyses et demandes d'achat. Les lignes de facture sont conservées
   (montants intacts) mais détachées de l'article. Les en-têtes (commandes,
   réceptions, sorties, inventaires) restent, vides. Catégories et
   fournisseurs ne sont pas touchés. */

begin;

do $$
declare
  v_lab integer := (select min(id) from public.laboratories);
  v_deleted integer;
begin
  if v_lab is null then
    raise exception 'Aucun laboratoire trouvé.';
  end if;

  create temp table _old on commit drop as
    select id from public.products where lab_id = v_lab;
  create temp table _old_lots on commit drop as
    select id from public.lots where product_id in (select id from _old);

  update public.invoice_lines set product_id = null
  where product_id in (select id from _old);

  delete from public.inventory_lines
  where product_id in (select id from _old) or lot_id in (select id from _old_lots);
  delete from public.stock_issue_lines where product_id in (select id from _old);
  delete from public.analysis_consumables where product_id in (select id from _old);
  delete from public.goods_receipt_lines where product_id in (select id from _old);

  /* Le déclencheur « brouillon uniquement » interdit de toucher aux lignes
     d'une commande validée ; il est suspendu le temps de la purge. */
  alter table public.purchase_order_lines
    disable trigger purchase_order_lines_draft_only;
  delete from public.purchase_order_lines where product_id in (select id from _old);
  alter table public.purchase_order_lines
    enable trigger purchase_order_lines_draft_only;

  delete from public.purchase_requests where product_id in (select id from _old);
  delete from public.stock_movements where product_id in (select id from _old);
  delete from public.lots where id in (select id from _old_lots);
  delete from public.products where id in (select id from _old);
  get diagnostics v_deleted = row_count;

  raise notice '% articles supprimés (laboratoire %).', v_deleted, v_lab;
end $$;

commit;
