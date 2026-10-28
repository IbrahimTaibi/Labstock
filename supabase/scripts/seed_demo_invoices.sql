/* Jeu de démonstration : factures fournisseurs (juillet → octobre 2026).

   Insertion seule : rien n'est supprimé. Refuse de s'exécuter si l'une de
   ces factures existe déjà (numéro fournisseur). Un seul bloc DO, donc une
   seule transaction.

   Contenu, sur le premier laboratoire :
     MMM (articles VIDAS du référentiel)
       MMM-F26-04812  14/07  60 j  payée (virement)
       MMM-F26-05377  17/08  60 j  réglée à moitié (chèque) → en retard
       MMM-F26-06021  22/09  60 j  en attente, une remise de 5 %
       MMM-F26-06688  24/10  60 j  en attente, liée à BC-2026-0418, lue par
                                   OCR (96 %), un prix modifié
       MMM-F26-06902  27/10  brouillon (88 %), une ligne « nouvel article »
     Autres fournisseurs (lignes libres, sans article au référentiel)
       PROCHIDIA        PRO-2026-1182  05/08  30 j  payée
       SMS SCIENTIFIC   SMS/26/0734    28/08  30 j  impayée → en retard
       LABO BIODHAOUADI BDH-0457       15/09  comptant, payée (espèces)
       LABO DR BAROUNI  NB-2026-318    02/10  30 j  en attente
       BIO HEALTH       BH-26-2291     10/10  45 j  acompte versé */

do $$
declare
  v_lab integer := (select min(id) from public.laboratories);
  v_today date := current_date;
  v_inv integer;
  v_seq integer;
  r record;
