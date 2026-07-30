-- RLS par laboratoire. Tout le monde — admin compris — est cadré sur
-- current_lab_id() : l'admin change de laboratoire via active_lab_id,
-- les requêtes applicatives restent identiques pour tous les rôles.

-- Purge des anciennes politiques « tout authentifié ».
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename not in ('laboratories', 'profiles')
  loop
    execute format('drop policy %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'categories', 'suppliers', 'products', 'invoices', 'stock_movements',
    'lots', 'analyses', 'analysis_consumables', 'stock_issues',
    'stock_issue_lines', 'lis_orders', 'purchase_orders',
    'purchase_order_lines', 'goods_receipts', 'goods_receipt_lines',
    'inventory_sessions', 'inventory_lines'
  ] loop
    execute format(
      'create policy "lecture par laboratoire" on public.%I
         for select to authenticated
         using (lab_id = (select public.current_lab_id()))', t);
    execute format(
      'create policy "creation par laboratoire" on public.%I
         for insert to authenticated
         with check (lab_id = (select public.current_lab_id()))', t);
    execute format(
      'create policy "modification par laboratoire" on public.%I
         for update to authenticated
         using (lab_id = (select public.current_lab_id()))
         with check (lab_id = (select public.current_lab_id()))', t);
  end loop;
end $$;

-- Laboratoires : visibles par leurs membres, gérés par l'admin.
create policy "lecture de son laboratoire" on public.laboratories
  for select to authenticated
  using (id = (select public.current_lab_id()) or (select public.is_admin()));
create policy "creation par l'admin" on public.laboratories
  for insert to authenticated
  with check ((select public.is_admin()));
create policy "modification par l'admin" on public.laboratories
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));
create policy "suppression par l'admin" on public.laboratories
  for delete to authenticated
  using ((select public.is_admin()));

-- Profils : chacun lit le sien ; seul l'admin lit et gère les autres.
create policy "lecture de son profil" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_admin()));
create policy "gestion par l'admin" on public.profiles
  for update to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- Les RPC repassent en SECURITY INVOKER : le rôle applicatif doit pouvoir
-- écrire (le RLS ci-dessus limite chaque écriture au laboratoire courant).
grant select, insert, update on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
