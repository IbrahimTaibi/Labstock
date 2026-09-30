/* Contre-passation d'une réception validée (§7 du cahier des charges).

   Rien n'est effacé : la réception d'origine reste en base, horodatée et
   signée, et reçoit une marque d'annulation. C'est ce que demande la
   traçabilité ISO 15189 — une écriture fausse se corrige par une écriture
   inverse, jamais par une suppression.

   Même posture que receive_goods() : SECURITY INVOKER, le RLS cadre donc
   tout au laboratoire de l'appelant, et assert_lab_context() garantit
   qu'un laboratoire actif est bien sélectionné. */

alter table goods_receipts
  add column reversed_at timestamptz,
  add column reversed_by text,
  add column reversal_reason text;

comment on column goods_receipts.reversed_at is
  'Horodatage de la contre-passation ; null tant que la réception est valide.';

create or replace function public.reverse_goods_receipt(
  p_receipt_id int,
  p_operator text,
  p_reason text default null
)
returns jsonb
language plpgsql
set search_path = public
as $$
declare
  v_receipt record;
  v_line record;
  v_lot record;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
  v_units int := 0;
begin
  perform public.assert_lab_context();

  if coalesce(trim(p_operator), '') = '' then
    raise exception 'Opérateur manquant';
  end if;

  select * into v_receipt
  from goods_receipts
  where id = p_receipt_id
  for update;

  if not found then
    raise exception 'Réception introuvable : %', p_receipt_id;
  end if;
  if v_receipt.reversed_at is not null then
    raise exception
      'Cette réception a déjà été annulée le %',
      to_char(v_receipt.reversed_at, 'DD/MM/YYYY "à" HH24:MI');
  end if;

  /* Première passe : on vérifie que tout est contre-passable AVANT de
     toucher quoi que ce soit. Une contre-passation à moitié appliquée
     laisserait le stock dans un état pire que l'erreur qu'elle corrige. */
  for v_line in
    select grl.*, p.name as product_name
    from goods_receipt_lines grl
    join products p on p.id = grl.product_id
    where grl.receipt_id = p_receipt_id
  loop
    if v_line.lot_id is null then
      raise exception
        'Le lot de « % » n''existe plus : contre-passation impossible',
        v_line.product_name;
    end if;

    select id, lot_number, current_qty into v_lot
    from lots where id = v_line.lot_id for update;

    if not found then
      raise exception
        'Le lot de « % » est introuvable : contre-passation impossible',
        v_line.product_name;
    end if;

    /* Les marchandises déjà sorties pour analyse ne peuvent plus être
       rendues au fournisseur : la contre-passation creuserait un stock
       négatif. L'écart doit alors passer par un inventaire. */
    if v_lot.current_qty < v_line.quantity then
      raise exception
        'Lot « % » : % unités encore en stock sur les % à annuler. Une partie a déjà été consommée — régularisez par un inventaire.',
        v_lot.lot_number, v_lot.current_qty, v_line.quantity;
    end if;
  end loop;

  -- Seconde passe : application.
  for v_line in
    select * from goods_receipt_lines where receipt_id = p_receipt_id
  loop
    update lots
    set current_qty = current_qty - v_line.quantity,
        initial_qty = greatest(initial_qty - v_line.quantity, 0),
        updated_at = now(),
        updated_by = p_operator
    where id = v_line.lot_id;

    update products
    set stock_qty = greatest(stock_qty - v_line.quantity, 0)
    where id = v_line.product_id;

    /* Le mouvement inverse est tracé comme une sortie : le journal des
       mouvements doit refléter la réalité physique, pas la faire
       disparaître. */
    insert into stock_movements (product_id, type, quantity, moved_at)
    values (v_line.product_id, 'out', v_line.quantity, current_date);

    update purchase_order_lines
    set quantity_received = greatest(quantity_received - v_line.quantity, 0)
    where id = v_line.order_line_id;

    v_units := v_units + v_line.quantity;
  end loop;

  update goods_receipts
  set reversed_at = now(),
      reversed_by = p_operator,
      reversal_reason = v_reason
  where id = p_receipt_id;

  -- Statut de la commande recalculé depuis ses lignes, comme à la réception.
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
  where po.id = v_receipt.order_id;

  return jsonb_build_object(
    'receipt_id', p_receipt_id,
    'units', v_units,
    'order_status', (select status from purchase_orders where id = v_receipt.order_id)
  );
end;
$$;

revoke all on function public.reverse_goods_receipt(int, text, text) from public, anon;
grant execute on function public.reverse_goods_receipt(int, text, text) to authenticated;
