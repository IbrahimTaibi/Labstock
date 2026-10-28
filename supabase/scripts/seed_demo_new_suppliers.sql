/* Purge des anciens fournisseurs et jeu de démonstration sur les nouveaux.

   À exécuter une fois dans l'éditeur SQL Supabase (rôle postgres). Un seul
   bloc DO : en cas d'erreur, rien n'est modifié. Laboratoire 1.

   1. Purge — tout fournisseur hors liste FOURN-0001…0006 disparaît avec ses
      factures, règlements, commandes et réceptions. Les en-têtes vides
      laissés par la purge des articles (sorties, inventaires) aussi.
   2. Démonstration — sur la gamme VIDAS de MMM :
      - 4 bons de commande (juillet → octobre), 3 réceptionnés, 1 en attente,
        plus 1 brouillon du jour ;
      - un lot par ligne reçue (péremption 4 à 18 mois, emplacement frigo) ;
      - des sorties manuelles hebdomadaires qui consomment une partie des lots ;
      - une facture par réception : soldée, partiellement réglée, à régler ;
      - deux factures hors catalogue (SMS SCIENTIFIC en retard, PROCHIDIA réglée).
   Le tirage est déterministe (setseed) : deux exécutions sur une base
   identique donnent le même jeu. */

do $$
declare
  v_lab int := 1;
  v_mmm int;
  v_sms int;
  v_pro int;
  v_order int;
  v_receipt int;
  v_invoice int;
  v_lot int;
  v_issue record;
  v_next_inv int;
  v_dates date[] := array['2026-07-08', '2026-08-11', '2026-09-16', '2026-10-21']::date[];
  v_recv date;
  v_consumed int;
  v_total numeric;
  r record;
  i int;
