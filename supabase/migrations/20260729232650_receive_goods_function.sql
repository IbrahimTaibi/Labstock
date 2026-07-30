/* Enregistre une réception sur une ligne de bon de commande.

   Même posture que issue_stock() : SECURITY DEFINER pour que l'entrée en
   stock reste le monopole de cette procédure, avec vérification d'auth_uid
   dans le corps et search_path figé. Accorder UPDATE sur `products` au rôle
   authenticated permettrait d'augmenter un stock sans lot, sans mouvement
   et sans contrôle de péremption.

   Les contrôles ISO affichés dans l'interface sont exactement ceux appliqués
   ici : ils ne sont pas décoratifs. */
create or replace function public.receive_goods(
  p_order_line_id int,
  p_quantity int,
  p_lot_number text,
  p_expiry_date date,
  p_operator text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line record;
  v_lot_id int;
  v_existing record;
  v_receipt_id int;
  v_fefo_rank int;
  v_lot text := trim(p_lot_number);
begin
  if auth.uid() is null then
    raise exception 'Authentification requise';
  end if;
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
$$;

revoke all on function public.receive_goods(int, int, text, date, text) from public;
grant execute on function public.receive_goods(int, int, text, date, text) to authenticated;
