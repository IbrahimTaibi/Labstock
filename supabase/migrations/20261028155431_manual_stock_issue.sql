/* Sortie de stock manuelle.

   Le laboratoire ne passe plus par l'import des analyses : l'opérateur
   choisit lui-même les articles et les quantités. `issue_stock` exige des
   analyses en attente et ne sait pas déduire un article hors besoin calculé ;
   cette fonction prend la liste telle quelle.

   Chaque ligne désigne un article, une quantité et, facultativement, un lot
   précis (étiquette scannée). Sans lot, la déduction suit le FEFO comme
   `issue_stock`. Tout se fait en une transaction : un article en manque et
   rien n'est déduit. */

alter table stock_issues add column note text;

comment on column stock_issues.note is
  'Motif ou destination de la sortie, saisi par l''opérateur (sortie manuelle).';

create or replace function public.issue_stock_manual(
  p_operator text,
  p_lines jsonb,
  p_note text default null
)
returns jsonb
language plpgsql
set search_path to 'public'
as $function$
declare
  v_issue_id int;
  v_line record;
  v_product record;
  v_lot record;
  v_remaining int;
  v_take int;
  v_total_refs int := 0;
  v_total_qty int := 0;
begin
  perform public.assert_lab_context();
  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array'
     or jsonb_array_length(p_lines) = 0 then
    raise exception 'Aucun article à sortir';
  end if;

  insert into stock_issues (source, mode, operator, note)
  values ('Sortie manuelle', 'manual', p_operator, nullif(trim(p_note), ''))
  returning id into v_issue_id;

  /* Regroupement : le même article (ou le même lot) saisi deux fois ne
     forme qu'une ligne, et le contrôle de stock porte sur le cumul. */
  for v_line in
    select (l->>'product_id')::int as product_id,
           nullif(l->>'lot_id', '')::int as lot_id,
           sum((l->>'quantity')::int)::int as quantity
    from jsonb_array_elements(p_lines) l
    group by 1, 2
    order by 1, 2 nulls last
  loop
    if v_line.product_id is null then
      raise exception 'Article manquant sur une ligne';
    end if;
    if v_line.quantity is null or v_line.quantity < 0 then
      raise exception 'Quantité invalide pour l''article %', v_line.product_id;
    end if;
    continue when v_line.quantity = 0;

    select id, name, stock_qty into v_product
    from products where id = v_line.product_id
    for update;
    if not found then
      raise exception 'Article % introuvable', v_line.product_id;
    end if;
    if v_product.stock_qty < v_line.quantity then
      raise exception 'Stock insuffisant pour « % » : % demandé, % disponible',
        v_product.name, v_line.quantity, v_product.stock_qty;
    end if;

    if v_line.lot_id is not null then
      -- Lot imposé : il doit appartenir à l'article, être valide et suffire.
      select id, lot_number, current_qty, expiry_date into v_lot
      from lots
      where id = v_line.lot_id and product_id = v_line.product_id
      for update;
      if not found then
        raise exception 'Le lot % n''appartient pas à « % »',
          v_line.lot_id, v_product.name;
      end if;
      if v_lot.expiry_date < current_date then
        raise exception 'Le lot % de « % » est périmé',
          v_lot.lot_number, v_product.name;
      end if;
      if v_lot.current_qty < v_line.quantity then
        raise exception 'Lot % de « % » : % demandé, % disponible',
          v_lot.lot_number, v_product.name, v_line.quantity, v_lot.current_qty;
      end if;

      update lots set current_qty = current_qty - v_line.quantity
      where id = v_lot.id;
      insert into stock_issue_lines (issue_id, product_id, lot_id, quantity)
      values (v_issue_id, v_line.product_id, v_lot.id, v_line.quantity);
    else
      -- FEFO : lots valides, péremption la plus proche d'abord.
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

      /* Même règle que `issue_stock` : le stock article fait foi, le
         reliquat sans lot valide reste tracé sur une ligne sans lot. */
      if v_remaining > 0 then
        insert into stock_issue_lines (issue_id, product_id, lot_id, quantity)
        values (v_issue_id, v_line.product_id, null, v_remaining);
      end if;
    end if;

    update products set stock_qty = stock_qty - v_line.quantity
    where id = v_line.product_id;
    insert into stock_movements (product_id, type, quantity, moved_at)
    values (v_line.product_id, 'out', v_line.quantity, current_date);

    v_total_qty := v_total_qty + v_line.quantity;
  end loop;

  select count(distinct product_id) into v_total_refs
  from stock_issue_lines where issue_id = v_issue_id;

  if v_total_refs = 0 then
    raise exception 'Aucune quantité à sortir';
  end if;

  update stock_issues
  set total_references = v_total_refs, total_quantity = v_total_qty
  where id = v_issue_id;

  return jsonb_build_object(
    'issue_id', v_issue_id,
    'total_references', v_total_refs,
    'total_quantity', v_total_qty
  );
end;
$function$;

revoke all on function public.issue_stock_manual(text, jsonb, text) from public, anon;
grant execute on function public.issue_stock_manual(text, jsonb, text) to authenticated;
