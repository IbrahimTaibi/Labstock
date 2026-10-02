/* Bon de commande (cahier des charges §4, §6, §8, §10).

   Deuxième maillon du flux : D.A. validée -> B.C. -> Réception -> Facture.
   La table `purchase_orders` existait déjà, alimentée par les réceptions ;
   ce cahier des charges lui ajoute un cycle de vie, des totaux et un panier.

   Deux décisions structurantes.

   §11.1 — `status` n'est PAS le cycle de vie. La colonne existante porte
   l'avancement de la réception (pending / partial / received) et c'est
   receive_goods() et reverse_goods_receipt() qui l'écrivent. Le cycle
   demandé ici — En préparation, Validé, Envoyé, Annulé — est un autre axe :
   un B.C. peut être « envoyé » ET « partiellement reçu » en même temps.
   Les confondre casserait les réceptions. D'où une colonne `lifecycle`
   distincte, et deux questions qui ne se mélangent plus : où en est la
   commande vis-à-vis du fournisseur, et où en est-elle vis-à-vis du stock.

   §11.7 / §4 — la numérotation. Les données en place utilisent déjà le
   format attendu (BC-2026-0415), mais create_purchase_order() fabriquait
   un « CMD-<horodatage> » : le code et les données divergeaient. La
   séquence BC-<année>-<n> devient la seule, posée par déclencheur, et elle
   reprend après le dernier numéro existant. */

-- ---------------------------------------------------------------------------
-- §4 / §8 — En-tête et cycle de vie
-- ---------------------------------------------------------------------------

alter table purchase_orders
  /* §11.1 — cycle de vie vis-à-vis du fournisseur, indépendant de `status`
     qui suit la réception. */
  add column lifecycle text not null default 'draft'
    check (lifecycle in ('draft', 'approved', 'sent', 'cancelled')),
  add column order_date date not null default current_date,
  add column delivery_days int check (delivery_days >= 0),
  add column payment_method text,
  /* §4 — devise. Le multi-devises n'est pas implémenté : la colonne fige
     l'unité de chaque commande pour que l'ajouter plus tard ne demande pas
     de réinterpréter l'historique. */
  add column currency text not null default 'TND',
  add column validated_at timestamptz,
  add column validated_by text,
  add column sent_at timestamptz,
  add column sent_by text,
  add column cancelled_at timestamptz,
  add column cancelled_by text,
  add column cancellation_reason text;

comment on column purchase_orders.lifecycle is
  'Cycle de vie fournisseur (§8) : draft -> approved -> sent, ou cancelled. Distinct de `status`, qui suit l''avancement de la réception.';

/* Reprise de l'existant : les commandes antérieures au cycle de vie ne sont
   pas des brouillons. Celles qui ont déjà reçu de la marchandise ont
   forcément été transmises au fournisseur ; les autres sont au moins
   validées. Les laisser à « draft » les rendrait modifiables et les ferait
   apparaître comme des paniers en cours. */
update purchase_orders
set lifecycle = case
      when status in ('partial', 'received') then 'sent'
      else 'approved'
    end,
    order_date = ordered_at;
comment on column purchase_orders.currency is
  'Devise de la commande (§4). Aucune conversion n''est faite : la colonne documente l''unité des montants.';

create index purchase_orders_lifecycle_idx
  on purchase_orders (lab_id, lifecycle);

-- ---------------------------------------------------------------------------
-- §4 / §11.7 — Numérotation BC-<année>-<n>
-- ---------------------------------------------------------------------------

create or replace function public.set_purchase_order_number()
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

  v_year := to_char(coalesce(new.order_date, current_date), 'YYYY');

  perform pg_advisory_xact_lock(hashtext('purchase_order_number'), new.lab_id);

  /* Reprend après le dernier numéro de l'année : les commandes déjà en base
     suivent ce format, la séquence continue au lieu de recommencer. */
  select coalesce(
           max((regexp_match(number, '^BC-' || v_year || '-(\d+)$'))[1]::int),
           0
         ) + 1
  into v_next
  from purchase_orders
  where lab_id = new.lab_id and number like 'BC-' || v_year || '-%';

  new.number := 'BC-' || v_year || '-' || lpad(v_next::text, 4, '0');
  return new;
end;
$$;

create trigger purchase_orders_number
  before insert on purchase_orders
  for each row execute function public.set_purchase_order_number();

-- ---------------------------------------------------------------------------
-- §6.1 — Lignes : TVA, prix, lien vers la D.A.
-- ---------------------------------------------------------------------------