begin
  if exists (
    select 1 from public.invoices
    where lab_id = v_lab and supplier_number in ('MMM-F26-04812', 'PRO-2026-1182')
  ) then
    raise exception 'Factures de démonstration déjà présentes : rien n''est rejoué.';
  end if;

  select coalesce(max((regexp_match(number, '^FAC-2026-(\d+)$'))[1]::int), 0)
  into v_seq from public.invoices where number like 'FAC-2026-%';

  create temp table _headers on commit drop as
  select * from (values
    -- clé, fournisseur, n° fournisseur, date, délai, statut, OCR, offset, nb lignes, remise
    (1, 'MMM', 'MMM-F26-04812', date '2026-07-14', 60, 'final', null::numeric, 0, 8, 0),
    (2, 'MMM', 'MMM-F26-05377', date '2026-08-17', 60, 'final', null, 10, 7, 0),
    (3, 'MMM', 'MMM-F26-06021', date '2026-09-22', 60, 'final', 94, 20, 9, 5),
    (4, 'MMM', 'MMM-F26-06688', date '2026-10-24', 60, 'final', 96, 33, 6, 0),
    (5, 'MMM', 'MMM-F26-06902', date '2026-10-27', 60, 'draft', 88, 45, 4, 0),
    (6, 'PROCHIDIA', 'PRO-2026-1182', date '2026-08-05', 30, 'final', null, 0, 0, 0),
    (7, 'SMS SCIENTIFIC', 'SMS/26/0734', date '2026-08-28', 30, 'final', null, 0, 0, 0),
    (8, 'LABO BIODHAOUADI', 'BDH-0457', date '2026-09-15', 0, 'final', null, 0, 0, 0),
    (9, 'LABO DR MED NEJIB BAROUNI', 'NB-2026-318', date '2026-10-02', 30, 'final', 91, 0, 0, 0),
    (10, 'BIO HEALTH', 'BH-26-2291', date '2026-10-10', 45, 'final', null, 0, 0, 0)
  ) as h(k, supplier, supplier_number, issue_date, terms, kind, ocr, product_offset, product_count, discount);

  -- Lignes libres des fournisseurs sans article au référentiel.
  create temp table _free on commit drop as
  select * from (values
    (6, 'TUB-EDTA4', 'Tubes EDTA K2 4 ml — boîte de 100', 12, 18.500, 19),
    (6, 'TUB-SEC5', 'Tubes secs gel activateur 5 ml — boîte de 100', 10, 21.900, 19),
    (6, 'CUP-ECH', 'Cupules échantillon 2 ml — sachet de 1000', 4, 46.000, 19),
    (7, 'GNT-NIT-M', 'Gants nitrile non poudrés taille M — boîte de 100', 30, 9.800, 19),
    (7, 'EMB-1000', 'Embouts de pipette bleus 1000 µl — sachet de 1000', 8, 24.500, 19),
    (7, 'EMB-200', 'Embouts de pipette jaunes 200 µl — sachet de 1000', 8, 19.750, 19),
    (7, 'POT-URI', 'Pots à urine stériles 60 ml — carton de 500', 2, 115.000, 19),
    (8, 'CTRL-HBA1C', 'Contrôle HbA1c niveaux 1 et 2', 2, 168.000, 7),
    (8, 'CAL-LIP', 'Calibrant lipides multiparamétrique', 1, 142.500, 7),
    (9, 'MIL-CHROMO', 'Milieu chromogène urinaire — 20 boîtes', 3, 88.000, 7),
    (9, 'ATB-DISK', 'Disques antibiogramme — cartouche de 50', 10, 14.200, 7),
    (10, 'ALC-70', 'Alcool éthylique 70 % — bidon 5 L', 6, 23.400, 19),
    (10, 'COMP-ST', 'Compresses stériles 10x10 — boîte de 50', 20, 6.300, 19),
    (10, 'AIG-21G', 'Aiguilles de prélèvement 21G — boîte de 100', 10, 17.900, 19),
    (10, 'ETQ-CB', 'Étiquettes code-barres thermiques — rouleau', 15, 12.000, 19)
  ) as f(k, ref, description, quantity, unit_price, vat_rate);

  for r in
    select h.*, s.id as supplier_id
    from _headers h
    join public.suppliers s on s.lab_id = v_lab and s.name = h.supplier
    order by h.issue_date, h.k
  loop
    v_seq := v_seq + 1;

    insert into public.invoices (
      lab_id, number, supplier_id, supplier_number, amount, status,
      issue_date, due_date, payment_terms_days, stamp_duty, ocr_confidence,
      order_id, document_name, document_size
    )
    values (
      v_lab, 'FAC-2026-' || lpad(v_seq::text, 4, '0'), r.supplier_id,
      r.supplier_number, 0,
      case
        when r.kind = 'draft' then 'draft'
        when r.issue_date + r.terms < v_today then 'overdue'
        else 'pending'
      end,
      r.issue_date, r.issue_date + r.terms, r.terms, 1, r.ocr,
      case when r.k = 4 then (
        select id from public.purchase_orders
        where number = 'BC-2026-0418' and supplier_id = r.supplier_id
      ) end,
      case when r.ocr is not null
        then replace(r.supplier_number, '/', '-') || '.pdf' end,
      case when r.ocr is not null then 180000 + r.k * 7351 end
    )
    returning id into v_inv;

    if r.product_count > 0 then
      -- Articles VIDAS pris dans l'ordre des références, 2 à 6 coffrets.
      insert into public.invoice_lines (
        lab_id, invoice_id, product_id, description, quantity, unit_price,
        discount_pct, vat_rate, manufacturer_ref, match_status
      )
      select v_lab, v_inv, p.id, p.name,
             2 + (p.rn % 5),
             -- Facture 4 : hausse de 4 % sur la deuxième ligne (prix modifié).
             case when r.k = 4 and p.rn = r.product_offset + 2
                  then round(p.unit_price * 1.04, 3) else p.unit_price end,
             -- Facture 3 : remise sur les trois premières lignes.
             case when p.rn <= r.product_offset + 3 then r.discount else 0 end,
             coalesce(p.vat_rate, 0), p.manufacturer_ref, 'matched'
      from (
        select pr.*, row_number() over (order by pr.reference) as rn
        from public.products pr
        where pr.lab_id = v_lab and pr.supplier_id = r.supplier_id
      ) p
      where p.rn > r.product_offset and p.rn <= r.product_offset + r.product_count;
    end if;

    if r.k = 5 then
      -- Brouillon : une ligne lue sans correspondance au référentiel.
      insert into public.invoice_lines (
        lab_id, invoice_id, product_id, description, quantity, unit_price,
        discount_pct, vat_rate, manufacturer_ref, match_status
      )
      values (v_lab, v_inv, null, 'VIDAS Anti-TPO (ATPO) — 60 tests', 2, 612.000,
              0, 0, '30469', 'new_product');
    end if;

    insert into public.invoice_lines (
      lab_id, invoice_id, product_id, description, quantity, unit_price,
      discount_pct, vat_rate, manufacturer_ref, match_status
    )
    select v_lab, v_inv, null, f.description, f.quantity, f.unit_price,
           0, f.vat_rate, f.ref, 'new_product'
    from _free f where f.k = r.k;

    -- Montant historique = HT net ; nul pour un brouillon.
    update public.invoices i set amount = case when r.kind = 'draft' then 0 else (
      select coalesce(round(sum(l.line_total_ht), 3), 0)
      from public.invoice_lines l where l.invoice_id = i.id
    ) end
    where i.id = v_inv;

    -- Règlements.
    if r.k in (1, 6, 8, 2, 10) then
      insert into public.supplier_payments (
        lab_id, invoice_id, amount, paid_at, method, reference, note, created_by
      )
      select v_lab, v_inv,
             case r.k
               when 2 then round(t.total_ttc / 2, 3)
               when 10 then 300
               else t.total_ttc
             end,
             case r.k
               when 1 then date '2026-09-10'
               when 2 then date '2026-10-05'
               when 6 then date '2026-09-03'
               when 8 then date '2026-09-15'
               else date '2026-10-20'
             end,
             case r.k when 2 then 'check' when 8 then 'cash' when 10 then 'cash' else 'transfer' end,
             case r.k
               when 1 then 'VIR-2026-0912'
               when 2 then 'CHQ 4417203'
               when 6 then 'VIR-2026-0903'
               else null
             end,
             case r.k when 2 then 'Premier versement (50 %)' when 10 then 'Acompte' end,
             'Démonstration'
      from public.invoice_totals_view t where t.invoice_id = v_inv;

      if r.k in (1, 6, 8) then
        update public.invoices
        set status = 'paid',
            payment_date = case r.k
              when 1 then date '2026-09-10'
              when 6 then date '2026-09-03'
              else date '2026-09-15'
            end
        where id = v_inv;
      end if;
    end if;
  end loop;

  raise notice '% factures de démonstration créées.',
    (select count(*) from public.invoices
     where lab_id = v_lab and supplier_number in (select supplier_number from _headers));
end $$;