begin
  perform setseed(0.42);

  -- -------------------------------------------------------------------------
  -- 1. Purge
  -- -------------------------------------------------------------------------
  create temp table _old on commit drop as
    select id from suppliers
    where lab_id = v_lab
      and name not in ('MMM', 'PROCHIDIA', 'LABO DR MED NEJIB BAROUNI',
                       'LABO BIODHAOUADI', 'SMS SCIENTIFIC', 'BIO HEALTH');
  create temp table _old_orders on commit drop as
    select id from purchase_orders where supplier_id in (select id from _old);
  create temp table _old_invoices on commit drop as
    select id from invoices
    where supplier_id in (select id from _old) or order_id in (select id from _old_orders);

  delete from supplier_payments where invoice_id in (select id from _old_invoices);
  delete from invoices where id in (select id from _old_invoices);
  delete from goods_receipts where order_id in (select id from _old_orders);
  alter table purchase_order_lines disable trigger purchase_order_lines_draft_only;
  delete from purchase_order_lines where order_id in (select id from _old_orders);
  alter table purchase_order_lines enable trigger purchase_order_lines_draft_only;
  delete from purchase_requests
  where supplier_id in (select id from _old) or purchase_order_id in (select id from _old_orders);
  delete from purchase_orders where id in (select id from _old_orders);
  delete from suppliers where id in (select id from _old);

  -- En-têtes vidés par la purge des articles.
  delete from stock_issues s
  where s.lab_id = v_lab
    and not exists (select 1 from stock_issue_lines l where l.issue_id = s.id);
  delete from inventory_sessions s
  where s.lab_id = v_lab
    and not exists (select 1 from inventory_lines l where l.session_id = s.id);

  -- -------------------------------------------------------------------------
  -- 2. Démonstration
  -- -------------------------------------------------------------------------
  select id into v_mmm from suppliers where lab_id = v_lab and name = 'MMM';
  select id into v_sms from suppliers where lab_id = v_lab and name = 'SMS SCIENTIFIC';
  select id into v_pro from suppliers where lab_id = v_lab and name = 'PROCHIDIA';
  if v_mmm is null then
    raise exception 'Fournisseur MMM introuvable : ajoutez d''abord les fournisseurs.';
  end if;

  -- Seuils adaptés à des coffrets : 2 en minimum, alerte à 3.
  update products
  set min_stock = 2, safety_stock = 1, alert_stock = 3, max_stock = 12
  where lab_id = v_lab;

  -- Sélection des articles de chaque commande (18 par commande, 6 pour le brouillon).
  create temp table _picked (order_no int, product_id int, qty int) on commit drop;
  for i in 1..5 loop
    insert into _picked
    select i, id, 2 + floor(random() * 5)::int
    from (select id from products where lab_id = v_lab order by random()
          limit case when i = 5 then 6 else 18 end) p;
  end loop;

  -- Semaines de sortie : un mardi par semaine, de mi-juillet à la veille.
  create temp table _issues (d date, id int) on commit drop;
  insert into _issues (d)
  select g::date from generate_series(date '2026-07-21', date '2026-10-27', interval '7 days') g;
  for r in select d from _issues order by d loop
    insert into stock_issues (lab_id, source, mode, operator, issued_at, note)
    values (v_lab, 'Sortie manuelle', 'manual', 'Responsable stock',
            r.d + time '09:30',
            (array['Paillasse immunologie', 'Série du matin', 'Urgences',
                   'Contrôle qualité', 'Paillasse sérologie'])[1 + floor(random() * 5)::int])
    returning id into v_lot;
    update _issues set id = v_lot where d = r.d;
  end loop;

  select coalesce(max((regexp_match(number, '^FAC-2026-(\d+)$'))[1]::int), 0)
  into v_next_inv from invoices where lab_id = v_lab;

  for i in 1..5 loop
    -- Brouillon : daté du jour, laissé en préparation.
    insert into purchase_orders (lab_id, supplier_id, ordered_at, order_date, status,
                                 lifecycle, delivery_days, payment_method, currency, created_at)
    values (v_lab, v_mmm,
            case when i = 5 then current_date else v_dates[i] end,
            case when i = 5 then current_date else v_dates[i] end,
            'pending', 'draft', 7, 'Virement', 'TND',
            case when i = 5 then now() else v_dates[i] + time '10:00' end)
    returning id into v_order;

    insert into purchase_order_lines (lab_id, order_id, product_id, quantity_ordered,
                                      unit_price, packaging, vat_rate)
    select v_lab, v_order, p.id, k.qty, p.unit_price, p.packaging, p.vat_rate
    from _picked k join products p on p.id = k.product_id
    where k.order_no = i;

    continue when i = 5;

    update purchase_orders
    set lifecycle = 'sent',
        validated_at = v_dates[i] + time '11:00', validated_by = 'Responsable stock',
        sent_at = v_dates[i] + time '11:15', sent_by = 'Responsable stock'
    where id = v_order;

    -- La commande d'octobre reste en attente de livraison.
    continue when i = 4;

    v_recv := v_dates[i] + 6;
    insert into goods_receipts (lab_id, order_id, operator, received_at)
    values (v_lab, v_order, 'Responsable stock', v_recv + time '14:00')
    returning id into v_receipt;

    for r in
      select pol.id as line_id, pol.product_id, pol.quantity_ordered as qty, pol.unit_price,
             p.reference, p.manufacturer_ref, p.packaging
      from purchase_order_lines pol join products p on p.id = pol.product_id
      where pol.order_id = v_order
    loop
      insert into lots (lab_id, product_id, lot_number, internal_ref, manufacturer_ref,
                        manufacturer, packaging, expiry_date, initial_qty, current_qty,
                        price_ht, unit_price, created_at, created_by, location)
      values (v_lab, r.product_id,
              (1000000000 + floor(random() * 8999999999))::bigint::text,
              r.reference, r.manufacturer_ref, 'bioMérieux', r.packaging,
              v_recv + (120 + floor(random() * 420))::int,
              r.qty, r.qty, r.unit_price, r.unit_price,
              v_recv + time '14:00', 'Responsable stock',
              'Réfrigérateur R' || (1 + floor(random() * 2))::int
                || ' — Étagère ' || (1 + floor(random() * 4))::int)
      returning id into v_lot;

      insert into goods_receipt_lines (lab_id, receipt_id, order_line_id, product_id,
                                       lot_id, quantity, unit_price)
      values (v_lab, v_receipt, r.line_id, r.product_id, v_lot, r.qty, r.unit_price);

      update purchase_order_lines set quantity_received = quantity_ordered where id = r.line_id;

      insert into stock_movements (lab_id, product_id, type, quantity, moved_at)
      values (v_lab, r.product_id, 'in', r.qty, v_recv);

      -- Consommation : une part du lot, sortie lors d'une semaine postérieure.
      v_consumed := floor(random() * (r.qty + 1))::int;
      if v_consumed > 0 then
        select d, id into v_issue from _issues where d > v_recv order by random() limit 1;
        if found then
          insert into stock_issue_lines (lab_id, issue_id, product_id, lot_id, quantity)
          values (v_lab, v_issue.id, r.product_id, v_lot, v_consumed);
          update lots set current_qty = current_qty - v_consumed where id = v_lot;
          insert into stock_movements (lab_id, product_id, type, quantity, moved_at)
          values (v_lab, r.product_id, 'out', v_consumed, v_issue.d);
        end if;
      end if;
    end loop;

    update goods_receipts g
    set total_quantity = t.q, total_value = t.v
    from (select sum(quantity) q, sum(quantity * unit_price) v
          from goods_receipt_lines where receipt_id = v_receipt) t
    where g.id = v_receipt;
    update purchase_orders set status = 'received' where id = v_order;

    -- Facture de la réception.
    v_next_inv := v_next_inv + 1;
    insert into invoices (lab_id, number, supplier_id, amount, status, issue_date, due_date,
                          supplier_number, order_id, stamp_duty, payment_terms_days)
    values (v_lab, 'FAC-2026-' || lpad(v_next_inv::text, 4, '0'), v_mmm, 0, 'pending',
            v_recv, v_recv + 60, 'MMM-F26-' || lpad((410 + i * 37)::text, 5, '0'),
            v_order, 1, 60)
    returning id into v_invoice;

    insert into invoice_lines (lab_id, invoice_id, product_id, description, quantity,
                               unit_price, vat_rate, manufacturer_ref, match_status,
                               receipt_line_id)
    select v_lab, v_invoice, grl.product_id, p.name, grl.quantity, grl.unit_price,
           p.vat_rate, p.manufacturer_ref, 'matched', grl.id
    from goods_receipt_lines grl join products p on p.id = grl.product_id
    where grl.receipt_id = v_receipt;

    select coalesce(sum(line_total_ht + line_vat), 0) + 1 into v_total
    from invoice_lines where invoice_id = v_invoice;
    update invoices set amount = v_total where id = v_invoice;

    -- Juillet soldé, août à moitié réglé, septembre à régler.
    if i = 1 then
      insert into supplier_payments (lab_id, invoice_id, amount, paid_at, method, reference, created_by)
      values (v_lab, v_invoice, v_total, v_recv + 45, 'transfer', 'VIR-2026-0' || (812 + i), 'Responsable stock');
      update invoices set status = 'paid', payment_date = v_recv + 45 where id = v_invoice;
    elsif i = 2 then
      insert into supplier_payments (lab_id, invoice_id, amount, paid_at, method, reference, created_by)
      values (v_lab, v_invoice, round(v_total / 2, 3), v_recv + 30, 'check', 'CHQ-4471' || i, 'Responsable stock');
    end if;
  end loop;

  -- Sorties : totaux, et semaines restées vides supprimées.
  update stock_issues s
  set total_references = t.refs, total_quantity = t.qty
  from (select issue_id, count(distinct product_id) refs, sum(quantity) qty
        from stock_issue_lines group by issue_id) t
  where t.issue_id = s.id and s.id in (select id from _issues);
  delete from stock_issues
  where id in (select id from _issues)
    and not exists (select 1 from stock_issue_lines l where l.issue_id = stock_issues.id);

  -- Stock article = somme des lots détenus.
  update products p
  set stock_qty = coalesce((select sum(current_qty) from lots l where l.product_id = p.id), 0)
  where p.lab_id = v_lab;

  -- Factures hors catalogue.
  if v_sms is not null then
    v_next_inv := v_next_inv + 1;
    insert into invoices (lab_id, number, supplier_id, amount, status, issue_date, due_date,
                          supplier_number, stamp_duty, payment_terms_days)
    values (v_lab, 'FAC-2026-' || lpad(v_next_inv::text, 4, '0'), v_sms, 0, 'overdue',
            date '2026-08-05', date '2026-09-04', 'SMS-2026-1187', 1, 30)
    returning id into v_invoice;
    insert into invoice_lines (lab_id, invoice_id, description, quantity, unit_price,
                               vat_rate, match_status)
    values (v_lab, v_invoice, 'Embouts de pipette 200 µL (sachet de 1000)', 10, 18.5, 19, 'manual'),
           (v_lab, v_invoice, 'Tubes secs 5 ml (boîte de 100)', 20, 9.8, 19, 'manual'),
           (v_lab, v_invoice, 'Gants latex non poudrés (boîte de 100)', 15, 12.5, 19, 'manual');
    update invoices set amount = (select sum(line_total_ht + line_vat) + 1 from invoice_lines
                                  where invoice_id = v_invoice)
    where id = v_invoice;
  end if;

  if v_pro is not null then
    v_next_inv := v_next_inv + 1;
    insert into invoices (lab_id, number, supplier_id, amount, status, issue_date, due_date,
                          supplier_number, stamp_duty, payment_terms_days, payment_date)
    values (v_lab, 'FAC-2026-' || lpad(v_next_inv::text, 4, '0'), v_pro, 0, 'pending',
            date '2026-09-02', date '2026-10-02', 'PRO-26-0934', 1, 30, null)
    returning id into v_invoice;
    insert into invoice_lines (lab_id, invoice_id, description, quantity, unit_price,
                               vat_rate, match_status)
    values (v_lab, v_invoice, 'Contrôle qualité externe — immunologie (trimestre)', 1, 640, 19, 'manual'),
           (v_lab, v_invoice, 'Calibrateurs multi-paramètres', 2, 185, 19, 'manual');
    select sum(line_total_ht + line_vat) + 1 into v_total from invoice_lines where invoice_id = v_invoice;
    update invoices set amount = v_total where id = v_invoice;
    insert into supplier_payments (lab_id, invoice_id, amount, paid_at, method, reference, created_by)
    values (v_lab, v_invoice, v_total, date '2026-09-28', 'transfer', 'VIR-2026-0901', 'Responsable stock');
    update invoices set status = 'paid', payment_date = date '2026-09-28' where id = v_invoice;
  end if;
end $$;
