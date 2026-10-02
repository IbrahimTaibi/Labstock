/* §4 — « règle centrale » : un B.C. ne regroupe que des D.A. validées dont
   le fournisseur proposé est le sien.

   L'écran filtre déjà le réservoir sur le fournisseur choisi, mais un filtre
   d'affichage n'est pas une règle : une ligne pouvait être insérée avec une
   D.A. d'un autre fournisseur, ou encore en attente, par tout autre chemin.
   Le contrôle rejoint donc le déclencheur qui garantit déjà l'engagement
   unique, pour que les deux conditions sur la D.A. vivent au même endroit. */

create or replace function public.guard_request_single_order()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_request record;
  v_order_supplier int;
begin
  if new.request_id is null then
    return new;
  end if;

  perform pg_advisory_xact_lock(hashtext('purchase_request_engagement'), new.request_id);

  select status, supplier_id, number into v_request
  from purchase_requests where id = new.request_id;
  select supplier_id into v_order_supplier
  from purchase_orders where id = new.order_id;

  /* À la validation du B.C., la D.A. passe « converted » : ce n'est pas une
     violation, c'est l'aboutissement. On ne contrôle donc le statut qu'à
     l'entrée de la D.A. dans le panier. */
  if tg_op = 'INSERT' and v_request.status <> 'approved' then
    raise exception
      'La demande % n''est pas validée : elle ne peut pas rejoindre un bon de commande.',
      v_request.number;
  end if;

  if v_request.supplier_id is distinct from v_order_supplier then
    raise exception
      'La demande % concerne un autre fournisseur que ce bon de commande.',
      v_request.number;
  end if;

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
