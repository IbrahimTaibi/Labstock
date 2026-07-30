"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Package,
  Search,
  Trash2,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { deleteProduct } from "@/app/(app)/products/actions";
import type { ProductState } from "@/app/(app)/products/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import { StockStatusBadge } from "@/components/StockStatusBadge";
import {
  cn,
  formatAmount,
  formatCompact,
  formatDate,
  formatInt,
} from "@/lib/utils";
import type { ProductRow, ProductsWorkspaceData, ProductStockState } from "@/lib/types";
import { ProductForm } from "./ProductForm";

const PAGE_SIZE = 25;

const INPUT_CLASS =
  "h-8 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

type Feedback = { message: string; ok: boolean } | null;
/** "alert" = sous le seuil ou en rupture, l'entrée du tableau de bord. */
export type StateFilter = "all" | ProductStockState | "alert";

function StatFilter({
  label,
  value,
  note,
  color,
  icon,
  active,
  onClick,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
        active ? "bg-[var(--page)]" : "hover:bg-[var(--page)]"
      )}
      style={active ? { boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
    >
      <span className="shrink-0" style={{ color }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="block truncate text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
          {value}
          <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">
            {note}
          </span>
        </span>
      </span>
    </button>
  );
}

export function ProductsWorkspace({
  data,
  initialState = "all",
}: {
  data: ProductsWorkspaceData;
  initialState?: StateFilter;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [stateFilter, setStateFilter] = useState<StateFilter>(initialState);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [page, setPage] = useState(0);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Le formulaire sert à la fois à créer et à modifier : repasser en création
     demande de désélectionner, ce qu'un bouton explicite rend évident. */
  function startCreate() {
    setSelectedId(null);
    setConfirmDelete(false);
  }

  /* Sélection dérivée : si le produit disparaît côté serveur, la fiche et le
     détail se vident d'eux-mêmes. */
  const selected = data.products.find((p) => p.id === selectedId) ?? null;
  const selectedLots = selected
    ? data.lots.filter((l) => l.product_id === selected.id)
    : [];

  function run(action: () => Promise<ProductState>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    });
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.products.filter((p) => {
      if (stateFilter === "alert" && p.state === "ok") return false;
      if (
        stateFilter !== "all" &&
        stateFilter !== "alert" &&
        p.state !== stateFilter
      )
        return false;
      if (categoryId !== "" && p.category_id !== categoryId) return false;
      if (supplierId !== "" && p.supplier_id !== supplierId) return false;
      if (needle === "") return true;
      return (
        p.name.toLowerCase().includes(needle) ||
        p.display_reference.toLowerCase().includes(needle)
      );
    });
  }, [data.products, stateFilter, categoryId, supplierId, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

  function pickFilter(filter: StateFilter) {
    setStateFilter(filter);
    setPage(0);
  }

  return (
    <div className="flex flex-col gap-3">
      {feedback ? (
        <div
          role="status"
          className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
          style={{ color: feedback.ok ? "var(--good)" : "var(--critical)" }}
        >
          {feedback.ok ? (
            <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden />
          ) : (
            <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
          )}
          {feedback.message}
        </div>
      ) : null}

      {/* Synthèse-filtre */}
      <div className="card flex flex-col gap-1 p-1.5 sm:flex-row sm:items-stretch sm:divide-x sm:divide-[var(--border)]">
        <StatFilter
          label="Produits"
          value={formatInt(data.totals.count)}
          note={`${formatCompact(data.totals.stock_value)} de stock`}
          color="var(--series-1)"
          icon={<Package size={16} strokeWidth={2.2} aria-hidden />}
          active={stateFilter === "all"}
          onClick={() => pickFilter("all")}
        />
        <StatFilter
          label="Disponibles"
          value={formatInt(data.totals.ok_count)}
          note="au-dessus du seuil"
          color="var(--good)"
          icon={<CheckCircle2 size={16} strokeWidth={2.2} aria-hidden />}
          active={stateFilter === "ok"}
          onClick={() => pickFilter("ok")}
        />
        <StatFilter
          label="Sous le seuil"
          value={formatInt(data.totals.low_count)}
          note="à recommander"
          color="var(--warning)"
          icon={<AlertTriangle size={16} strokeWidth={2.2} aria-hidden />}
          active={stateFilter === "low" || stateFilter === "alert"}
          onClick={() => pickFilter("low")}
        />
        <StatFilter
          label="En rupture"
          value={formatInt(data.totals.out_count)}
          note="stock à zéro"
          color="var(--critical)"
          icon={<XCircle size={16} strokeWidth={2.2} aria-hidden />}
          active={stateFilter === "out" || stateFilter === "alert"}
          onClick={() => pickFilter("out")}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
        {/* Catalogue */}
        <section className="card min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Catalogue
              <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-muted)]">
                ({formatInt(filtered.length)})
              </span>
            </h2>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <select
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  );
                  setPage(0);
                }}
                className={INPUT_CLASS}
                aria-label="Filtrer par catégorie"
              >
                <option value="">Toutes catégories</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <select
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(
                    e.target.value === "" ? "" : Number(e.target.value)
                  );
                  setPage(0);
                }}
                className={INPUT_CLASS}
                aria-label="Filtrer par fournisseur"
              >
                <option value="">Tous fournisseurs</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search
                  size={13}
                  strokeWidth={2.2}
                  className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <input
                  type="search"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(0);
                  }}
                  placeholder="Nom ou référence…"
                  className={cn(INPUT_CLASS, "w-44 pl-8")}
                />
              </div>
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
              Aucun produit ne correspond à ces critères.
            </p>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Produit</Th>
                  <Th>Référence</Th>
                  <Th>Catégorie</Th>
                  <Th align="right">Stock</Th>
                  <Th align="right">Seuil</Th>
                  <Th align="right">P.U.</Th>
                  <Th align="right">Valeur</Th>
                  <Th>État</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const active = p.id === selectedId;
                  return (
                    <tr
                      key={p.id}
                      onClick={() => {
                        setSelectedId(active ? null : p.id);
                        setConfirmDelete(false);
                      }}
                      aria-selected={active}
                      className={cn(
                        "cursor-pointer transition-colors",
                        active ? "bg-[var(--page)]" : "hover:bg-[var(--page)]"
                      )}
                    >
                      <Td>
                        <span className="font-medium">{p.name}</span>
                        <span className="block text-[9px] text-[var(--text-muted)]">
                          {p.supplier}
                        </span>
                      </Td>
                      <Td nowrap>{p.display_reference}</Td>
                      <Td nowrap>{p.category}</Td>
                      <Td align="right">{formatInt(p.stock_qty)}</Td>
                      <Td align="right">{formatInt(p.min_stock)}</Td>
                      <Td align="right">{formatAmount(p.unit_price)}</Td>
                      <Td align="right">{formatAmount(p.stock_value)}</Td>
                      <Td nowrap>
                        {p.state === "out" ? (
                          <StockStatusBadge status="out_of_stock" />
                        ) : p.state === "low" ? (
                          <StockStatusBadge status="low" />
                        ) : (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            OK
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}

          {filtered.length > PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between">
              <span className="tnum text-[10px] text-[var(--text-muted)]">
                {formatInt(safePage * PAGE_SIZE + 1)}–
                {formatInt(
                  Math.min((safePage + 1) * PAGE_SIZE, filtered.length)
                )}{" "}
                sur {formatInt(filtered.length)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--page)] disabled:opacity-40"
                >
                  <ChevronLeft size={14} strokeWidth={2.2} aria-hidden />
                  <span className="sr-only">Page précédente</span>
                </button>
                <span className="tnum px-1 text-[10px] text-[var(--text-muted)]">
                  {formatInt(safePage + 1)} / {formatInt(pageCount)}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--page)] disabled:opacity-40"
                >
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                  <span className="sr-only">Page suivante</span>
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Colonne latérale : fiche + lots */}
        <div className="flex flex-col gap-3">
          <div>
            <ProductForm
              product={selected}
              categories={data.categories}
              suppliers={data.suppliers}
              pending={pending}
              onRun={run}
              onCancel={() => setSelectedId(null)}
              onCreateNew={startCreate}
            />
          </div>

          {selected ? (
            <section className="card p-4">
              <header className="mb-2 flex items-start justify-between gap-2">
                <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                  Lots en stock
                  <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-muted)]">
                    ({formatInt(selectedLots.length)})
                  </span>
                </h2>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--page)]"
                >
                  <X size={13} strokeWidth={2.2} aria-hidden />
                  <span className="sr-only">Fermer le détail</span>
                </button>
              </header>

              {selectedLots.length === 0 ? (
                <p className="py-1 text-[10px] text-[var(--text-muted)]">
                  Aucun lot détenu : le stock entre par une réception ou une
                  création de lot (page Marchandises).
                </p>
              ) : (
                <ul className="flex flex-col">
                  {selectedLots.map((lot, index) => (
                    <li
                      key={lot.id}
                      className="flex items-center gap-2 border-b border-[var(--border)] py-1.5 text-[10px] last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]">
                        {lot.lot_number}
                      </span>
                      {!lot.is_expired && index === 0 ? (
                        <span
                          className="shrink-0 rounded px-1 py-px text-[9px] font-semibold"
                          style={{
                            color: "var(--good)",
                            background:
                              "color-mix(in srgb, var(--good) 12%, transparent)",
                          }}
                          title="Lot prioritaire : à consommer en premier (FEFO)"
                        >
                          FEFO
                        </span>
                      ) : null}
                      <span
                        className="tnum shrink-0"
                        style={
                          lot.is_expired
                            ? { color: "var(--critical)" }
                            : undefined
                        }
                      >
                        {lot.is_expired ? "périmé " : "exp. "}
                        {formatDate(lot.expiry_date)}
                      </span>
                      <span className="tnum w-12 shrink-0 text-right font-semibold text-[var(--text-primary)]">
                        {formatInt(lot.current_qty)}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-3 border-t border-[var(--border)] pt-3">
                {confirmDelete ? (
                  <div className="flex flex-col gap-2">
                    <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                      Supprimer définitivement « {selected.name} » ? Impossible
                      s&apos;il a des lots, mouvements ou commandes.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => {
                          setConfirmDelete(false);
                          run(() => deleteProduct(selected.id));
                        }}
                        className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                        style={{ background: "var(--critical)" }}
                      >
                        <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                        Confirmer
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        className="flex h-8 items-center rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--critical)]"
                  >
                    <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                    Supprimer ce produit
                  </button>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
