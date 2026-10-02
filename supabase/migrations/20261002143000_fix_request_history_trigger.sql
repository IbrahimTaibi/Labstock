/* L'historisation doit pouvoir écrire ce que l'utilisateur ne peut pas.

   §9.2 exige un historique non modifiable : INSERT, UPDATE, DELETE et
   TRUNCATE ont donc été révoqués sur `purchase_request_events`. Mais une
   fonction de déclencheur s'exécute par défaut avec les droits de
   l'appelant — le déclencheur se retrouvait donc interdit d'écrire le
   journal, et toute création de demande échouait.

   SECURITY DEFINER règle la contradiction dans le bon sens : le journal
   n'appartient qu'au déclencheur. L'utilisateur ne peut ni l'écrire, ni le
   réécrire, ni l'effacer ; le déclencheur, lui, écrit toujours.

   `lab_id` est repris de la demande, dont le RLS a déjà vérifié
   l'appartenance : la fonction n'élargit aucune visibilité. */

create or replace function public.log_purchase_request_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    insert into purchase_request_events (lab_id, request_id, kind, actor, detail)
    values (new.lab_id, new.id, 'created',
            coalesce(new.last_actor, new.requester), 'Demande créée');
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into purchase_request_events (lab_id, request_id, kind, actor, detail)
    values (
      new.lab_id,
      new.id,
      case new.status
        when 'approved'  then 'approved'
        when 'rejected'  then 'rejected'
        when 'converted' then 'converted'
        else 'updated'
      end,
      coalesce(new.last_actor, new.validated_by),
      case new.status
        when 'approved'  then 'Demande validée'
        when 'rejected'  then coalesce('Demande refusée : ' || new.rejection_reason,
                                       'Demande refusée')
        when 'converted' then 'Convertie en bon de commande'
        else 'Statut : ' || new.status
      end
    );
  end if;

  return new;
end;
$$;

/* Une fonction de déclencheur n'a aucune raison d'être appelable
   directement : seul le déclencheur doit pouvoir l'invoquer. */
revoke all on function public.log_purchase_request_event()
  from public, anon, authenticated;
