"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  Boxes,
  CheckCircle2,
  Coins,
  FlaskConical,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Tags,
  Trash2,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import { deleteProduct } from "@/app/(app)/products/actions";
import type { ProductState } from "@/app/(app)/products/actions";
import { Donut } from "@/components/charts/Donut";
import { seriesColor } from "@/components/charts/chart-tokens";
import { Td, Th } from "@/components/DataTable";
import { Kpi } from "@/components/Kpi";
import { Pagination } from "@/components/Pagination";
import { cn, formatDate, formatInt, formatTnd } from "@/lib/utils";
import type { ProductRow, ProductsWorkspaceData, ProductStockState } from "@/lib/types";
import { ProductForm, PRODUCT_FORM_ID } from "./ProductForm";

/** "alert" = sous le seuil ou en rupture, l'entrée du tableau de bord. */
export type StateFilter = "all" | ProductStockState | "alert";

const STATE_LABELS: Record<Exclude<StateFilter, "all">, string> = {
  ok: "Disponibles",
  low: "Sous le seuil",
  out: "En rupture",
  alert: "Sous le seuil ou en rupture",
};

/* Le donut garde 5 parts lisibles ; le reste est regroupé. */
const MAX_SLICES = 5;

const TOOLBAR_CLASS =
  "h-10 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

type Feedback = { message: string; ok: boolean } | null;

