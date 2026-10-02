/* Une réception ne vaut que pour une commande engagée.

   Le cycle de vie des B.C. introduit deux états qu'aucune réception ne doit
   toucher : « draft » (le panier n'a encore rien commandé) et « cancelled »
   (la commande ne livrera rien). L'écran des réceptions ne les propose plus,
   mais la règle doit tenir quel que soit le chemin d'écriture.

   Un déclencheur sur `goods_receipts` plutôt qu'une retouche de
   receive_goods() : la règle protège la table elle-même, et vaudra pour tout
   chemin futur sans qu'on ait à s'en souvenir. */

create or replace function public.guard_receipt_order_committed()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_lifecycle text;
  v_number text;
begin
  select lifecycle, number into v_lifecycle, v_number
  from purchase_orders where id = new.order_id;

  if v_lifecycle = 'draft' then
    raise exception
      'Le bon de commande % est encore en préparation : validez-le avant de le réceptionner.',
      v_number;
  end if;
  if v_lifecycle = 'cancelled' then
    raise exception
      'Le bon de commande % est annulé : aucune réception n''est possible.',
      v_number;
  end if;

  return new;
end;
$$;

create trigger goods_receipts_order_committed
  before insert on goods_receipts
  for each row execute function public.guard_receipt_order_committed();
