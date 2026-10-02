/* Facture sous-traitant : socle de données (cahier des charges §3, §4, §7).

   Prestations d'analyse confiées à un laboratoire externe. Module
   strictement administratif et financier : aucune de ces tables ne touche
   stock_movements, lots ou goods_receipts (§7.1). C'est la différence de
   fond avec « Facture Fournisseur », et elle est structurelle ici — il n'y
   a tout simplement aucun chemin depuis ces tables vers le stock.

   §8.1 — « Laboratoire / Sous-traitant » est tranché comme le prestataire
   externe que l'on paie, pas le laboratoire interne demandeur. Le cahier
   des charges le dit lui-même : « analyses spécialisées confiées à un autre
   laboratoire » (§1) et « charge de sous-traitance » (§7.4). Le laboratoire
   interne, lui, est déjà porté par `lab_id` — c'est le locataire.

   §8.3 — la TVA de ligne fait foi. Le taux de l'en-tête (§3.2) n'est qu'une
   valeur par défaut proposée aux nouvelles lignes : c'est la formule de
   §4.1 qui calcule, et elle lit le taux de la ligne. Cela aligne le calcul
   sur « Facture Fournisseur », comme §7.2 l'exige. */

-- ---------------------------------------------------------------------------
-- Référentiel des sous-traitants
-- ---------------------------------------------------------------------------

/* Table distincte de `suppliers` à dessein : un sous-traitant ne vend pas
   d'articles. Le mêler aux fournisseurs le ferait apparaître dans les
   listes des bons de commande, des réceptions et du catalogue produits,
   où il n'a rien à faire. */
