-- Les RPC d'écriture repassent en SECURITY INVOKER : le RLS par laboratoire
-- s'applique à chaque lecture/écriture, sans réécrire la logique métier.
-- Les vues deviennent security_invoker pour la même raison.

alter view public.lots_view set (security_invoker = true);
alter view public.pending_consumables set (security_invoker = true);
alter view public.purchase_order_lines_view set (security_invoker = true);
alter view public.inventory_lines_view set (security_invoker = true);

-- Garde commune : refuse toute opération sans laboratoire effectif.
create or replace function public.assert_lab_context()
returns integer
language plpgsql stable
as $$
declare v_lab integer;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  v_lab := public.current_lab_id();
  if v_lab is null then
    raise exception 'Aucun laboratoire attribué à ce compte';
  end if;
  return v_lab;
end;
$$;
grant execute on function public.assert_lab_context() to authenticated;

-- L'admin choisit le laboratoire qu'il consulte.
create or replace function public.set_active_lab(p_lab_id integer)
returns void
language plpgsql security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
  if not public.is_admin() then
    raise exception 'Réservé à l''administrateur';
  end if;
  if not exists (select 1 from laboratories where id = p_lab_id) then
    raise exception 'Laboratoire introuvable : %', p_lab_id;
  end if;
  update profiles set active_lab_id = p_lab_id where id = auth.uid();
end;
$$;
grant execute on function public.set_active_lab(integer) to authenticated;

create or replace function public.sync_lis_orders(sample_count integer DEFAULT 10)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  batch text := 'LIS-' || to_char(now(), 'YYYYMMDD-HH24MISS');
  inserted int;
begin
  perform public.assert_lab_context();
  if sample_count is null or sample_count < 1 or sample_count > 500 then
    raise exception 'Nombre d''échantillons hors bornes (1-500) : %', sample_count;
  end if;

  insert into lis_orders (batch_ref, analysis_id, sample_count)
  select batch, a.id, sample_count from analyses a;

  select count(*) into inserted from analyses;

  return jsonb_build_object(
    'batch_ref', batch,
    'analyses', inserted,
    'samples', inserted * sample_count,
    'imported_at', now()
  );
end;
$function$;

create or replace function public.issue_stock(p_mode text, p_operator text, p_overrides jsonb DEFAULT '[]'::jsonb)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_issue_id int;
  v_line record;
  v_order_ids int[];
  v_total_analyses int;
  v_total_samples int;
  v_total_refs int := 0;
  v_total_qty int := 0;
  v_remaining int;
  v_lot record;
  v_take int;
