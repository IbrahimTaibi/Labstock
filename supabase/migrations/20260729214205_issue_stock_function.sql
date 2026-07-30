/* Enregistre une sortie de stock pour les analyses en attente.

   Tout se joue dans une seule transaction : si un consommable manque, rien
   n'est déduit. Les lignes en attente sont verrouillées puis marquées
   'consumed' et rattachées à la sortie, ce qui rend un double appel
   inoffensif — le second ne trouve plus rien à déduire.

   `overrides` (mode manuel) : [{"product_id": 1, "quantity": 12}, ...] */
create or replace function public.issue_stock(
  p_mode text,
  p_operator text,
  p_overrides jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
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
  if p_mode not in ('automatic', 'manual') then
    raise exception 'Mode de sortie inconnu : %', p_mode;
  end if;
  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  -- Verrouille les analyses en attente pour empêcher deux sorties concurrentes
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

    -- Verrouille le produit puis vérifie la disponibilité
    select stock_qty into v_remaining from products
    where id = v_line.product_id for update;

    if v_remaining < v_line.quantity then
      raise exception 'Stock insuffisant pour « % » : % demandé, % disponible',
        v_line.product_name, v_line.quantity, v_remaining;
    end if;

    -- Consomme les lots en FEFO, en cascade si le premier ne suffit pas
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

    /* Les lots peuvent ne pas couvrir la totalité (stock produit saisi hors
       lots) : le reliquat est tracé sans lot plutôt que perdu. */
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
$$;

revoke all on function public.issue_stock(text, text, jsonb) from public;
grant execute on function public.issue_stock(text, text, jsonb) to authenticated;
