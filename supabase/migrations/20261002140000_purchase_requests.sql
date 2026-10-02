/* Demandes d'achat (cahier des charges §3, §4, §6, §9).

   Premier maillon du flux d'approvisionnement : D.A. -> B.C. -> Réception ->
   Facture -> Dette -> Règlement. Les quatre derniers existent déjà ; celui-ci
   vient en amont du bon de commande.

   Décisions prises sur les points laissés ouverts :

     §10.7 — une demande porte sur UN article. C'est ce que montre la
     maquette (une ligne = une référence, une désignation, une quantité) et
     c'est ce que suppose §9.4 : un B.C. regroupe plusieurs D.A. du même
     fournisseur. Faire de la D.A. un panier multi-lignes casserait ce
     regroupement.

     §10.4 — le statut « Refusée » est posé dès maintenant. §9.1 l'annonce
     comme probable, et élargir un check plus tard coûte une migration.

     §10.1 — l'incohérence des KPI de la maquette (8+12+6=26 pour un total
     de 24) ne peut pas se reproduire ici : les compteurs sont dérivés des
     lignes, pas saisis. */

-- ---------------------------------------------------------------------------
-- §4.2 — La demande
-- ---------------------------------------------------------------------------

create table purchase_requests (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  -- DA-<année>-<n>, séquence par laboratoire et par année (§4.2).
  number text not null,
  requested_at date not null default current_date,
  /* Lien au référentiel articles (§10.8). Nullable : on peut demander un
     article qui n'est pas encore au catalogue. La conversion en B.C. l'exige
     en revanche, faute de quoi la ligne de commande serait vide. */
  product_id integer references products(id),
  /* Référence libre, pour une demande hors catalogue. Quand `product_id`
     est renseigné, c'est la référence de l'article qui fait foi : la vue
     applique cet ordre. */
  reference text,
  designation text not null,
  -- « Fournisseur proposé » : une suggestion à ce stade (§10.8).
  supplier_id integer references suppliers(id),
  quantity_requested integer not null check (quantity_requested > 0),
  /* §9.3 — la quantité validée peut différer de la quantité demandée
     (arbitrage budgétaire). Nulle tant que la demande n'est pas tranchée. */
  quantity_approved integer check (quantity_approved >= 0),
  /* §9.5 — prix estimatif, facultatif. Posé pour que l'arbitrage de
     validation puisse s'appuyer sur un montant ; rien ne l'impose. */
  estimated_unit_price numeric check (estimated_unit_price >= 0),
  priority text not null default 'normal'
    check (priority in ('critical', 'urgent', 'normal')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'converted')),
  requester text not null,
  comment text,
  validated_at timestamptz,
  validated_by text,
  rejection_reason text,
  -- §9.4 — le B.C. dans lequel la demande a été versée.
  purchase_order_id integer references purchase_orders(id),
  /* Auteur de la dernière écriture. Sert au déclencheur d'historisation :
     sans lui, la timeline de §6.2 ne saurait pas qui attribuer l'événement. */
  last_actor text,
  created_at timestamptz not null default now()
);

comment on table purchase_requests is
  'Demandes d''achat internes (§1). Une demande porte sur un article (§10.7).';
comment on column purchase_requests.supplier_id is
  'Fournisseur proposé : suggestion au stade de la demande, confirmée lors de la conversion en B.C. (§10.8).';

create index purchase_requests_lab_date_idx
  on purchase_requests (lab_id, requested_at desc);
create index purchase_requests_status_idx on purchase_requests (lab_id, status);
create index purchase_requests_supplier_idx on purchase_requests (supplier_id)
  where supplier_id is not null;
create index purchase_requests_product_idx on purchase_requests (product_id)
  where product_id is not null;
create index purchase_requests_order_idx on purchase_requests (purchase_order_id)
  where purchase_order_id is not null;
create unique index purchase_requests_number_key
  on purchase_requests (lab_id, number);

-- ---------------------------------------------------------------------------
-- §6.2 — Historique de la demande
-- ---------------------------------------------------------------------------

/* Timeline de la demande. Écriture seule : §9.2 exige un historique non
   modifiable. Les droits suivent cette règle plus bas — ni UPDATE, ni
   DELETE, ni TRUNCATE. */
create table purchase_request_events (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  request_id integer not null
    references purchase_requests(id) on delete cascade,
  kind text not null
    check (kind in ('created', 'approved', 'rejected', 'converted', 'updated')),
  occurred_at timestamptz not null default now(),
  actor text,
  detail text
);

create index purchase_request_events_request_idx
  on purchase_request_events (request_id, occurred_at desc);

-- ---------------------------------------------------------------------------
-- §4.2 — Numérotation DA-<année>-<n>
-- ---------------------------------------------------------------------------

