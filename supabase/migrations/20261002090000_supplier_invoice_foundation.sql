/* Facture fournisseur : socle de données (§3, §6, §7 du cahier des charges).

   Ce qui est posé ici ne dépend pas du moteur OCR retenu : modèle de taxes,
   référence fabricant, lien facture ↔ réception, brouillon, stockage du
   document. Le moteur d'extraction viendra remplir ces colonnes, quel qu'il
   soit.

   Ce qui n'est PAS fait ici, volontairement :
     - aucun appel OCR (choix du prestataire non tranché, §10.2) ;
     - `invoices.amount` n'est pas touché. Il porte aujourd'hui le total HT
       écrit par create_invoice(), et le tableau de bord le lit tel quel.
       Lui donner le sens de « TTC » en douce fausserait l'historique. Le
       détail §7 est donc exposé par une vue, et la bascule éventuelle de
       `amount` sera une décision explicite, pas un effet de bord. */

-- ---------------------------------------------------------------------------
-- §6.4 — Référence fabricant sur l'article
-- ---------------------------------------------------------------------------

/* Le rapprochement se fait en priorité sur la référence fabricant : c'est
   celle que le fournisseur imprime sur sa facture, pas notre référence
   interne. Elle existait déjà sur les lots ; elle manquait au référentiel
   articles, qui est pourtant la cible du rapprochement. */
alter table products add column manufacturer_ref text;

comment on column products.manufacturer_ref is
  'Référence catalogue du fabricant, telle qu''imprimée sur les documents fournisseur. Clé de rapprochement principale des factures.';

/* Partiel : la majorité des articles n'aura pas de référence fabricant au
   début, et un index sur une colonne majoritairement nulle coûte plus qu'il
   ne rapporte. */
create index products_manufacturer_ref_idx
  on products (lab_id, manufacturer_ref)
  where manufacturer_ref is not null;

-- ---------------------------------------------------------------------------
-- §3 — En-tête de facture
-- ---------------------------------------------------------------------------

alter table invoices
  /* Le numéro du fournisseur, lu sur son document. `number` reste notre
     référence interne auto-générée (FAC-<année>-<n>) : les deux coexistent
     parce qu'ils ne désignent pas la même chose. */
  add column supplier_number text,
  add column order_id int references purchase_orders(id),
  add column payment_terms text,
  /* Timbre fiscal : spécificité réglementaire tunisienne, montant fixe par
     facture. Paramétrable puisque le barème peut changer (§9). */
  add column stamp_duty numeric not null default 0 check (stamp_duty >= 0),
  -- §4 / §8.1 — document importé
  add column document_path text,
  add column document_name text,
  add column document_size int,
  /* Score de fiabilité OCR, 0–100. Null tant qu'aucune lecture automatique
     n'a eu lieu — une facture saisie à la main n'a pas de score. */
  add column ocr_confidence numeric check (
    ocr_confidence is null or (ocr_confidence >= 0 and ocr_confidence <= 100)
  );

comment on column invoices.supplier_number is
  'Numéro de facture du fournisseur (§3), lu par OCR ou saisi. Distinct de `number`, notre séquence interne.';
comment on column invoices.stamp_duty is
  'Timbre fiscal en TND (§7).';
comment on column invoices.document_path is
  'Chemin du fichier dans le bucket supplier-invoices, préfixé par le lab_id.';

create index invoices_order_id_idx on invoices (order_id)
  where order_id is not null;

/* §10.8 — doublons. Un même numéro de facture ne peut pas être enregistré
   deux fois pour le même fournisseur. Partiel : les factures saisies sans
   numéro fournisseur ne se gênent pas entre elles. */
create unique index invoices_supplier_number_key
  on invoices (lab_id, supplier_id, supplier_number)
  where supplier_number is not null;

/* §10.6 — brouillon. Une facture en cours de vérification ne doit peser ni
   sur les encours ni sur les retards. */
alter table invoices drop constraint invoices_status_check;
alter table invoices add constraint invoices_status_check
  check (status in ('draft', 'paid', 'pending', 'overdue'));

-- ---------------------------------------------------------------------------
-- §6.2 / §7 — Lignes : remise, TVA, rapprochement
-- ---------------------------------------------------------------------------