begin
  perform public.assert_lab_context();
  if p_mode not in ('automatic', 'manual') then
    raise exception 'Mode de sortie inconnu : %', p_mode;
  end if;
  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select array_agg(id) into v_order_ids
  from (
    select id from lis_orders where status = 'pending' order by id for update
  ) locked;

  if v_order_ids is null then
    raise exception 'Aucune analyse en attente : rien à déduire';
  end if;

  select count(distinct analysis_id), sum(sample_count)
  into v_total_analyses, v_total_samples
  from lis_orders where id = any(v_order_ids);

  insert into stock_issues (source, mode, operator, total_analyses, total_samples)
  values ('Logiciel de Laboratoire (LIS)', p_mode, p_operator,
          v_total_analyses, v_total_samples)
  returning id into v_issue_id;

  for v_line in
    select pc.product_id,
           pc.product_name,
           coalesce(
             (select (o->>'quantity')::int
              from jsonb_array_elements(p_overrides) o
              where (o->>'product_id')::int = pc.product_id),
             pc.required_quantity
           ) as quantity
    from pending_consumables pc
    order by pc.product_id
  loop
    if v_line.quantity is null or v_line.quantity < 0 then
      raise exception 'Quantité invalide pour le produit %', v_line.product_id;
    end if;
    continue when v_line.quantity = 0;

    select stock_qty into v_remaining from products
    where id = v_line.product_id for update;

    if v_remaining < v_line.quantity then
      raise exception 'Stock insuffisant pour « % » : % demandé, % disponible',
        v_line.product_name, v_line.quantity, v_remaining;
    end if;

    v_remaining := v_line.quantity;
    for v_lot in
      select id, current_qty from lots
      where product_id = v_line.product_id
        and current_qty > 0
        and expiry_date >= current_date
      order by expiry_date, id
      for update
    loop
      exit when v_remaining = 0;
      v_take := least(v_lot.current_qty, v_remaining);

      update lots set current_qty = current_qty - v_take where id = v_lot.id;

      insert into stock_issue_lines (issue_id, product_id, lot_id, quantity)
      values (v_issue_id, v_line.product_id, v_lot.id, v_take);

      v_remaining := v_remaining - v_take;
    end loop;

    if v_remaining > 0 then
      insert into stock_issue_lines (issue_id, product_id, lot_id, quantity)
      values (v_issue_id, v_line.product_id, null, v_remaining);
    end if;

    update products set stock_qty = stock_qty - v_line.quantity
    where id = v_line.product_id;

    insert into stock_movements (product_id, type, quantity, moved_at)
    values (v_line.product_id, 'out', v_line.quantity, current_date);

    v_total_refs := v_total_refs + 1;
    v_total_qty := v_total_qty + v_line.quantity;
  end loop;

  if v_total_refs = 0 then
    raise exception 'Aucun consommable à déduire pour ces analyses';
  end if;

  update stock_issues
  set total_references = v_total_refs, total_quantity = v_total_qty
  where id = v_issue_id;

  update lis_orders
  set status = 'consumed', issue_id = v_issue_id
  where id = any(v_order_ids);

  return jsonb_build_object(
    'issue_id', v_issue_id,
    'mode', p_mode,
    'total_analyses', v_total_analyses,
    'total_samples', v_total_samples,
    'total_references', v_total_refs,
    'total_quantity', v_total_qty
  );
end;
$function$;

