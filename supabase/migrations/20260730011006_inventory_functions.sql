/* Ouvre un comptage et fige l'état attendu de chaque lot concerné. */
create or replace function public.open_inventory_session(
  p_scope text,
  p_category_id int,
  p_operator text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id int;
  v_reference text;
  v_lines int;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
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
$$;

/* Enregistre un comptage physique sur une ligne. */
create or replace function public.save_inventory_count(
  p_line_id int,
  p_counted_qty int,
  p_operator text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
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
$$;

/* Clôture le comptage et passe les régularisations, en une transaction.

   Les lignes non comptées sont laissées intactes : un lot non vu n'est pas un
   lot absent, et le mettre à zéro détruirait du stock réel. */
create or replace function public.close_inventory_session(
  p_session_id int,
  p_operator text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
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
$$;

revoke all on function public.open_inventory_session(text, int, text) from public;
revoke all on function public.save_inventory_count(int, int, text) from public;
revoke all on function public.close_inventory_session(int, text) from public;
grant execute on function public.open_inventory_session(text, int, text) to authenticated;
grant execute on function public.save_inventory_count(int, int, text) to authenticated;
grant execute on function public.close_inventory_session(int, text) to authenticated;