alter table invoice_lines
  add column discount_pct numeric not null default 0
    check (discount_pct >= 0 and discount_pct <= 100),
  add column vat_rate numeric not null default 0 check (vat_rate >= 0),
  -- Référence fabricant lue sur la ligne de facture (§6.4).
  add column manufacturer_ref text,
  /* Verdict du rapprochement (§6.2) :
       matched     ✓ Correspondant — article reconnu au référentiel
       new_product ⊙ Nouvel article — aucune correspondance
       manual        ligne ajoutée à la main (§6.3) */
  add column match_status text not null default 'matched'
    check (match_status in ('matched', 'new_product', 'manual')),
  /* §6.4bis — la règle centrale. Lien de traçabilité vers la réception déjà
     enregistrée. Non nul = la marchandise est déjà entrée en stock, la
     facture ne crée donc aucun mouvement. `on delete set null` : annuler une
     réception ne doit pas faire disparaître la ligne de facture. */
  add column receipt_line_id int
    references goods_receipt_lines(id) on delete set null;

/* Totaux de ligne calculés par la base plutôt que par l'application : §7
   exige un recalcul à chaque modification, et une colonne générée ne peut
   pas diverger de ses composants.
       Total ligne = Qté × PU × (1 − Remise%) × (1 + TVA%) */
alter table invoice_lines
  add column line_total_ht numeric
    generated always as (quantity * unit_price * (1 - discount_pct / 100)) stored,
  add column line_vat numeric
    generated always as (
      quantity * unit_price * (1 - discount_pct / 100) * vat_rate / 100
    ) stored;

comment on column invoice_lines.receipt_line_id is
  'Ligne de réception rapprochée (§6.4bis). Non nul : la facture ne génère aucun mouvement de stock, la réception fait foi.';

create index invoice_lines_receipt_line_id_idx on invoice_lines (receipt_line_id)
  where receipt_line_id is not null;
create index invoice_lines_manufacturer_ref_idx
  on invoice_lines (lab_id, manufacturer_ref)
  where manufacturer_ref is not null;
/* Les lignes non rapprochées sont celles que l'écran met en avant : index
   partiel sur ce seul cas. */
create index invoice_lines_unmatched_idx on invoice_lines (invoice_id)
  where match_status <> 'matched';

-- ---------------------------------------------------------------------------
-- §7 — Bloc de totaux
-- ---------------------------------------------------------------------------

/* Les six montants du bloc de totaux, recomposés depuis les lignes. Rien
   n'est stocké : un total dénormalisé finit toujours par mentir.
   security_invoker : le RLS des tables sources cadre déjà au laboratoire. */
create view invoice_totals_view with (security_invoker = true) as
select
  i.id as invoice_id,
  i.lab_id,
  coalesce(sum(l.quantity * l.unit_price), 0)                as total_ht,
  coalesce(sum(l.quantity * l.unit_price * l.discount_pct / 100), 0)
                                                             as total_discount,
  coalesce(sum(l.line_total_ht), 0)                          as net_ht,
  coalesce(sum(l.line_vat), 0)                               as total_vat,
  i.stamp_duty,
  coalesce(sum(l.line_total_ht), 0)
    + coalesce(sum(l.line_vat), 0)
    + i.stamp_duty                                           as total_ttc
from invoices i
left join invoice_lines l on l.invoice_id = i.id
group by i.id, i.lab_id, i.stamp_duty;

/* Le `grant ... on all tables` des politiques par laboratoire était un
   instantané : il ne couvre pas les objets créés après lui. */
grant select on public.invoice_totals_view to authenticated;

-- ---------------------------------------------------------------------------
-- §4 / §8.1 — Stockage du document importé
-- ---------------------------------------------------------------------------

/* Bucket privé : une facture fournisseur est une pièce comptable, elle n'a
   rien à faire sur une URL publique. Les fichiers sont rangés sous
   « <lab_id>/… », ce qui permet de cadrer l'accès par laboratoire. */
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'supplier-invoices',
  'supplier-invoices',
  false,
  10485760,  -- 10 Mo (§4)
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "lecture par laboratoire" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = (select public.current_lab_id())::text
  );

create policy "depot par laboratoire" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = (select public.current_lab_id())::text
  );

create policy "suppression par laboratoire" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'supplier-invoices'
    and (storage.foldername(name))[1] = (select public.current_lab_id())::text
  );
