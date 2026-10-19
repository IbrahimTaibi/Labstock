/* Remplacement du catalogue articles par la gamme VIDAS (fournisseur MMM).

   À exécuter une fois dans l'éditeur SQL Supabase (rôle postgres).
   Un seul bloc DO, donc une seule transaction : en cas d'erreur, rien n'est
   modifié. (L'éditeur valide chaque instruction séparément : une table
   temporaire créée hors du bloc disparaîtrait avant d'être lue.)

   Laboratoire cible : le premier laboratoire (min(id)). Pour en viser un
   autre, remplacer la ligne `v_lab := ...` ci-dessous.

   Suppression : tous les articles du laboratoire, et avec eux tout ce qui
   les référence — lots, mouvements, lignes de sortie, de commande, de
   réception, d'inventaire, coefficients d'analyses et demandes d'achat.
   Les lignes de facture sont conservées (montants intacts) mais détachées
   de l'article. Les en-têtes (commandes, réceptions, sorties, inventaires)
   restent, vides. */

do $$
declare
  v_lab integer := (select min(id) from public.laboratories);
  v_category integer;
  v_supplier integer;
  v_deleted integer;
  v_inserted integer;
begin
  if v_lab is null then
    raise exception 'Aucun laboratoire trouvé.';
  end if;

  create temp table _old on commit drop as
    select id from public.products where lab_id = v_lab;
  create temp table _old_lots on commit drop as
    select id from public.lots where product_id in (select id from _old);

  -- Les lignes de facture gardent leurs montants, sans lien article.
  update public.invoice_lines set product_id = null
  where product_id in (select id from _old);

  delete from public.inventory_lines
  where product_id in (select id from _old) or lot_id in (select id from _old_lots);
  delete from public.stock_issue_lines where product_id in (select id from _old);
  delete from public.analysis_consumables where product_id in (select id from _old);
  delete from public.goods_receipt_lines where product_id in (select id from _old);

  /* Le déclencheur « brouillon uniquement » interdit de toucher aux lignes
     d'une commande validée ; il est suspendu le temps de la purge. */
  alter table public.purchase_order_lines
    disable trigger purchase_order_lines_draft_only;
  delete from public.purchase_order_lines where product_id in (select id from _old);
  alter table public.purchase_order_lines
    enable trigger purchase_order_lines_draft_only;

  delete from public.purchase_requests where product_id in (select id from _old);
  delete from public.stock_movements where product_id in (select id from _old);
  delete from public.lots where id in (select id from _old_lots);
  delete from public.products where id in (select id from _old);
  get diagnostics v_deleted = row_count;

  -- Catégorie et fournisseur, créés s'ils n'existent pas encore.
  select id into v_category from public.categories
  where lab_id = v_lab and upper(name) = 'IMMUNOLOGIE';
  if v_category is null then
    insert into public.categories (lab_id, name)
    values (v_lab, 'IMMUNOLOGIE') returning id into v_category;
  end if;

  /* Fiche complète posée par replace_suppliers.sql ; créée ici a minima si
     ce script passe en premier. */
  select id into v_supplier from public.suppliers
  where lab_id = v_lab and name = 'MMM';
  if v_supplier is null then
    insert into public.suppliers (lab_id, name)
    values (v_lab, 'MMM') returning id into v_supplier;
  end if;

  /* Date de création : 46263 en série Excel = 29/08/2026.
     Le conditionnement (tests par kit) n'a pas de colonne sur products :
     il est saisi au niveau des commandes et des lots ; il reste ici pour
     mémoire. */
  insert into public.products (
    lab_id, reference, manufacturer_ref, name, category_id, supplier_id,
    unit_price, created_at
  )
  select v_lab, v.reference, v.manufacturer_ref, v.name, v_category, v_supplier,
         v.unit_price, timestamptz '2026-08-29 00:00:00+01'
  from (values
    ('ARTICLE-0001', '30400', 'VIDAS TSH', 60, 510),
    ('ARTICLE-0002', '30459', 'VIDAS FT4', 60, 509),
    ('ARTICLE-0003', '30402', 'VIDAS FT3', 60, 525),
    ('ARTICLE-0004', '30461', 'VIDAS ANTI-TPO', 30, 359),
    ('ARTICLE-0005', '30462', 'VIDAS ANTI-TG', 30, 359),
    ('ARTICLE-0006', '30403', 'VIDAS T3', 60, 597),
    ('ARTICLE-0007', '30404', 'VIDAS T4', 60, 597),
    ('ARTICLE-0008', '30441', 'VIDAS TSH3', 60, 531),
    ('ARTICLE-0009', '30431', 'VIDAS ESTRADIOL II', 60, 580),
    ('ARTICLE-0010', '30405', 'VIDAS HCG', 60, 580),
    ('ARTICLE-0011', '30406', 'VIDAS LH', 60, 580),
    ('ARTICLE-0012', '30407', 'VIDAS FSH', 60, 580),
    ('ARTICLE-0013', '30409', 'VIDAS PROGESTERONE', 60, 580),
    ('ARTICLE-0014', '30410', 'VIDAS PROLACTINE', 60, 580),
    ('ARTICLE-0015', '414320', 'VIDAS TESTOSTERONE', 30, 463),
    ('ARTICLE-0016', '417011', 'VIDAS AMH', 30, 1123),
    ('ARTICLE-0017', '30451-30', 'VIDAS CORTISOL S', 30, 581),
    ('ARTICLE-0018', '30428', 'VIDAS TPSA', 60, 832),
    ('ARTICLE-0019', '30440', 'VIDAS FPSA', 30, 569),
    ('ARTICLE-0020', '30453', 'VIDAS ACE', 60, 995),
    ('ARTICLE-0021', '30413', 'VIDAS AFP', 60, 995),
    ('ARTICLE-0022', '30429', 'VIDAS CA 15-3', 30, 569),
    ('ARTICLE-0023', '30426', 'VIDAS CA 19-9', 30, 569),
    ('ARTICLE-0024', '30419', 'VIDAS TOTAL IgE', 60, 971),
    ('ARTICLE-0025', '30411', 'VIDAS FERRITINE', 60, 772),
    ('ARTICLE-0026', '30420', 'VIDAS β2 MICROGLOBULINE', 30, 769),
    ('ARTICLE-0027', '30463', 'VIDAS 25 OH VITAMIN D TOTAL', 60, 1047),
    ('ARTICLE-0028', '422010', 'VIDAS PTH 1-84', 30, 548),
    ('ARTICLE-0029', '424106', 'VIDAS VITAMINE B12', 60, 589),
    ('ARTICLE-0030', '30315', 'VIDAS HBS AG ULTRA', 60, 501),
    ('ARTICLE-0031', '30317', 'VIDAS HBS AG ULTRA CONFIRMATION', 30, 395),
    ('ARTICLE-0032', '30318', 'VIDAS ANTI-HBST QUICK', 60, 954),
    ('ARTICLE-0033', '30314', 'VIDAS ANTI-HBC TOTAL II', 60, 892),
    ('ARTICLE-0034', '30439', 'VIDAS HBC IgM II', 30, 655),
    ('ARTICLE-0035', '30305', 'VIDAS HBE/ANTI-HBE', 30, 548),
    ('ARTICLE-0036', '30307', 'VIDAS HAV IgM', 30, 784),
    ('ARTICLE-0037', '30312', 'VIDAS ANTI-HAV TOTAL', 30, 524),
    ('ARTICLE-0038', '30308', 'VIDAS ANTI-HCV', 60, 687),
    ('ARTICLE-0039', '418115', 'VIDAS HEV IGM', 30, 807),
    ('ARTICLE-0040', '418116', 'VIDAS HEV IGG', 30, 807),
    ('ARTICLE-0041', '424480', 'VIDAS HIV DUO AG/AB', 60, 814),
    ('ARTICLE-0042', '30204', 'VIDAS CMV IgG', 60, 763),
    ('ARTICLE-0043', '30205', 'VIDAS CMV IgM', 30, 763),
    ('ARTICLE-0044', '413557', 'VIDAS CMV IgG AVIDITY II', 30, 292),
    ('ARTICLE-0045', '30221', 'VIDAS RUB IgG II', 60, 503),
    ('ARTICLE-0046', '30214', 'VIDAS RUB IgM', 30, 502),
    ('ARTICLE-0047', '30210', 'VIDAS TOXO IgG II', 60, 503),
    ('ARTICLE-0048', '30202', 'VIDAS TOXO IgM', 60, 519),
    ('ARTICLE-0049', '30222', 'VIDAS TOXO IgG AVIDITY', 30, 664),
    ('ARTICLE-0050', '30211', 'VIDAS TOXO COMPETITION', 60, 763),
    ('ARTICLE-0051', '30118', 'VIDAS C.DIFFICILE TOXIN A & B', 60, 1450),
    ('ARTICLE-0052', '30125', 'VIDAS GDH', 60, 1907),
    ('ARTICLE-0053', '30319', 'VIDAS LYME IgM', 60, 886),
    ('ARTICLE-0054', '30320', 'VIDAS LYME IgG', 60, 886),
    ('ARTICLE-0055', '424114', 'VIDAS SARS-COV-2 IgG', 60, 759),
    ('ARTICLE-0056', '423833', 'VIDAS SARS-COV-2 IgM', 60, 709),
    ('ARTICLE-0057', '423111', 'VIDAS TB IGRA', 20, 1988),
    ('ARTICLE-0058', '30219', 'VIDAS ROUGEOLE IgG', 60, 1405),
    ('ARTICLE-0059', '30218', 'VIDAS OREILLONS IgG', 60, 1405),
    ('ARTICLE-0060', '30217', 'VIDAS VARICELLA-ZOSTER IgG', 60, 1405),
    ('ARTICLE-0061', '30192', 'VIDAS H PYLORI IgG', 30, 619),
    ('ARTICLE-0062', '30235', 'VIDAS EBV EBNA IgG', 30, 486),
    ('ARTICLE-0063', '30236', 'VIDAS EBV VCA /EA IgG', 30, 486),
    ('ARTICLE-0064', '30237', 'VIDAS EBV VCA IgM', 30, 486),
    ('ARTICLE-0065', '415386', 'VIDAS TROPONIN I HS', 60, 895),
    ('ARTICLE-0066', '415386-30', 'VIDAS TROPONIN I HS', 30, 511),
    ('ARTICLE-0067', '30446', 'VIDAS MYOGLOBIN', 30, 578),
    ('ARTICLE-0068', '30421', 'VIDAS CK-MB', 30, 422),
    ('ARTICLE-0069', '30458', 'VIDAS NT-PROBNP', 60, 2196),
    ('ARTICLE-0070', '30458-30', 'VIDAS NT-PROBNP', 30, 1263),
    ('ARTICLE-0071', '30455-02', 'VIDAS D-DIMER EXCLUSION II', 60, 1587),
    ('ARTICLE-0072', '30455-30', 'VIDAS D-DIMER EXCLUSION II', 30, 931),
    ('ARTICLE-0073', '30115', 'VIDAS PROTEIN C', 30, 631),
    ('ARTICLE-0074', '30436', 'VIDAS Vwf', 30, 560),
    ('ARTICLE-0075', '30450', 'VIDAS BRAHMS PCT', 60, 1832),
    ('ARTICLE-0076', '30450-30', 'VIDAS BRAHMS PCT', 30, 1053),
    ('ARTICLE-0077', '423615-30', 'VIDAS TBI (GFAP, UCH-L1)', 30, 1657)
  ) as v(reference, manufacturer_ref, name, packaging, unit_price);
  get diagnostics v_inserted = row_count;

  raise notice '% articles supprimés, % articles VIDAS créés (laboratoire %).',
    v_deleted, v_inserted, v_lab;
end $$;
