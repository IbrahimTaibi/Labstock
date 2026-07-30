/* Outil interne : tout le personnel authentifié voit l'ensemble du stock.
   Il n'y a pas de propriété par utilisateur sur ces données, la lecture
   est donc volontairement globale — mais fermée aux visiteurs anonymes. */

drop policy if exists "lecture publique" on categories;
drop policy if exists "lecture publique" on suppliers;
drop policy if exists "lecture publique" on products;
drop policy if exists "lecture publique" on invoices;
drop policy if exists "lecture publique" on stock_movements;
drop policy if exists "lecture publique" on lots;
drop policy if exists "ecriture demo" on lots;
drop policy if exists "mise a jour demo" on lots;

create policy "lecture authentifiee" on categories
  for select to authenticated using (true);
create policy "lecture authentifiee" on suppliers
  for select to authenticated using (true);
create policy "lecture authentifiee" on products
  for select to authenticated using (true);
create policy "lecture authentifiee" on invoices
  for select to authenticated using (true);
create policy "lecture authentifiee" on stock_movements
  for select to authenticated using (true);
create policy "lecture authentifiee" on lots
  for select to authenticated using (true);

create policy "creation authentifiee" on lots
  for insert to authenticated with check (true);
create policy "modification authentifiee" on lots
  for update to authenticated using (true) with check (true);

-- Le tableau de bord n'est plus accessible sans session
revoke execute on function public.dashboard() from anon;
grant execute on function public.dashboard() to authenticated;
