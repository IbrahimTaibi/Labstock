"use client";

import Link from "next/link";
import { History, Pencil, ScanBarcode, X } from "lucide-react";
import {
  ConformityBadge,
  DaysLeft,
  ExpiryDate,
  FefoBadge,
  FefoRank,
} from "./FefoBadge";
import { lotConformity } from "@/lib/lot-conformity";
import type { Lot } from "@/lib/types";
import { formatAmount, formatDateTime, formatInt } from "@/lib/utils";

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[7px] text-[11px] last:border-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}

export function LotDetails({
  lot,
  onClose,
  onEdit,
}: {
  lot: Lot | null;
  onClose: () => void;
  onEdit: (lot: Lot) => void;
}) {
  if (!lot) {
    return (
      <aside className="card p-4">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Détail du lot
        </h2>
        <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
          Sélectionnez un lot dans la liste
          <br />
          pour afficher sa fiche complète.
        </p>
      </aside>
    );
  }

  const conformity = lotConformity(lot);

  return (
    <aside className="card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Détail du lot sélectionné
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le détail"
          className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div>
        <Row label="Désignation">{lot.product_name}</Row>
        <Row label="Référence interne">{lot.internal_ref ?? "—"}</Row>
        <Row label="Référence fabricant">{lot.manufacturer_ref ?? "—"}</Row>
        <Row label="Catégorie">{lot.category}</Row>
        <Row label="Fabricant">{lot.manufacturer ?? "—"}</Row>
        <Row label="Fournisseur">{lot.supplier}</Row>
        <Row label="Conditionnement">{lot.packaging ?? "—"}</Row>
        <Row label="Lot">{lot.lot_number}</Row>
        <Row label="Date de péremption">
          <ExpiryDate lot={lot} />
        </Row>
        <Row label="Jours restants">
          <DaysLeft days={lot.days_left} />
        </Row>
        <Row label="Stock initial">{formatInt(lot.initial_qty)} unités</Row>
        <Row label="Stock actuel">{formatInt(lot.current_qty)} unités</Row>
        <Row label="Prix HT (DT)">
          {lot.price_ht === null ? "—" : formatAmount(lot.price_ht)}
        </Row>
        <Row label="Prix unitaire (DT)">
          {lot.unit_price === null ? "—" : formatAmount(lot.unit_price)}
        </Row>
        <Row label="Statut FEFO">
          <FefoBadge lot={lot} detailed />
        </Row>
        <Row label="Priorité FEFO">
          <FefoRank rank={lot.fefo_rank} />
        </Row>
        <Row label="Conformité">
          <ConformityBadge lot={lot} />
        </Row>
      </div>

      {conformity.reasons.length > 0 ? (
        <ul className="mt-2 space-y-0.5">
          {conformity.reasons.map((reason) => (
            <li
              key={reason}
              className="text-[10px] leading-relaxed"
              style={{ color: "var(--serious)" }}
            >
              • {reason}
            </li>
          ))}
        </ul>
      ) : null}

      <h3 className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Historique
      </h3>
      <div>
        <Row label="Créé le">{formatDateTime(lot.created_at)}</Row>
        <Row label="Créé par">{lot.created_by}</Row>
        <Row label="Dernière modif.">
          {lot.updated_at ? formatDateTime(lot.updated_at) : "—"}
        </Row>
        <Row label="Modifié par">{lot.updated_by ?? "—"}</Row>
      </div>

      <h3 className="mb-1 mt-4 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Commentaire
      </h3>
      <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
        {lot.comment ?? "Aucune remarque."}
      </p>

      <button
        type="button"
        onClick={() => onEdit(lot)}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--series-1)" }}
      >
        <Pencil size={13} aria-hidden />
        Modifier ce lot
      </button>

      <div className="mt-2 flex gap-2">
        <Link
          href={`/goods/${lot.id}/history`}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-2 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
        >
          <History size={12} aria-hidden />
          Historique complet
        </Link>
        <a
          href={`/goods/barcodes/print?ids=${lot.id}`}
          target="_blank"
          rel="noopener"
          className="flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-2 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
          title="Imprimer l'étiquette code-barres de ce lot"
        >
          <ScanBarcode size={12} aria-hidden />
          Étiquette
        </a>
      </div>
    </aside>
  );
}
