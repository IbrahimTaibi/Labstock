"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  Loader2,
  Pencil,
  RotateCw,
  ScanBarcode,
  Search,
  SlidersHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Td, Th } from "@/components/DataTable";
import { deleteLot } from "@/app/(app)/goods/actions";
import { lotConformity } from "@/lib/lot-conformity";
import { DaysLeft, ExpiryDate, FefoBadge, FefoRank } from "./FefoBadge";
import type { Lot } from "@/lib/types";
import { cn, formatAmount, formatInt } from "@/lib/utils";

type FefoFilter = "all" | "active" | "inactive";
type ExpiryFilter = "all" | "soon" | "expired" | "valid";
type StockFilter = "all" | "instock" | "empty";
type ConformityFilter = "all" | "ok" | "ko";

const PAGE_SIZE = 25;

const EMPTY_ADVANCED = {
  supplier: "",
  category: "",
  stock: "all" as StockFilter,
  conformity: "all" as ConformityFilter,
};

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
  const router = useRouter();

  const [search, setSearch] = useState("");
  const [fefo, setFefo] = useState<FefoFilter>("all");
  const [expiry, setExpiry] = useState<ExpiryFilter>("all");
  const [advanced, setAdvanced] = useState(EMPTY_ADVANCED);
  const [showFilters, setShowFilters] = useState(false);
  const [page, setPage] = useState(0);

  const [picked, setPicked] = useState<Set<number>>(new Set());
  const [pendingDelete, setPendingDelete] = useState<Lot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, startTransition] = useTransition();

  const suppliers = useMemo(
    () => [...new Set(lots.map((lot) => lot.supplier))].sort(),
    [lots]
  );
  const categories = useMemo(
    () => [...new Set(lots.map((lot) => lot.category))].sort(),
    [lots]
  );

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

      if (advanced.supplier && lot.supplier !== advanced.supplier) return false;
      if (advanced.category && lot.category !== advanced.category) return false;
      if (advanced.stock === "instock" && lot.current_qty === 0) return false;
      if (advanced.stock === "empty" && lot.current_qty > 0) return false;

      if (advanced.conformity !== "all") {
        const { conforme } = lotConformity(lot);
        if (advanced.conformity === "ok" && !conforme) return false;
        if (advanced.conformity === "ko" && conforme) return false;
      }

      return true;
    });
  }, [lots, search, fefo, expiry, advanced]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  /* La sélection est recoupée avec les lots réellement présents plutôt que
     purgée dans un effet : un lot supprimé ailleurs cesse de compter sans
     qu'on ait à resynchroniser quoi que ce soit. */
  const pickedIds = useMemo(
    () => lots.filter((lot) => picked.has(lot.id)).map((lot) => lot.id),
    [lots, picked]
  );

  function update<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  /* Tout changement de filtre ramène en page 1 : rester en page 12 d'un
     jeu de résultats qui n'en compte plus que 2 affiche un tableau vide. */
  function setFilter(patch: Partial<typeof EMPTY_ADVANCED>) {
    setAdvanced((previous) => ({ ...previous, ...patch }));
    setPage(0);
  }

  function toggle(id: number) {
    setPicked((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const pageIds = rows.map((lot) => lot.id);
  const allOnPagePicked = pageIds.length > 0 && pageIds.every((id) => picked.has(id));

  function togglePage() {
    setPicked((previous) => {
      const next = new Set(previous);
      if (allOnPagePicked) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  }

  function confirmDelete() {
    const lot = pendingDelete;
    if (!lot) return;
    setPendingDelete(null);
    setError(null);
    startTransition(async () => {
      const result = await deleteLot(lot.id);
      if (result.status === "error") setError(result.message);
    });
  }

  const filtersActive =
    advanced.supplier !== "" ||
    advanced.category !== "" ||
    advanced.stock !== "all" ||
    advanced.conformity !== "all";

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

        <button
          type="button"
          onClick={() => setShowFilters((open) => !open)}
          aria-expanded={showFilters}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-medium transition-colors"
          style={
            filtersActive
              ? {
                  borderColor: "var(--series-1)",
                  color: "var(--series-1)",
                  background: "color-mix(in srgb, var(--series-1) 10%, transparent)",
                }
              : { borderColor: "var(--border)", color: "var(--text-secondary)" }
          }
        >
          <SlidersHorizontal size={12} aria-hidden />
          Filtres
          {filtersActive ? " •" : ""}
        </button>

        <button
          type="button"
          onClick={() => router.refresh()}
          title="Rafraîchir la liste"
          className="grid h-[28px] w-[28px] place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
        >
          <RotateCw size={13} aria-hidden />
          <span className="sr-only">Rafraîchir la liste</span>
        </button>
      </div>

      {showFilters ? (
        <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-[var(--border)] bg-[var(--page)] p-3">
          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-muted)]">
            Fournisseur
            <select
              value={advanced.supplier}
              onChange={(event) => setFilter({ supplier: event.target.value })}
              className={selectClass}
            >
              <option value="">Tous</option>
              {suppliers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-muted)]">
            Catégorie
            <select
              value={advanced.category}
              onChange={(event) => setFilter({ category: event.target.value })}
              className={selectClass}
            >
              <option value="">Toutes</option>
              {categories.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-muted)]">
            Stock
            <select
              value={advanced.stock}
              onChange={(event) =>
                setFilter({ stock: event.target.value as StockFilter })
              }
              className={selectClass}
            >
              <option value="all">Tous</option>
              <option value="instock">Stock restant</option>
              <option value="empty">Épuisés</option>
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[10px] text-[var(--text-muted)]">
            Conformité
            <select
              value={advanced.conformity}
              onChange={(event) =>
                setFilter({ conformity: event.target.value as ConformityFilter })
              }
              className={selectClass}
            >
              <option value="all">Toutes</option>
              <option value="ok">Conformes</option>
              <option value="ko">Non conformes</option>
            </select>
          </label>

          {filtersActive ? (
            <button
              type="button"
              onClick={() => setFilter(EMPTY_ADVANCED)}
              className="text-[10px] font-medium text-[var(--series-1)] hover:underline"
            >
              Réinitialiser les filtres
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mb-2 flex flex-wrap items-center gap-2 text-[10px] text-[var(--text-muted)]">
        <span>{formatInt(filtered.length)} résultats</span>

        {pickedIds.length > 0 ? (
          <>
            <span className="text-[var(--text-secondary)]">
              · {formatInt(pickedIds.length)} sélectionné
              {pickedIds.length > 1 ? "s" : ""}
            </span>
            <a
              href={`/goods/barcodes/print?ids=${pickedIds.join(",")}`}
              target="_blank"
              rel="noopener"
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[10px] font-semibold text-white"
              style={{ background: "var(--series-1)" }}
            >
              <ScanBarcode size={12} aria-hidden />
              Imprimer les étiquettes
            </a>
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-[10px] font-medium text-[var(--series-1)] hover:underline"
            >
              Tout désélectionner
            </button>
          </>
        ) : null}

        {busy ? (
          <Loader2 size={12} className="animate-spin" aria-hidden />
        ) : null}
      </div>

      {error ? (
        <p
          role="alert"
          className="mb-2 flex items-start gap-1.5 rounded-lg px-3 py-2 text-[11px] font-medium"
          style={{
            color: "var(--critical)",
            background: "color-mix(in srgb, var(--critical) 10%, transparent)",
          }}
        >
          <TriangleAlert size={13} className="mt-px shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1060px] border-collapse text-[11px]">
          <thead>
            <tr>
              <Th align="center">
                <input
                  type="checkbox"
                  checked={allOnPagePicked}
                  onChange={togglePage}
                  aria-label="Sélectionner les lots de cette page"
                  className="cursor-pointer align-middle"
                />
              </Th>
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
                /* §7.1 : le clic charge à la fois la fiche de droite et le
                   formulaire du haut en mode modification. */
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
                  <input
                    type="checkbox"
                    checked={picked.has(lot.id)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={() => toggle(lot.id)}
                    aria-label={`Sélectionner le lot ${lot.lot_number}`}
                    className="cursor-pointer align-middle"
                  />
                </Td>
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
                <Td nowrap>
                  <ExpiryDate lot={lot} />
                </Td>
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
                    <RowAction
                      title="Voir le détail"
                      label={`Voir ${lot.lot_number}`}
                      onClick={() => onSelect(lot)}
                    >
                      <Eye size={13} aria-hidden />
                    </RowAction>
                    <RowAction
                      title="Modifier"
                      label={`Modifier ${lot.lot_number}`}
                      onClick={() => onEdit(lot)}
                    >
                      <Pencil size={13} aria-hidden />
                    </RowAction>
                    <RowAction
                      title="Supprimer"
                      label={`Supprimer ${lot.lot_number}`}
                      danger
                      onClick={() => {
                        setError(null);
                        setPendingDelete(lot);
                      }}
                    >
                      <Trash2 size={13} aria-hidden />
                    </RowAction>
                  </span>
                </Td>
              </tr>
            ))}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={13}
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

          {pageNumbers(current, pageCount).map((entry, index) =>
            entry === null ? (
              <span key={`gap-${index}`} className="px-1">
                …
              </span>
            ) : (
              <button
                key={entry}
                type="button"
                onClick={() => setPage(entry)}
                aria-current={entry === current ? "page" : undefined}
                className="tnum grid h-6 min-w-[24px] place-items-center rounded border px-1 font-medium transition-colors"
                style={
                  entry === current
                    ? {
                        background: "var(--series-1)",
                        borderColor: "var(--series-1)",
                        color: "#fff",
                      }
                    : {
                        borderColor: "var(--border)",
                        color: "var(--text-secondary)",
                      }
                }
              >
                {entry + 1}
              </button>
            )
          )}

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

      {pendingDelete ? (
        <DeleteDialog
          lot={pendingDelete}
          onCancel={() => setPendingDelete(null)}
          onConfirm={confirmDelete}
        />
      ) : null}
    </section>
  );
}

/**
 * Fenêtre de pagination : les extrémités restent toujours atteignables,
 * l'entre-deux est résumé par une ellipse. `null` marque une coupure.
 */
function pageNumbers(current: number, count: number): (number | null)[] {
  if (count <= 7) return Array.from({ length: count }, (_, index) => index);

  const around = [current - 1, current, current + 1].filter(
    (page) => page > 0 && page < count - 1
  );
  const pages = new Set<number>([0, ...around, count - 1]);
  const sorted = [...pages].sort((a, b) => a - b);

  const result: (number | null)[] = [];
  sorted.forEach((page, index) => {
    if (index > 0 && page - sorted[index - 1] > 1) result.push(null);
    result.push(page);
  });
  return result;
}

function RowAction({
  title,
  label,
  onClick,
  danger,
  children,
}: {
  title: string;
  label: string;
  onClick: () => void;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)]",
        danger
          ? "hover:text-[var(--critical)]"
          : "hover:text-[var(--series-1)]"
      )}
    >
      {children}
      <span className="sr-only">{label}</span>
    </button>
  );
}

/** Confirmation de suppression : irréversible, donc jamais en un seul clic. */
function DeleteDialog({
  lot,
  onCancel,
  onConfirm,
}: {
  lot: Lot;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-lot-title"
        onClick={(event) => event.stopPropagation()}
        className="card w-full max-w-sm p-4"
      >
        <h3
          id="delete-lot-title"
          className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]"
        >
          <TriangleAlert
            size={15}
            strokeWidth={2.4}
            style={{ color: "var(--critical)" }}
            aria-hidden
          />
          Supprimer le lot {lot.lot_number} ?
        </h3>

        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          {lot.product_name} — {formatInt(lot.current_qty)} unité
          {lot.current_qty > 1 ? "s" : ""} encore en stock.
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
          La suppression est définitive et recalcule la priorité FEFO des
          autres lots de ce produit. Un lot déjà engagé dans un comptage
          d&apos;inventaire ne peut pas être supprimé.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onConfirm}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white"
            style={{ background: "var(--critical)" }}
          >
            <Trash2 size={12} strokeWidth={2.2} aria-hidden />
            Supprimer définitivement
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 items-center rounded-lg border border-[var(--border)] px-3 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
          >
            Annuler
          </button>
        </div>
      </div>
    </div>
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
