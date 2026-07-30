-- Correctif : products n'a pas de colonne packaging (elle n'existe que sur
-- les lignes de commande et les lots, renseignée à la réception).
create or replace function public.create_purchase_order(
  p_supplier_id integer,
  p_lines jsonb
)
returns jsonb
language plpgsql
set search_path = public
as $function$
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

  v_number := 'CMD-' || to_char(now(), 'YYYYMMDD-HH24MISS');

  insert into purchase_orders (number, supplier_id, ordered_at)
  values (v_number, p_supplier_id, current_date)
  returning id into v_order_id;

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

  return jsonb_build_object(
    'order_id', v_order_id,
    'number', v_number,
    'lines', v_count,
    'total', v_total
  );
end;
$function$;