create or replace function public.receive_goods(p_order_line_id integer, p_quantity integer, p_lot_number text, p_expiry_date date, p_operator text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_line record;
  v_lot_id int;
  v_existing record;
  v_receipt_id int;
  v_fefo_rank int;
  v_lot text := trim(p_lot_number);
begin
  perform public.assert_lab_context();
  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;
  if v_lot = '' then
    raise exception 'Le numéro de lot est obligatoire';
  end if;
  if p_expiry_date is null then
    raise exception 'La date de péremption est obligatoire';
  end if;
  if p_expiry_date <= current_date then
    raise exception 'Date de péremption invalide : % est déjà atteinte', p_expiry_date;
  end if;
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'La quantité reçue doit être strictement positive';
  end if;

  -- Verrouille la ligne de commande : deux réceptions simultanées ne peuvent
  -- pas dépasser ensemble la quantité commandée.
  select pol.*, po.id as order_id
  into v_line
  from purchase_order_lines pol
  join purchase_orders po on po.id = pol.order_id
  where pol.id = p_order_line_id
  for update of pol;

  if not found then
    raise exception 'Ligne de commande introuvable : %', p_order_line_id;
  end if;

  if p_quantity > v_line.quantity_ordered - v_line.quantity_received then
    raise exception
      'Quantité reçue (%) supérieure au reste à recevoir (%)',
      p_quantity, v_line.quantity_ordered - v_line.quantity_received;
  end if;

  /* Un même lot fournisseur peut arriver en plusieurs livraisons : on
     complète le lot existant. En revanche un numéro déjà utilisé pour un
     autre produit est une erreur de saisie, pas un complément. */
  select id, product_id, expiry_date into v_existing
  from lots where lot_number = v_lot for update;

  if v_existing.id is not null then
    if v_existing.product_id <> v_line.product_id then
      raise exception
        'Le lot « % » est déjà enregistré pour un autre produit', v_lot;
    end if;
    if v_existing.expiry_date <> p_expiry_date then
      raise exception
        'Le lot « % » existe avec une péremption différente (%)',
        v_lot, v_existing.expiry_date;
    end if;

    update lots
    set current_qty = current_qty + p_quantity,
        initial_qty = initial_qty + p_quantity,
        updated_at = now(),
        updated_by = p_operator
    where id = v_existing.id;

    v_lot_id := v_existing.id;
  else
    insert into lots (
      product_id, lot_number, internal_ref, packaging, expiry_date,
      initial_qty, current_qty, unit_price, created_by
    )
    select v_line.product_id, v_lot, p.reference, v_line.packaging,
           p_expiry_date, p_quantity, p_quantity, v_line.unit_price, p_operator
    from products p where p.id = v_line.product_id
    returning id into v_lot_id;
  end if;

  update products
  set stock_qty = stock_qty + p_quantity
  where id = v_line.product_id;

  insert into stock_movements (product_id, type, quantity, moved_at)
  values (v_line.product_id, 'in', p_quantity, current_date);

  update purchase_order_lines
  set quantity_received = quantity_received + p_quantity
  where id = p_order_line_id;

  insert into goods_receipts (order_id, operator, total_quantity, total_value)
  values (v_line.order_id, p_operator, p_quantity,
          round(p_quantity * v_line.unit_price, 2))
  returning id into v_receipt_id;

  insert into goods_receipt_lines (
    receipt_id, order_line_id, product_id, lot_id, quantity, unit_price
  )
  values (v_receipt_id, p_order_line_id, v_line.product_id, v_lot_id,
          p_quantity, v_line.unit_price);

  -- Statut de la commande recalculé depuis ses lignes
  update purchase_orders po
  set status = case
    when not exists (
      select 1 from purchase_order_lines
      where order_id = po.id and quantity_received < quantity_ordered
    ) then 'received'
    when exists (
      select 1 from purchase_order_lines
      where order_id = po.id and quantity_received > 0
    ) then 'partial'
    else 'pending'
  end
  where po.id = v_line.order_id;

  -- Rang FEFO du lot après réception
  select rank into v_fefo_rank from (
    select l.id, rank() over (order by l.expiry_date, l.id) as rank
    from lots l
    where l.product_id = v_line.product_id
      and l.current_qty > 0
      and l.expiry_date >= current_date
  ) ranked where ranked.id = v_lot_id;

  return jsonb_build_object(
    'receipt_id', v_receipt_id,
    'lot_id', v_lot_id,
    'lot_number', v_lot,
    'quantity', p_quantity,
    'value', round(p_quantity * v_line.unit_price, 2),
    'fefo_rank', v_fefo_rank,
    'lot_created', v_existing.id is null,
    'order_status', (select status from purchase_orders where id = v_line.order_id)
  );
end;
$function$;

create or replace function public.open_inventory_session(p_scope text, p_category_id integer, p_operator text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_id int;
  v_reference text;
  v_lines int;
begin
  perform public.assert_lab_context();
  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;
  if p_scope not in ('full', 'category') then
    raise exception 'Périmètre inconnu : %', p_scope;
  end if;
  if p_scope = 'category' and p_category_id is null then
    raise exception 'Sélectionnez une catégorie';
  end if;
  if exists (select 1 from inventory_sessions where status = 'open') then
    raise exception 'Un comptage est déjà ouvert : clôturez-le avant d''en ouvrir un autre';
  end if;

  v_reference := 'INV-' || to_char(now(), 'YYYYMMDD-HH24MI');

  insert into inventory_sessions (reference, scope, category_id, opened_by)
  values (v_reference, p_scope,
          case when p_scope = 'full' then null else p_category_id end,
          p_operator)
  returning id into v_id;

  /* Photographie du stock attendu. Seuls les lots encore détenus sont à
     compter ; un lot à zéro n'a rien à vérifier sur l'étagère. */
  insert into inventory_lines (
    session_id, lot_id, product_id, expected_qty, unit_price
  )
  select v_id, l.id, l.product_id, l.current_qty,
         coalesce(l.unit_price, p.unit_price)
  from lots l
  join products p on p.id = l.product_id
  where l.current_qty > 0
    and (p_scope = 'full' or p.category_id = p_category_id);

  select count(*) into v_lines from inventory_lines where session_id = v_id;

  if v_lines = 0 then
    raise exception 'Aucun lot à compter dans ce périmètre';
  end if;

  return jsonb_build_object(
    'session_id', v_id,
    'reference', v_reference,
    'lines', v_lines
  );
end;
$function$;

create or replace function public.save_inventory_count(p_line_id integer, p_counted_qty integer, p_operator text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_line record;
begin
  perform public.assert_lab_context();
  if p_counted_qty is null or p_counted_qty < 0 then
    raise exception 'La quantité comptée doit être un entier positif ou nul';
  end if;

  select il.*, s.status into v_line
  from inventory_lines il
  join inventory_sessions s on s.id = il.session_id
  where il.id = p_line_id
  for update of il;

  if not found then
    raise exception 'Ligne de comptage introuvable : %', p_line_id;
  end if;
  if v_line.status <> 'open' then
    raise exception 'Ce comptage est clôturé : la saisie n''est plus possible';
  end if;

  update inventory_lines
  set counted_qty = p_counted_qty,
      counted_at = now(),
      counted_by = p_operator
  where id = p_line_id;

  return jsonb_build_object(
    'line_id', p_line_id,
    'counted_qty', p_counted_qty,
    'variance', p_counted_qty - v_line.expected_qty
  );
end;
$function$;

create or replace function public.close_inventory_session(p_session_id integer, p_operator text)
 returns jsonb
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_session record;
  v_line record;
  v_delta int;
  v_adjusted int := 0;
  v_units int := 0;
  v_value numeric := 0;
  v_counted int;
  v_skipped int;
begin
  perform public.assert_lab_context();
  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_session from inventory_sessions
  where id = p_session_id for update;

  if not found then
    raise exception 'Comptage introuvable : %', p_session_id;
  end if;
  if v_session.status <> 'open' then
    raise exception 'Ce comptage est déjà %', v_session.status;
  end if;

  select count(*) filter (where counted_qty is not null),
         count(*) filter (where counted_qty is null)
  into v_counted, v_skipped
  from inventory_lines where session_id = p_session_id;

  if v_counted = 0 then
    raise exception 'Aucune ligne comptée : rien à régulariser';
  end if;

  for v_line in
    select il.id, il.lot_id, il.product_id, il.expected_qty,
           il.counted_qty, il.unit_price
    from inventory_lines il
    where il.session_id = p_session_id and il.counted_qty is not null
    order by il.id
    for update
  loop
    v_delta := v_line.counted_qty - v_line.expected_qty;
    continue when v_delta = 0;

    /* Le comptage physique fait foi : le lot est aligné sur la quantité vue,
       et non corrigé du delta, pour absorber les mouvements survenus pendant
       le comptage sans les compter deux fois. */
    update lots set current_qty = v_line.counted_qty,
                    updated_at = now(),
                    updated_by = p_operator
    where id = v_line.lot_id;

    update products set stock_qty = greatest(0, stock_qty + v_delta)
    where id = v_line.product_id;

    insert into stock_movements (product_id, type, quantity, moved_at, is_adjustment)
    values (v_line.product_id,
            case when v_delta > 0 then 'in' else 'out' end,
            abs(v_delta), current_date, true);

    v_adjusted := v_adjusted + 1;
    v_units := v_units + v_delta;
    v_value := v_value + round(v_delta * v_line.unit_price, 2);
  end loop;

  update inventory_sessions
  set status = 'closed',
      closed_at = now(),
      closed_by = p_operator,
      counted_lines = v_counted,
      variance_units = v_units,
      variance_value = v_value
  where id = p_session_id;

  return jsonb_build_object(
    'session_id', p_session_id,
    'counted_lines', v_counted,
    'skipped_lines', v_skipped,
    'adjusted_lots', v_adjusted,
    'variance_units', v_units,
    'variance_value', v_value
  );
end;
$function$;