alter table purchase_order_lines
  add column vat_rate numeric not null default 0 check (vat_rate >= 0),
  /* §10.5 — la ligne ajoutée manuellement n'a pas de D.A. derrière elle.
     Nullable, donc, mais la colonne rend la traçabilité amont lisible :
     une ligne sans `request_id` est une exception assumée. */
  add column request_id integer references purchase_requests(id),
  add column line_total_ht numeric
    generated always as (quantity_ordered * unit_price) stored,
  add column line_vat numeric
    generated always as (quantity_ordered * unit_price * vat_rate / 100) stored;

comment on column purchase_order_lines.request_id is
  'Demande d''achat à l''origine de la ligne (§10.5). Null pour une ligne ajoutée manuellement : traçabilité amont non garantie.';

/* §10.6 — une même D.A. ne peut alimenter qu'un seul B.C. L'index partiel
   l'impose, les lignes manuelles n'étant pas concernées. */
create unique index purchase_order_lines_request_key
  on purchase_order_lines (request_id)
  where request_id is not null;

-- ---------------------------------------------------------------------------
-- §9 — Un B.C. figé ne se réécrit plus
-- ---------------------------------------------------------------------------

/* Le panier n'est modifiable qu'en préparation. Après validation, la
   commande engage le laboratoire vis-à-vis du fournisseur : la corriger en
   silence ferait mentir le document déjà transmis.

   `quantity_received` échappe à la règle, et c'est essentiel : c'est la
   colonne qu'écrit receive_goods() sur une commande justement validée et
   envoyée. La verrouiller bloquerait toute réception. Le garde-fou protège
   donc le contenu commercial — article, quantité commandée, prix, TVA — et
   laisse passer l'avancement du stock. */
create or replace function public.guard_order_line_draft()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order int := coalesce(new.order_id, old.order_id);
  v_lifecycle text;
begin
  if tg_op = 'UPDATE'
     and new.product_id is not distinct from old.product_id
     and new.quantity_ordered is not distinct from old.quantity_ordered
     and new.unit_price is not distinct from old.unit_price
     and new.vat_rate is not distinct from old.vat_rate
     and new.request_id is not distinct from old.request_id then
    -- Seul l'avancement de la réception a changé : flux légitime.
    return new;
  end if;

  select lifecycle into v_lifecycle from purchase_orders where id = v_order;

  if v_lifecycle is distinct from 'draft' then
    raise exception
      'Ce bon de commande n''est plus en préparation : ses lignes ne peuvent plus être modifiées.';
  end if;

  return coalesce(new, old);
end;
$$;

create trigger purchase_order_lines_draft_only
  before insert or update or delete on purchase_order_lines
  for each row execute function public.guard_order_line_draft();

/* §11.6 — changer de fournisseur alors que le panier contient des lignes.
   On bloque plutôt que de vider : jeter le travail de l'utilisateur sans le
   prévenir est pire que lui demander de vider lui-même. L'écran propose le
   vidage, explicitement. */
create or replace function public.guard_order_supplier_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.supplier_id is distinct from old.supplier_id
     and exists (select 1 from purchase_order_lines where order_id = old.id) then
    raise exception
      'Videz le panier avant de changer de fournisseur : les lignes en cours proviennent de demandes d''un autre fournisseur.';
  end if;
  return new;
end;
$$;

create trigger purchase_orders_supplier_guard
  before update on purchase_orders
  for each row execute function public.guard_order_supplier_change();

-- ---------------------------------------------------------------------------
-- §9 — Transitions
-- ---------------------------------------------------------------------------

/* Validation (§9) : fige le B.C. et bascule ses D.A. en « Convertie en BC ».
   C'est ici que §10.4 se réalise — les demandes quittent le réservoir. */
