/* Une D.A. libérée par annulation doit pouvoir rejoindre un nouveau B.C.

   §10.6 interdit le double engagement : une D.A. ne peut figurer que dans un
   seul bon de commande à la fois. L'index unique sur `request_id` le
   traduisait trop largement — il comptait aussi les B.C. annulés.

   Conséquence : cancel_purchase_order() remettait bien les D.A. au statut
   « Validée », mais la ligne du B.C. annulé conservait leur `request_id`,
   et l'index refusait ensuite de les verser dans un autre panier. Les
   demandes étaient libérées en apparence et bloquées en pratique.

   Un index ne peut pas voir le cycle de vie de la commande, qui vit dans une
   autre table : la règle passe dans un déclencheur. On garde volontairement
   le `request_id` sur les lignes annulées — effacer ce lien ferait perdre la
   trace de ce que la commande annulée contenait. */

drop index if exists purchase_order_lines_request_key;

/* L'index reste utile pour la recherche, sans contrainte d'unicité. */
create index purchase_order_lines_request_idx
  on purchase_order_lines (request_id)
  where request_id is not null;

create or replace function public.guard_request_single_order()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.request_id is null then
    return new;
  end if;

  /* Sérialise les engagements d'une même D.A. : deux paniers ouverts en
     parallèle pourraient sinon la revendiquer en même temps. */
  perform pg_advisory_xact_lock(hashtext('purchase_request_engagement'), new.request_id);

  if exists (
    select 1
    from purchase_order_lines l
    join purchase_orders o on o.id = l.order_id
    where l.request_id = new.request_id
      and l.id is distinct from new.id
      and o.lifecycle <> 'cancelled'
  ) then
    raise exception
      'Cette demande d''achat figure déjà dans un autre bon de commande.';
  end if;

  return new;
end;
$$;

create trigger purchase_order_lines_single_order
  before insert or update of request_id on purchase_order_lines
  for each row execute function public.guard_request_single_order();