create table subcontractors (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  name text not null,
  contact_name text,
  email text,
  phone text,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table subcontractors is
  'Laboratoires externes réalisant des prestations sous-traitées (§3.1). Prestataires payés, distincts des fournisseurs de marchandises.';

create index subcontractors_lab_id_idx on subcontractors (lab_id);
/* Deux sous-traitants homonymes dans un même laboratoire n'auraient aucun
   sens et rendraient la liste déroulante (§3.1) illisible. */
create unique index subcontractors_name_key on subcontractors (lab_id, lower(name));

-- ---------------------------------------------------------------------------
-- En-tête de facture (§3)
-- ---------------------------------------------------------------------------

create table subcontractor_invoices (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  /* Séquence propre, préfixe FAC-ST- (§7.3) : volontairement séparée de
     celle des factures fournisseur. */
  number text not null,
  /* Numéro imprimé sur la facture papier reçue du sous-traitant, que
     l'icône de scan (§3.1) viendra remplir. Optionnel : §8.7 n'est pas
     tranché, et une facture saisie à la main n'en a pas. */
  subcontractor_number text,
  subcontractor_id integer not null references subcontractors(id),
  issue_date date not null,
  -- §3.2 « Date de saisie », lecture seule côté écran.
  entry_date date not null default current_date,
  -- §3.2 Description de la prestation, obligatoire.
  description text not null,
  /* §3.2 — taux proposé aux nouvelles lignes. Ne sert pas au calcul :
     voir la note §8.3 en tête de fichier. */
  default_vat_rate numeric not null default 0 check (default_vat_rate >= 0),
  -- §3.1 Timbre fiscal, pré-rempli mais modifiable.
  stamp_duty numeric not null default 0 check (stamp_duty >= 0),
  created_at timestamptz not null default now(),
  created_by text
);

comment on column subcontractor_invoices.default_vat_rate is
  'Taux de TVA proposé aux nouvelles lignes (§3.2). Le calcul utilise le taux porté par chaque ligne.';
comment on column subcontractor_invoices.number is
  'Numéro interne auto-généré FAC-ST-<année>-<n>, séquence distincte des factures fournisseur (§7.3).';

create index subcontractor_invoices_subcontractor_id_idx
  on subcontractor_invoices (subcontractor_id);
create index subcontractor_invoices_lab_date_idx
  on subcontractor_invoices (lab_id, issue_date desc);
create unique index subcontractor_invoices_number_key
  on subcontractor_invoices (lab_id, number);

-- ---------------------------------------------------------------------------
-- Lignes de prestation (§4)
-- ---------------------------------------------------------------------------

create table subcontractor_invoice_lines (
  id serial primary key,
  lab_id integer not null references laboratories(id),
  /* Supprimer une facture (§6) emporte ses lignes : elles n'ont aucune
     existence propre, contrairement aux lignes de facture fournisseur qui
     portent un lien de traçabilité vers les réceptions. */
  invoice_id integer not null
    references subcontractor_invoices(id) on delete cascade,
  /* §4.1 badge « PRESTATION ». `frais` est ouvert dès maintenant parce que
     §8.4 l'annonce (frais annexes, transport d'échantillons) et qu'élargir
     un check plus tard coûte une migration de plus. */
  kind text not null default 'prestation'
    check (kind in ('prestation', 'frais')),
  designation text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric not null check (unit_price >= 0),
  discount_pct numeric not null default 0
    check (discount_pct >= 0 and discount_pct <= 100),
  vat_rate numeric not null default 0 check (vat_rate >= 0),
  /* Même formule que les lignes de facture fournisseur, par cohérence
     explicite (§7.2) :
         Total ligne = Qté × PU × (1 − Remise%) × (1 + TVA%)
     Le timbre fiscal n'y entre pas : il est porté par la facture, pas par
     la ligne (voir la note sur l'exemple de §4.1 dans le rapport). */
  line_total_ht numeric
    generated always as (quantity * unit_price * (1 - discount_pct / 100)) stored,
  line_vat numeric
    generated always as (
      quantity * unit_price * (1 - discount_pct / 100) * vat_rate / 100
    ) stored
);

create index subcontractor_invoice_lines_invoice_id_idx
  on subcontractor_invoice_lines (invoice_id);
create index subcontractor_invoice_lines_lab_id_idx
  on subcontractor_invoice_lines (lab_id);

-- ---------------------------------------------------------------------------
-- §3.3 — Récapitulatif
-- ---------------------------------------------------------------------------

/* Les montants de l'encadré, recomposés depuis les lignes : §3.3 exige un
   recalcul à chaque modification, et un total stocké finit par diverger.
   `total_ht` est le brut avant remise, `net_ht` le montant après remise —
   l'écran n'affiche aujourd'hui qu'un « Prix HT », les deux coïncidant
   tant qu'aucune remise n'est saisie. */
create view subcontractor_invoice_totals_view with (security_invoker = true) as
select
  i.id as invoice_id,
  i.lab_id,
  coalesce(sum(l.quantity * l.unit_price), 0)                 as total_ht,
  coalesce(sum(l.quantity * l.unit_price * l.discount_pct / 100), 0)
                                                              as total_discount,
  coalesce(sum(l.line_total_ht), 0)                           as net_ht,
  coalesce(sum(l.line_vat), 0)                                as total_vat,
  i.stamp_duty,
  coalesce(sum(l.line_total_ht), 0)
    + coalesce(sum(l.line_vat), 0)
    + i.stamp_duty                                            as total_ttc
from subcontractor_invoices i
left join subcontractor_invoice_lines l on l.invoice_id = i.id
group by i.id, i.lab_id, i.stamp_duty;

-- ---------------------------------------------------------------------------
-- §7.3 — Numérotation FAC-ST-<année>-<n>
-- ---------------------------------------------------------------------------

/* Séquence par laboratoire et par année, sur le modèle de create_invoice().
   SECURITY INVOKER : le RLS cadre la lecture au laboratoire de l'appelant,
   et le filtre `lab_id` explicite rend l'intention lisible sans dépendre
   uniquement de la politique.

   Le verrou est pris pour la durée de la transaction appelante : appeler
   cette fonction puis insérer dans la même transaction garantit qu'aucun
   autre appel ne tire le même numéro. Appelée hors transaction, elle ne
   protège de rien — l'index unique sur (lab_id, number) reste le filet. */
create or replace function public.next_subcontractor_invoice_number(
  p_issue_date date default current_date
)
returns text
language plpgsql
set search_path = public
as $$
declare
  v_lab int;
  v_year text;
  v_next int;
begin
  v_lab := public.assert_lab_context();

  perform pg_advisory_xact_lock(hashtext('subcontractor_invoice_number'), v_lab);

  v_year := to_char(coalesce(p_issue_date, current_date), 'YYYY');

  select coalesce(
           max((regexp_match(number, '^FAC-ST-' || v_year || '-(\d+)$'))[1]::int),
           0
         ) + 1
  into v_next
  from subcontractor_invoices
  where lab_id = v_lab
    and number like 'FAC-ST-' || v_year || '-%';

  return 'FAC-ST-' || v_year || '-' || lpad(v_next::text, 4, '0');
end;
$$;

revoke all on function public.next_subcontractor_invoice_number(date)
  from public, anon;
grant execute on function public.next_subcontractor_invoice_number(date)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Cloisonnement par laboratoire
-- ---------------------------------------------------------------------------

alter table subcontractors enable row level security;
alter table subcontractor_invoices enable row level security;
alter table subcontractor_invoice_lines enable row level security;

/* Mêmes politiques que le reste du schéma, plus la suppression : §6 prévoit
   un bouton « Supprimer » sur ces trois objets. La restriction de ce droit
   à certains rôles (§8.6) n'est pas tranchée et n'est donc pas posée ici. */
do $$
declare t text;
begin
  foreach t in array array[
    'subcontractors', 'subcontractor_invoices', 'subcontractor_invoice_lines'
  ] loop
    execute format(
      'create policy "lecture par laboratoire" on public.%I
         for select to authenticated
         using (lab_id = (select public.current_lab_id()))', t);
    execute format(
      'create policy "creation par laboratoire" on public.%I
         for insert to authenticated
         with check (lab_id = (select public.current_lab_id()))', t);
    execute format(
      'create policy "modification par laboratoire" on public.%I
         for update to authenticated
         using (lab_id = (select public.current_lab_id()))
         with check (lab_id = (select public.current_lab_id()))', t);
    execute format(
      'create policy "suppression par laboratoire" on public.%I
         for delete to authenticated
         using (lab_id = (select public.current_lab_id()))', t);
    execute format(
      'grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'grant usage, select on sequence public.%I_id_seq to authenticated', t);
  end loop;
end $$;

grant select on public.subcontractor_invoice_totals_view to authenticated;