create or replace function public.set_purchase_request_number()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_year text;
  v_next int;
begin
  if new.number is not null and new.number <> '' then
    return new;
  end if;

  v_year := to_char(coalesce(new.requested_at, current_date), 'YYYY');

  /* Sérialise la numérotation du laboratoire : deux créations simultanées
     ne peuvent pas tirer le même numéro. */
  perform pg_advisory_xact_lock(hashtext('purchase_request_number'), new.lab_id);

  select coalesce(
           max((regexp_match(number, '^DA-' || v_year || '-(\d+)$'))[1]::int),
           0
         ) + 1
  into v_next
  from purchase_requests
  where lab_id = new.lab_id and number like 'DA-' || v_year || '-%';

  new.number := 'DA-' || v_year || '-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

create trigger purchase_requests_number
  before insert on purchase_requests
  for each row execute function public.set_purchase_request_number();

-- ---------------------------------------------------------------------------
-- §6.2 / §9.2 — Historisation automatique
-- ---------------------------------------------------------------------------

/* §6.2 : « chaque changement de statut doit générer automatiquement une
   nouvelle entrée ». Un déclencheur plutôt que du code applicatif : la
   garantie ne doit pas dépendre du chemin d'écriture. */
create or replace function public.log_purchase_request_event()
returns trigger
language plpgsql
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

create trigger purchase_requests_history_insert
  after insert on purchase_requests
  for each row execute function public.log_purchase_request_event();

create trigger purchase_requests_history_update
  after update on purchase_requests
  for each row execute function public.log_purchase_request_event();

-- ---------------------------------------------------------------------------
-- §7 / §9.4 — Transitions
-- ---------------------------------------------------------------------------

/* Validation (§7). La quantité validée peut être revue à la baisse (§9.3) ;
   à défaut, c'est la quantité demandée qui est retenue.

   §10.5 — restreindre ce droit à un rôle responsable, et interdire au
   demandeur de valider sa propre demande, n'est pas tranché : la fonction
   enregistre qui valide, elle ne juge pas encore. */
create or replace function public.approve_purchase_request(
  p_request_id int,
  p_operator text,
  p_quantity int default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_request record;
  v_quantity int;
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_request from purchase_requests
  where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable : %', p_request_id;
  end if;
  if v_request.status <> 'pending' then
    raise exception
      'Seule une demande en attente peut être validée (statut actuel : %).',
      v_request.status;
  end if;

  v_quantity := coalesce(p_quantity, v_request.quantity_requested);
  if v_quantity <= 0 then
    raise exception 'La quantité validée doit être supérieure à zéro';
  end if;
  if v_quantity > v_request.quantity_requested then
    raise exception
      'La quantité validée (%) ne peut pas dépasser la quantité demandée (%).',
      v_quantity, v_request.quantity_requested;
  end if;

  update purchase_requests
  set status = 'approved',
      quantity_approved = v_quantity,
      validated_at = now(),
      validated_by = p_operator,
      last_actor = p_operator
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id, 'quantity', v_quantity);
end;
$$;

/* Refus (§10.4). Le motif est obligatoire : une demande refusée sans
   explication n'apprend rien au demandeur. */