export function ProductsWorkspace({
  data,
  initialState = "all",
}: {
  data: ProductsWorkspaceData;
  initialState?: StateFilter;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [refreshing, startRefresh] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  /* Incrémenté par « Nouveau » et après une création : remonte le
     formulaire vide même s'il l'était déjà. */
  const [formNonce, setFormNonce] = useState(0);
  const [formValid, setFormValid] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [stateFilter, setStateFilter] = useState<StateFilter>(initialState);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "">("");
  const [supplierId, setSupplierId] = useState<number | "">("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const selected = data.products.find((p) => p.id === selectedId) ?? null;

  function run(action: () => Promise<ProductState>) {
    setFeedback(null);
    const creating = selected === null;
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") {
        if (creating) setFormNonce((n) => n + 1);
        router.refresh();
      }
    });
  }

  function startNew() {
    setSelectedId(null);
    setFormNonce((n) => n + 1);
    setFeedback(null);
  }

  function edit(product: ProductRow) {
    setSelectedId(product.id);
    setConfirmDeleteId(null);
    setFeedback(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function refresh() {
    startRefresh(() => router.refresh());
  }

  function resetPage<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(0);
    };
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.products.filter((p) => {
      if (stateFilter === "alert" && p.state === "ok") return false;
      if (stateFilter !== "all" && stateFilter !== "alert" && p.state !== stateFilter)
        return false;
      if (categoryId !== "" && p.category_id !== categoryId) return false;
      if (supplierId !== "" && p.supplier_id !== supplierId) return false;
      if (!needle) return true;
      return [p.display_reference, p.name, p.manufacturer_ref ?? "", p.category, p.supplier]
        .some((field) => field.toLowerCase().includes(needle));
    });
  }, [data.products, stateFilter, categoryId, supplierId, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  /* Répartition des articles par catégorie, parts décroissantes. */
  const slices = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of data.products) counts.set(p.category, (counts.get(p.category) ?? 0) + 1);
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const head = sorted.slice(0, MAX_SLICES);
    const rest = sorted.slice(MAX_SLICES).reduce((sum, [, n]) => sum + n, 0);
    const result = head.map(([label, value], i) => ({ label, value, color: seriesColor(i) }));
    if (rest > 0) result.push({ label: "Autres", value: rest, color: seriesColor(MAX_SLICES) });
    return result;
  }, [data.products]);

  return (
    <div className="flex flex-col gap-3">
      {/* Indicateurs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi
          icon={<Boxes size={20} aria-hidden />}
          color="var(--series-1)"
          label="Nombre total d'articles"
          value={formatInt(data.totals.count)}
          note="Articles enregistrés"
        />
        <Kpi
          icon={<Tags size={20} aria-hidden />}
          color="var(--series-2)"
          label="Catégories d'articles"
          value={formatInt(data.categories.length)}
          note="Catégories disponibles"
        />
        <Kpi
          icon={<Coins size={20} aria-hidden />}
          color="var(--serious)"
          label="Valeur totale du stock"
          value={formatTnd(data.totals.stock_value)}
          unit="TND"
          note="(Prix HT)"
          emphasis
        />
        <Kpi
          icon={<FlaskConical size={20} aria-hidden />}
          color="var(--good)"
          label="Articles actifs"
          value={formatInt(data.totals.active_count)}
          note="Articles en stock"
        />
        <Kpi
          icon={<XCircle size={20} aria-hidden />}
          color="var(--critical)"
          label="Articles inactifs"
          value={formatInt(data.totals.inactive_count)}
          note="Références non utilisées"
        />
      </div>

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

      {/* 1. Fiche + actions rapides */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
        <ProductForm
          key={selected ? `p${selected.id}` : `new${formNonce}`}
          product={selected}
          nextReference={data.next_reference}
          categories={data.categories}
          suppliers={data.suppliers}
          onRun={run}
          onValidityChange={setFormValid}
        />

        <aside className="card flex flex-col gap-2 p-4">
          <h2 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Actions rapides
          </h2>
          <button
            type="button"
            onClick={startNew}
            className="flex h-10 items-center justify-center gap-2 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--series-1)" }}
          >
            <Plus size={15} aria-hidden />
            Nouveau
          </button>
          <button
            type="submit"
            form={PRODUCT_FORM_ID}
            disabled={pending || !formValid}
            className="flex h-10 items-center justify-center gap-2 rounded-lg text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--serious)" }}
          >
            <Save size={15} aria-hidden />
            {pending ? "Enregistrement…" : selected ? "Enregistrer" : "Valider"}
          </button>
          <button
            type="button"
            onClick={refresh}
            className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] text-[12px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden />
            Actualiser
          </button>
          {selected ? (
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--page)]"
            >
              <X size={13} aria-hidden />
              Annuler la modification
            </button>
          ) : null}
          <p className="mt-auto pt-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
            Le stock n&apos;est pas saisi ici : il évolue par les réceptions,
            les sorties et les inventaires.
          </p>
        </aside>
      </div>

      {/* 2. Liste + répartition */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
        <section className="card min-w-0 p-4">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            2. Liste des articles enregistrés
          </h2>

          <div className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end">
            <div className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => resetPage(setSearch)(e.target.value)}
                placeholder="Rechercher (référence, désignation, fabricant, catégorie…)"
                aria-label="Rechercher un article"
                className={cn(TOOLBAR_CLASS, "w-full pr-9")}
              />
              <Search
                size={16}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--series-1)]"
                aria-hidden
              />
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Catégorie</span>
              <select
                value={categoryId}
                onChange={(e) =>
                  resetPage(setCategoryId)(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={TOOLBAR_CLASS}
              >
                <option value="">Toutes</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[10px] font-semibold text-[var(--text-secondary)]">Fournisseur</span>
              <select
                value={supplierId}
                onChange={(e) =>
                  resetPage(setSupplierId)(e.target.value === "" ? "" : Number(e.target.value))
                }
                className={TOOLBAR_CLASS}
              >
                <option value="">Tous</option>
                {data.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={refresh}
              className="flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-3 text-[12px] font-medium text-[var(--series-1)] transition-colors hover:bg-[var(--page)]"
            >
              <RefreshCw size={14} className={refreshing ? "animate-spin" : undefined} aria-hidden />
              Actualiser
            </button>
          </div>

          {stateFilter !== "all" ? (
            <button
              type="button"
              onClick={() => resetPage(setStateFilter)("all")}
              className="mb-3 inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium"
              style={{
                color: "var(--series-1)",
                background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
              }}
            >
              {STATE_LABELS[stateFilter]}
              <X size={11} strokeWidth={2.4} aria-hidden />
              <span className="sr-only">Retirer ce filtre</span>
            </button>
          ) : null}

          <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
            <table className="w-full min-w-[980px] border-collapse text-[11px]">
              <thead style={{ background: "var(--series-1)" }}>
                <tr>
                  <Head>Référence</Head>
                  <Head>Réf. fabricant</Head>
                  <Head>Désignation</Head>
                  <Head>Conditionnement</Head>
                  <Head>Catégorie</Head>
                  <Head>Date création</Head>
                  <Head align="right">Prix HT (TND)</Head>
                  <Head align="right">TVA</Head>
                  <Head align="right">Prix TTC (TND)</Head>
                  <Head align="center">Actions</Head>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const ttc = p.unit_price * (1 + p.vat_rate / 100);
                  const confirming = confirmDeleteId === p.id;
                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "transition-colors",
                        p.id === selectedId ? "bg-[var(--page)]" : "hover:bg-[var(--page)]"
                      )}
                    >
                      <Td nowrap className="font-semibold">{p.display_reference}</Td>
                      <Td nowrap>{p.manufacturer_ref ?? "—"}</Td>
                      <Td>
                        <span className="block max-w-[240px] truncate">{p.name}</span>
                      </Td>
                      <Td>
                        <span className="block max-w-[180px] truncate">{p.packaging ?? "—"}</span>
                      </Td>
                      <Td nowrap className="uppercase">{p.category}</Td>
                      <Td nowrap>{formatDate(p.created_at)}</Td>
                      <Td align="right" className="tnum">{formatTnd(p.unit_price)}</Td>
                      <Td align="right" className="tnum">{formatInt(p.vat_rate)}%</Td>
                      <Td align="right" className="tnum font-semibold">{formatTnd(ttc)}</Td>
                      <Td align="center" nowrap>
                        {confirming ? (
                          <span className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => {
                                setConfirmDeleteId(null);
                                if (selectedId === p.id) setSelectedId(null);
                                run(() => deleteProduct(p.id));
                              }}
                              className="rounded px-2 py-1 text-[10px] font-semibold text-white disabled:opacity-50"
                              style={{ background: "var(--critical)" }}
                            >
                              Supprimer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                            >
                              Non
                            </button>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1">
                            <IconButton
                              label={`Modifier ${p.name}`}
                              color="var(--series-1)"
                              onClick={() => edit(p)}
                            >
                              <Pencil size={13} aria-hidden />
                            </IconButton>
                            <IconButton
                              label={`Supprimer ${p.name}`}
                              color="var(--critical)"
                              onClick={() => setConfirmDeleteId(p.id)}
                            >
                              <Trash2 size={13} aria-hidden />
                            </IconButton>
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}

                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]">
                      Aucun article ne correspond à ces critères.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <Pagination
            page={current}
            pageCount={pageCount}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </section>

        <aside className="card p-4">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Répartition
          </h2>
          <p className="mb-3 text-[10px] text-[var(--text-muted)]">Articles par catégorie</p>
          {slices.length ? (
            <div className="[&>div]:flex-col [&>div]:items-stretch">
              <Donut slices={slices} centerLabel="articles" integer size={150} />
            </div>
          ) : (
            <p className="py-6 text-center text-[10px] text-[var(--text-muted)]">Aucun article.</p>
          )}
        </aside>
      </div>
    </div>
  );
}

/** En-tête de colonne sur fond plein, comme la maquette. */
function Head({
  children,
  align,
}: {
  children: React.ReactNode;
  align?: "left" | "right" | "center";
}) {
  return (
    <Th align={align} className="whitespace-nowrap border-0 py-2.5 font-semibold text-white">
      {children}
    </Th>
  );
}

function IconButton({
  label,
  color,
  onClick,
  children,
}: {
  label: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="grid h-7 w-7 place-items-center rounded-md transition-opacity hover:opacity-80"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </button>
  );
}
