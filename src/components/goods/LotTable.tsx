"use client";

import { useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Pencil,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { Td, Th } from "@/components/DataTable";
import { DaysLeft, FefoBadge, FefoRank } from "./FefoBadge";
import type { Lot } from "@/lib/types";
import { formatAmount, formatDate, formatInt } from "@/lib/utils";

type FefoFilter = "all" | "active" | "inactive";
type ExpiryFilter = "all" | "soon" | "expired" | "valid";

const PAGE_SIZE = 25;

export function LotTable({
  lots,
  selectedId,
  onSelect,
  onEdit,
}: {
  lots: Lot[];
  selectedId: number | null;
  onSelect: (lot: Lot) => void;
  onEdit: (lot: Lot) => void;
}) {
  const [search, setSearch] = useState("");
  const [fefo, setFefo] = useState<FefoFilter>("all");
  const [expiry, setExpiry] = useState<ExpiryFilter>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return lots.filter((lot) => {
      if (needle) {
        const haystack = [
          lot.product_name,
          lot.lot_number,
          lot.internal_ref,
          lot.manufacturer_ref,
          lot.supplier,
          lot.category,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }

      if (fefo === "active" && lot.fefo_rank !== 1) return false;
      if (fefo === "inactive" && lot.fefo_rank === 1) return false;

      if (expiry === "expired" && !lot.is_expired) return false;
      if (expiry === "valid" && lot.is_expired) return false;
      if (expiry === "soon" && (lot.is_expired || lot.days_left >= 30)) return false;

      return true;
    });
  }, [lots, search, fefo, expiry]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  const selectClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Liste des marchandises (lots)
        </h2>

        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            value={search}
            onChange={(event) => update(setSearch)(event.target.value)}
            placeholder="Rechercher (désignation, lot, référence…)"
            aria-label="Rechercher un lot"
            className="w-[248px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-7 pr-2 text-[11px] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
          />
        </div>

        <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          Statut FEFO
          <select
            value={fefo}
            onChange={(event) => update(setFefo)(event.target.value as FefoFilter)}
            className={selectClass}
          >
            <option value="all">Tous</option>
            <option value="active">Actif</option>
            <option value="inactive">Inactif</option>
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-[10px] text-[var(--text-muted)]">
          Péremption
          <select
            value={expiry}
            onChange={(event) => update(setExpiry)(event.target.value as ExpiryFilter)}
            className={selectClass}
          >
            <option value="all">Toutes</option>
            <option value="soon">Moins de 30 jours</option>
            <option value="expired">Périmés</option>
            <option value="valid">Valides</option>
          </select>
        </label>

        <span className="flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
          <SlidersHorizontal size={12} aria-hidden />
          {formatInt(filtered.length)} résultats
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px] border-collapse text-[11px]">
          <thead>
            <tr>
              <Th align="center">Priorité</Th>
              <Th>Désignation</Th>
              <Th>Réf. interne</Th>
              <Th>Fournisseur</Th>
              <Th>Lot</Th>
              <Th>Péremption</Th>
              <Th align="right">Restant</Th>
              <Th align="right">Stock</Th>
              <Th align="right">Prix HT</Th>
              <Th align="right">Prix unit.</Th>
              <Th>Statut FEFO</Th>
              <Th align="center">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((lot) => (
              <tr
                key={lot.id}
                onClick={() => onSelect(lot)}
                className="cursor-pointer transition-colors hover:bg-[var(--page)]"
                style={
                  lot.id === selectedId
                    ? {
                        background:
                          "color-mix(in srgb, var(--series-1) 8%, transparent)",
                      }
                    : undefined
                }
              >
                <Td align="center">
                  <FefoRank rank={lot.fefo_rank} />
                </Td>
                <Td>
                  <span className="block max-w-[210px] truncate font-medium">
                    {lot.product_name}
                  </span>
                  <span className="text-[9px] text-[var(--text-muted)]">
                    {lot.category}
                  </span>
                </Td>
                <Td nowrap>{lot.internal_ref ?? "—"}</Td>
                <Td>
                  <span className="block max-w-[130px] truncate">{lot.supplier}</span>
                </Td>
                <Td nowrap>{lot.lot_number}</Td>
                <Td nowrap>{formatDate(lot.expiry_date)}</Td>
                <Td align="right">
                  <DaysLeft days={lot.days_left} />
                </Td>
                <Td align="right">{formatInt(lot.current_qty)}</Td>
                <Td align="right">
                  {lot.price_ht === null ? "—" : formatAmount(lot.price_ht)}
                </Td>
                <Td align="right">
                  {lot.unit_price === null ? "—" : formatAmount(lot.unit_price)}
                </Td>
                <Td>
                  <FefoBadge lot={lot} />
                </Td>
                <Td align="center">
                  <span className="flex items-center justify-center gap-1">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(lot);
                      }}
                      title="Voir le détail"
                      className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--series-1)]"
                    >
                      <Eye size={13} aria-hidden />
                      <span className="sr-only">Voir {lot.lot_number}</span>
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onEdit(lot);
                      }}
                      title="Modifier"
                      className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--series-1)]"
                    >
                      <Pencil size={13} aria-hidden />
                      <span className="sr-only">Modifier {lot.lot_number}</span>
                    </button>
                  </span>
                </Td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={12}
                  className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                >
                  Aucun lot ne correspond à ces critères.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span>
          {filtered.length === 0
            ? "Aucun lot"
            : `Affichage de ${current * PAGE_SIZE + 1} à ${Math.min(
                (current + 1) * PAGE_SIZE,
                filtered.length
              )} sur ${formatInt(filtered.length)} lots`}
        </span>

        <div className="flex items-center gap-1">
          <PageButton
            onClick={() => setPage(0)}
            disabled={current === 0}
            label="Première page"
          >
            <ChevronsLeft size={13} aria-hidden />
          </PageButton>
          <PageButton
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            label="Page précédente"
          >
            <ChevronLeft size={13} aria-hidden />
          </PageButton>
          <span className="tnum px-2 font-medium text-[var(--text-primary)]">
            {current + 1} / {pageCount}
          </span>
          <PageButton
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
            label="Page suivante"
          >
            <ChevronRight size={13} aria-hidden />
          </PageButton>
          <PageButton
            onClick={() => setPage(pageCount - 1)}
            disabled={current >= pageCount - 1}
            label="Dernière page"
          >
            <ChevronsRight size={13} aria-hidden />
          </PageButton>
        </div>
      </div>
    </section>
  );
}

function PageButton({
  onClick,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  disabled: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="grid h-6 w-6 place-items-center rounded border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)] disabled:opacity-40 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}