create or replace function public.reject_purchase_request(
  p_request_id int,
  p_operator text,
  p_reason text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_request record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;
  if v_reason is null then
    raise exception 'Un motif de refus est requis';
  end if;

  select * into v_request from purchase_requests
  where id = p_request_id for update;
  if not found then
    raise exception 'Demande introuvable : %', p_request_id;
  end if;
  if v_request.status not in ('pending', 'approved') then
    raise exception 'Cette demande ne peut plus être refusée (statut : %).',
      v_request.status;
  end if;

  update purchase_requests
  set status = 'rejected',
      rejection_reason = v_reason,
      validated_at = now(),
      validated_by = p_operator,
      last_actor = p_operator
  where id = p_request_id;

  return jsonb_build_object('request_id', p_request_id);
end;
$$;

/* §9.4 — conversion en bon de commande. Un B.C. regroupe plusieurs demandes
   validées, à condition qu'elles partagent le même fournisseur.

   La commande elle-même est créée par create_purchase_order() : c'est déjà
   la seule porte d'entrée des bons de commande, et la dupliquer ici ferait
   diverger les deux chemins. Les quantités sont agrégées par article, car
   deux demandes peuvent porter sur le même produit et cette fonction refuse
   les doublons. */
create or replace function public.convert_purchase_requests(
  p_request_ids int[],
  p_operator text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_supplier int;
  v_suppliers int;
  v_count int;
  v_lines jsonb;
  v_order jsonb;
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;
  if p_request_ids is null or array_length(p_request_ids, 1) is null then
    raise exception 'Sélectionnez au moins une demande à convertir';
  end if;

  /* Verrouille les demandes avant tout contrôle : sans cela, deux
     conversions simultanées verseraient la même demande dans deux B.C. */
  perform 1 from purchase_requests
  where id = any(p_request_ids) for update;

  select count(*) into v_count from purchase_requests
  where id = any(p_request_ids);
  if v_count <> array_length(p_request_ids, 1) then
    raise exception 'Une demande sélectionnée est introuvable';
  end if;

  if exists (
    select 1 from purchase_requests
    where id = any(p_request_ids) and status <> 'approved'
  ) then
    raise exception 'Seules des demandes validées peuvent être converties';
  end if;

  if exists (
    select 1 from purchase_requests
    where id = any(p_request_ids) and product_id is null
  ) then
    raise exception
      'Une demande sans article du catalogue ne peut pas être convertie : rattachez-la d''abord à un produit.';
  end if;

  select count(distinct supplier_id), min(supplier_id)
  into v_suppliers, v_supplier
  from purchase_requests where id = any(p_request_ids);

  if v_supplier is null then
    raise exception 'Les demandes doivent porter un fournisseur renseigné';
  end if;
  if v_suppliers <> 1 then
    raise exception
      'Un bon de commande ne peut regrouper que des demandes du même fournisseur.';
  end if;

  -- Agrégation par article, puis délégation à la création de commande.
  select jsonb_agg(
           jsonb_build_object('product_id', product_id, 'quantity', quantity)
         )
  into v_lines
  from (
    select product_id,
           sum(coalesce(quantity_approved, quantity_requested))::int as quantity
    from purchase_requests
    where id = any(p_request_ids)
    group by product_id
  ) grouped;

  v_order := public.create_purchase_order(v_supplier, v_lines);

  update purchase_requests
  set status = 'converted',
      purchase_order_id = (v_order ->> 'order_id')::int,
      last_actor = p_operator
  where id = any(p_request_ids);

  return jsonb_build_object(
    'order_id', (v_order ->> 'order_id')::int,
    'number', v_order ->> 'number',
    'requests', array_length(p_request_ids, 1),
    'lines', v_order -> 'lines'
  );
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'approve_purchase_request(int, text, int)',
    'reject_purchase_request(int, text, text)',
    'convert_purchase_requests(int[], text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- §4.2 — Lecture de l'écran
-- ---------------------------------------------------------------------------

/* La ligne du tableau, prête à lire. `reference` privilégie celle de
   l'article du catalogue : c'est la référence qui fera foi au moment de la
   commande. */
create view purchase_requests_view with (security_invoker = true) as
select
  r.id,
  r.lab_id,
  r.number,
  r.requested_at,
  r.product_id,
  coalesce(p.reference, r.reference) as reference,
  r.designation,
  r.supplier_id,
  s.name as supplier,
  r.quantity_requested,
  r.quantity_approved,
  r.estimated_unit_price,
  r.priority,
  r.status,
  r.requester,
  r.comment,
  r.validated_at,
  r.validated_by,
  r.rejection_reason,
  r.purchase_order_id,
  o.number as purchase_order_number,
  r.created_at
from purchase_requests r
left join products p on p.id = r.product_id
left join suppliers s on s.id = r.supplier_id
left join purchase_orders o on o.id = r.purchase_order_id;

grant select on public.purchase_requests_view to authenticated;

-- ---------------------------------------------------------------------------
-- Cloisonnement par laboratoire
-- ---------------------------------------------------------------------------

alter table purchase_requests enable row level security;
alter table purchase_request_events enable row level security;

create policy "lecture par laboratoire" on purchase_requests
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "creation par laboratoire" on purchase_requests
  for insert to authenticated
  with check (lab_id = (select public.current_lab_id()));
create policy "modification par laboratoire" on purchase_requests
  for update to authenticated
  using (lab_id = (select public.current_lab_id()))
  with check (lab_id = (select public.current_lab_id()));
create policy "suppression par laboratoire" on purchase_requests
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

grant select, insert, update, delete on public.purchase_requests to authenticated;
grant usage, select on sequence public.purchase_requests_id_seq to authenticated;
revoke truncate on public.purchase_requests from anon, authenticated;

/* L'historique se lit, il ne se réécrit pas (§9.2). Les lignes sont posées
   par les déclencheurs, jamais par l'application : aucun droit d'écriture
   direct n'est nécessaire. */
create policy "lecture par laboratoire" on purchase_request_events
  for select to authenticated
  using (lab_id = (select public.current_lab_id()));

grant select on public.purchase_request_events to authenticated;
revoke insert, update, delete, truncate
  on public.purchase_request_events from anon, authenticated;
