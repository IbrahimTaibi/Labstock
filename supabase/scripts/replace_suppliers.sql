/* Remplacement des fournisseurs par la liste FOURN-0001 à FOURN-0006.

   À exécuter une fois dans l'éditeur SQL Supabase (rôle postgres).
   Tout se fait dans une transaction : en cas d'erreur, rien n'est modifié.
   Indépendant de replace_catalogue_vidas.sql : l'ordre d'exécution est libre.

   Laboratoire cible : le premier laboratoire (min(id)). Pour en viser un
   autre, remplacer la ligne `v_lab := ...` ci-dessous.

   Suppression : tous les fournisseurs absents de la nouvelle liste, et avec
   eux leurs factures (lignes et règlements compris), leurs bons de commande
   (lignes et réceptions comprises) et les demandes d'achat qui les citent.
   Les articles ne sont pas supprimés : ils passent chez MMM. Les lots déjà
   réceptionnés restent en stock. Les factures de sous-traitance ne sont pas
   concernées. */

begin;

create temp table _suppliers (
  code text,
  name text,
  address text,
  postal_code text,
  phone text,
  mobile text,
  tax_id text,
  email text
) on commit drop;

insert into _suppliers values
  ('FOURN-0001', 'MMM', '12 RUE DES ENTREPRENEURS - LA CHARGUIA II', '1080',
   '70 838 2484 / 70 836 515', '25888400', '06227 V/A/000', 'contact@mmm.tn'),
  ('FOURN-0002', 'PROCHIDIA', 'RUE 8603 N°25 Z.I. LA CHARGUIA TUNIS CARTHAGE', '2035',
   '70 130 820 / 71 772 798', '94484654', '710731 G/A/M/000', 'bc.rochediag@prochidia.com'),
  ('FOURN-0003', 'LABO DR MED NEJIB BAROUNI', 'CENTRE MEDICAL ELFARABI ELMENZAH 6 ARIANA TUNISIE', '2091',
   '71 236 155 / 71 767 177', '98551064', '1893953 Q/A/M 000', 'qualitybarounilab@gmail.com'),
  ('FOURN-0004', 'LABO BIODHAOUADI', '21 AVENUE ALGERIA BIZERTE', '7000',
   '72 430 648 / 72 430 686', '98758031', null, 'contact@biodhaouadi.com'),
  ('FOURN-0005', 'SMS SCIENTIFIC', '55 RUE TAHA HOUSSEIN EZZAHRA TUNISIE', '2034',
   '71 450 896 / 79 484 874', '58557409', '1047869J A/M/000', 'contact@sms-scientific.com'),
  -- Adresse e-mail source « contact@bio-health,tn » : virgule corrigée en point.
  ('FOURN-0006', 'BIO HEALTH', '28 RUE ABOU EL KACEM CHEBBI LA GOULETTE TUNIS', '2060',
   '71419347', '29 368 027 / 29 368 224', '1343166 K/B/M 000', 'contact@bio-health.tn');

do $$
declare
  v_lab integer := (select min(id) from public.laboratories);
  v_mmm integer;
  v_deleted integer;
begin
  if v_lab is null then
    raise exception 'Aucun laboratoire trouvé.';
  end if;

  /* Les fournisseurs n'ont pas de colonnes dédiées au code, au GSM ni au
     matricule fiscal : le GSM rejoint le téléphone, le reste les notes. */
  insert into public.suppliers (lab_id, name, address, phone, email, notes)
  select v_lab, s.name,
         s.address || ', ' || s.postal_code,
         s.phone || ' — GSM ' || s.mobile,
         s.email,
         concat_ws(E'\n', 'Code : ' || s.code, 'Matricule fiscal : ' || s.tax_id)
  from _suppliers s
  on conflict (lab_id, name) do update
    set address = excluded.address,
        phone = excluded.phone,
        email = excluded.email,
        notes = excluded.notes;

  select id into v_mmm from public.suppliers where lab_id = v_lab and name = 'MMM';

  create temp table _old on commit drop as
    select id from public.suppliers
    where lab_id = v_lab and name not in (select name from _suppliers);
  create temp table _old_orders on commit drop as
    select id from public.purchase_orders where supplier_id in (select id from _old);
  create temp table _old_invoices on commit drop as
    select id from public.invoices
    where supplier_id in (select id from _old)
       or order_id in (select id from _old_orders);

  -- Les articles restent au catalogue, rattachés à MMM.
  update public.products set supplier_id = v_mmm
  where supplier_id in (select id from _old);

  -- Factures : règlements d'abord (restrict), les lignes suivent en cascade.
  delete from public.supplier_payments where invoice_id in (select id from _old_invoices);
  delete from public.invoices where id in (select id from _old_invoices);

  -- Réceptions (restrict sur la commande), lignes en cascade.
  delete from public.goods_receipts where order_id in (select id from _old_orders);

  /* Le déclencheur « brouillon uniquement » interdit de toucher aux lignes
     d'une commande validée ; il est suspendu le temps de la purge. */
  alter table public.purchase_order_lines
    disable trigger purchase_order_lines_draft_only;
  delete from public.purchase_order_lines where order_id in (select id from _old_orders);
  alter table public.purchase_order_lines
    enable trigger purchase_order_lines_draft_only;

  delete from public.purchase_requests
  where supplier_id in (select id from _old)
     or purchase_order_id in (select id from _old_orders);
  delete from public.purchase_orders where id in (select id from _old_orders);

  delete from public.suppliers where id in (select id from _old);
  get diagnostics v_deleted = row_count;

  raise notice '% fournisseurs supprimés, % fournisseurs en place (laboratoire %).',
    v_deleted, (select count(*) from public.suppliers where lab_id = v_lab), v_lab;
end $$;

commit;