create or replace function public.validate_purchase_order(
  p_order_id int,
  p_operator text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order record;
  v_lines int;
  v_requests int;
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_order from purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Bon de commande introuvable : %', p_order_id;
  end if;
  if v_order.lifecycle <> 'draft' then
    raise exception 'Seul un bon de commande en préparation peut être validé (état : %).',
      v_order.lifecycle;
  end if;
  if v_order.supplier_id is null then
    raise exception 'Sélectionnez un fournisseur avant de valider';
  end if;

  select count(*) into v_lines from purchase_order_lines where order_id = p_order_id;
  if v_lines = 0 then
    raise exception 'Ajoutez au moins une ligne avant de valider le bon de commande';
  end if;

  if exists (
    select 1 from purchase_order_lines
    where order_id = p_order_id and unit_price <= 0
  ) then
    raise exception 'Chaque ligne doit porter un prix unitaire supérieur à zéro';
  end if;

  update purchase_orders
  set lifecycle = 'approved',
      validated_at = now(),
      validated_by = p_operator
  where id = p_order_id;

  /* §10.4 — les D.A. du B.C. passent à « Convertie en BC ». Le déclencheur
     d'historisation des demandes écrit l'événement correspondant. */
  update purchase_requests
  set status = 'converted',
      purchase_order_id = p_order_id,
      last_actor = p_operator
  where id in (
    select request_id from purchase_order_lines
    where order_id = p_order_id and request_id is not null
  );
  get diagnostics v_requests = row_count;

  return jsonb_build_object(
    'order_id', p_order_id,
    'lines', v_lines,
    'requests', v_requests
  );
end;
$$;

/* §11.2 — passage à « Envoyé ». Le cahier des charges relève qu'aucun bouton
   n'est visible ; on en pose un explicite plutôt qu'un effet de bord de
   l'impression, pour que la date d'envoi veuille dire quelque chose. */
create or replace function public.send_purchase_order(
  p_order_id int,
  p_operator text
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order record;
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_order from purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Bon de commande introuvable : %', p_order_id;
  end if;
  if v_order.lifecycle <> 'approved' then
    raise exception
      'Seul un bon de commande validé peut être marqué comme envoyé (état : %).',
      v_order.lifecycle;
  end if;

  update purchase_orders
  set lifecycle = 'sent', sent_at = now(), sent_by = p_operator
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'sent_at', now());
end;
$$;

/* Annulation. Les D.A. retournent au réservoir : une commande annulée ne
   doit pas retenir en otage des demandes encore légitimes. Interdite dès
   qu'une réception a commencé — le stock, lui, est déjà entré. */
create or replace function public.cancel_purchase_order(
  p_order_id int,
  p_operator text,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order record;
  v_released int;
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_order from purchase_orders where id = p_order_id for update;
  if not found then
    raise exception 'Bon de commande introuvable : %', p_order_id;
  end if;
  if v_order.lifecycle = 'cancelled' then
    raise exception 'Ce bon de commande est déjà annulé';
  end if;
  if exists (
    select 1 from purchase_order_lines
    where order_id = p_order_id and quantity_received > 0
  ) then
    raise exception
      'Ce bon de commande a déjà fait l''objet d''une réception : contre-passez la réception avant de l''annuler.';
  end if;

  update purchase_orders
  set lifecycle = 'cancelled',
      cancelled_at = now(),
      cancelled_by = p_operator,
      cancellation_reason = nullif(trim(coalesce(p_reason, '')), '')
  where id = p_order_id;

  update purchase_requests
  set status = 'approved',
      purchase_order_id = null,
      last_actor = p_operator
  where purchase_order_id = p_order_id;
  get diagnostics v_released = row_count;

  return jsonb_build_object('order_id', p_order_id, 'released', v_released);
end;
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'validate_purchase_order(int, text)',
    'send_purchase_order(int, text)',
    'cancel_purchase_order(int, text, text)'
  ] loop
    execute format('revoke all on function public.%s from public, anon', f);
    execute format('grant execute on function public.%s to authenticated', f);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- create_purchase_order() : numérotation déléguée, cycle de vie explicite
-- ---------------------------------------------------------------------------

/* Le numéro n'est plus fabriqué ici : le déclencheur s'en charge, et les
   deux chemins de création partagent donc la même séquence. La commande
   naît validée, puisque cette fonction sert la conversion directe depuis
   l'écran des demandes d'achat — il n'y a pas de panier à préparer. */
create or replace function public.create_purchase_order(
  p_supplier_id integer,
  p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_order_id int;
  v_number text;
  v_line record;
  v_product record;
  v_count int := 0;
  v_total numeric := 0;
begin
  perform public.assert_lab_context();

  if not exists (select 1 from suppliers where id = p_supplier_id) then
    raise exception 'Fournisseur introuvable : %', p_supplier_id;
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'Ajoutez au moins une ligne à la commande';
  end if;

  insert into purchase_orders (supplier_id, ordered_at, order_date, lifecycle,
                               validated_at, validated_by)
  values (p_supplier_id, current_date, current_date, 'draft', null, null)
  returning id, number into v_order_id, v_number;

  for v_line in
    select (o ->> 'product_id')::int as product_id,
           (o ->> 'quantity')::int as quantity
    from jsonb_array_elements(p_lines) o
  loop
    if v_line.quantity is null or v_line.quantity <= 0 then
      raise exception 'Quantité invalide pour le produit %', v_line.product_id;
    end if;

    select id, supplier_id, unit_price into v_product
    from products where id = v_line.product_id;

    if not found then
      raise exception 'Produit introuvable : %', v_line.product_id;
    end if;
    if v_product.supplier_id <> p_supplier_id then
      raise exception 'Le produit % n''appartient pas à ce fournisseur',
        v_line.product_id;
    end if;
    if exists (
      select 1 from purchase_order_lines
      where order_id = v_order_id and product_id = v_line.product_id
    ) then
      raise exception 'Produit en double dans la commande : %', v_line.product_id;
    end if;

    insert into purchase_order_lines (
      order_id, product_id, quantity_ordered, unit_price
    )
    values (v_order_id, v_line.product_id, v_line.quantity,
            v_product.unit_price);

    v_count := v_count + 1;
    v_total := v_total + round(v_line.quantity * v_product.unit_price, 2);
  end loop;

  /* Le panier est complet : la commande passe validée dans la foulée, après
     l'insertion des lignes que le garde-fou « draft » laisse passer. */
  update purchase_orders
  set lifecycle = 'approved', validated_at = now()
  where id = v_order_id;

  return jsonb_build_object(
    'order_id', v_order_id,
    'number', v_number,
    'lines', v_count,
    'total', v_total
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- §3 / §8.1 — Totaux du bon de commande
-- ---------------------------------------------------------------------------

create view purchase_orders_view with (security_invoker = true) as
select
  o.id,
  o.lab_id,
  o.number,
  o.supplier_id,
  s.name as supplier,
  o.order_date,
  o.ordered_at,
  o.lifecycle,
  o.status,
  o.delivery_days,
  o.payment_method,
  o.currency,
  o.validated_at,
  o.validated_by,
  o.sent_at,
  o.sent_by,
  o.cancelled_at,
  o.cancellation_reason,
  coalesce(count(l.id), 0)::int                     as line_count,
  coalesce(sum(l.quantity_ordered), 0)::int         as total_quantity,
  coalesce(sum(l.line_total_ht), 0)                 as total_ht,
  coalesce(sum(l.line_vat), 0)                      as total_vat,
  coalesce(sum(l.line_total_ht), 0)
    + coalesce(sum(l.line_vat), 0)                  as total_ttc
from purchase_orders o
left join suppliers s on s.id = o.supplier_id
left join purchase_order_lines l on l.order_id = o.id
group by o.id, o.lab_id, o.number, o.supplier_id, s.name, o.order_date,
         o.ordered_at, o.lifecycle, o.status, o.delivery_days,
         o.payment_method, o.currency, o.validated_at, o.validated_by,
         o.sent_at, o.sent_by, o.cancelled_at, o.cancellation_reason;

grant select on public.purchase_orders_view to authenticated;

/* §6.1 — les lignes du panier, avec leur D.A. d'origine quand elle existe.
   Nom distinct de `purchase_order_lines_view`, qui existe déjà et sert
   l'écran des réceptions avec une autre forme (reliquat, statut de
   livraison) : la remplacer casserait les réceptions. */
create view purchase_order_cart_view with (security_invoker = true) as
select
  l.id,
  l.lab_id,
  l.order_id,
  l.product_id,
  p.name as product_name,
  coalesce(p.reference, r.reference) as reference,
  l.request_id,
  r.number as request_number,
  r.requester,
  l.quantity_ordered,
  l.quantity_received,
  l.unit_price,
  l.vat_rate,
  l.line_total_ht,
  l.line_vat
from purchase_order_lines l
join products p on p.id = l.product_id
left join purchase_requests r on r.id = l.request_id;

grant select on public.purchase_order_cart_view to authenticated;

-- ---------------------------------------------------------------------------
-- Droits
-- ---------------------------------------------------------------------------

/* Les politiques de lecture, création et modification existent déjà pour ces
   deux tables. Il manquait la suppression : §9 prévoit de supprimer un B.C.
   en préparation, et le panier doit pouvoir perdre une ligne. */
create policy "suppression par laboratoire" on purchase_orders
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));
create policy "suppression par laboratoire" on purchase_order_lines
  for delete to authenticated
  using (lab_id = (select public.current_lab_id()));

grant delete on public.purchase_orders to authenticated;
grant delete on public.purchase_order_lines to authenticated;
grant usage, select on sequence public.purchase_orders_id_seq to authenticated;
grant usage, select on sequence public.purchase_order_lines_id_seq to authenticated;
revoke truncate on public.purchase_orders, public.purchase_order_lines
  from anon, authenticated;
