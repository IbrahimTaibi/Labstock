-- Chaque donnée métier appartient à un laboratoire. Le défaut
-- current_lab_id() estampille automatiquement les insertions applicatives.

do $$
declare
  t text;
  v_lab integer := (select min(id) from public.laboratories);
begin
  foreach t in array array[
    'categories', 'suppliers', 'products', 'invoices', 'stock_movements',
    'lots', 'analyses', 'analysis_consumables', 'stock_issues',
    'stock_issue_lines', 'lis_orders', 'purchase_orders',
    'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'inventory_sessions', 'inventory_lines'
  ] loop
    execute format('alter table public.%I add column lab_id integer', t);
    execute format('update public.%I set lab_id = %s', t, v_lab);
    execute format(
      'alter table public.%I
         alter column lab_id set not null,
         alter column lab_id set default public.current_lab_id(),
         add constraint %I foreign key (lab_id) references public.laboratories (id)',
      t, t || '_lab_id_fkey');
    execute format('create index %I on public.%I (lab_id)', t || '_lab_id_idx', t);
  end loop;
end $$;

-- Les unicités globales deviennent des unicités par laboratoire :
-- deux laboratoires peuvent utiliser le même numéro de lot ou de facture.
alter table public.categories
  drop constraint categories_nom_key,
  add constraint categories_lab_name_key unique (lab_id, name);
alter table public.suppliers
  drop constraint fournisseurs_nom_key,
  add constraint suppliers_lab_name_key unique (lab_id, name);
alter table public.products
  drop constraint products_reference_key,
  add constraint products_lab_reference_key unique (lab_id, reference);
alter table public.invoices
  drop constraint factures_numero_key,
  add constraint invoices_lab_number_key unique (lab_id, number);
alter table public.lots
  drop constraint lots_lot_number_key,
  add constraint lots_lab_lot_number_key unique (lab_id, lot_number);
alter table public.analyses
  drop constraint analyses_code_key,
  add constraint analyses_lab_code_key unique (lab_id, code);
alter table public.purchase_orders
  drop constraint purchase_orders_number_key,
  add constraint purchase_orders_lab_number_key unique (lab_id, number);
alter table public.inventory_sessions
  drop constraint inventory_sessions_reference_key,
  add constraint inventory_sessions_lab_reference_key unique (lab_id, reference);
