"use client";

import { RotateCcw, Search, SlidersHorizontal, X } from "lucide-react";
import type { ProductStockState } from "@/lib/types";
import { cn, formatInt } from "@/lib/utils";

/** "alert" = sous le seuil ou en rupture, l'entrée du tableau de bord. */
export type StateFilter = "all" | ProductStockState | "alert";

export type ExpiryFilter = "all" | "expired" | "soon" | "with_lots" | "no_lots";

export type SortKey =
  | "name"
  | "reference"
  | "stock_asc"
  | "stock_desc"
  | "value_desc"
  | "price_asc"
  | "price_desc"
  | "recent";

export type ProductFilterValues = {
  search: string;
  categoryId: number | "";
  supplierId: number | "";
  state: StateFilter;
  expiry: ExpiryFilter;
  /* Bornes gardées en texte : un champ vidé ne doit pas devenir 0. */
  priceMin: string;
  priceMax: string;
  stockMin: string;
  stockMax: string;
  sort: SortKey;
};

export const EMPTY_FILTERS: ProductFilterValues = {
  search: "",
  categoryId: "",
  supplierId: "",
  state: "all",
  expiry: "all",
  priceMin: "",
  priceMax: "",
  stockMin: "",
  stockMax: "",
  sort: "name",
};

const STATE_LABELS: Record<StateFilter, string> = {
  all: "Tous les états",
  ok: "Disponibles",
  low: "Sous le seuil",
  out: "En rupture",
  alert: "Sous le seuil ou en rupture",
};

const EXPIRY_LABELS: Record<ExpiryFilter, string> = {
  all: "Tous",
  expired: "Avec un lot périmé",
  soon: "Lot périmant sous 30 j",
  with_lots: "Avec des lots en stock",
  no_lots: "Sans lot en stock",
};

const SORT_LABELS: Record<SortKey, string> = {
  name: "Désignation (A → Z)",
  reference: "Référence",
  stock_asc: "Stock croissant",
  stock_desc: "Stock décroissant",
  value_desc: "Valeur de stock",
  price_asc: "Prix croissant",
  price_desc: "Prix décroissant",
  recent: "Plus récents",
};

const FIELD_CLASS =
  "h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

export function ProductFilters({
  value,
  onChange,
  categories,
  suppliers,
  resultCount,
  total,
}: {
  value: ProductFilterValues;
  onChange: (next: ProductFilterValues) => void;
  categories: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  resultCount: number;
  total: number;
}) {
  const set = <K extends keyof ProductFilterValues>(
    key: K,
    next: ProductFilterValues[K]
  ) => onChange({ ...value, [key]: next });

  /* Pastilles des critères actifs : chacune se retire seule, sans avoir à
     retrouver le champ qui l'a posée. */
  const chips: { label: string; clear: () => void }[] = [];
  if (value.search.trim())
    chips.push({ label: `« ${value.search.trim()} »`, clear: () => set("search", "") });
  if (value.categoryId !== "")
    chips.push({
      label: categories.find((c) => c.id === value.categoryId)?.name ?? "Catégorie",
      clear: () => set("categoryId", ""),
    });
  if (value.supplierId !== "")
    chips.push({
      label: suppliers.find((s) => s.id === value.supplierId)?.name ?? "Fournisseur",
      clear: () => set("supplierId", ""),
    });
  if (value.state !== "all")
    chips.push({ label: STATE_LABELS[value.state], clear: () => set("state", "all") });
  if (value.expiry !== "all")
    chips.push({ label: EXPIRY_LABELS[value.expiry], clear: () => set("expiry", "all") });
  if (value.priceMin || value.priceMax)
    chips.push({
      label: `Prix ${range(value.priceMin, value.priceMax)} DT`,
      clear: () => onChange({ ...value, priceMin: "", priceMax: "" }),
    });
  if (value.stockMin || value.stockMax)
    chips.push({
      label: `Stock ${range(value.stockMin, value.stockMax)}`,
      clear: () => onChange({ ...value, stockMin: "", stockMax: "" }),
    });

  return (
    <section className="card p-4">
      <div className="mb-3 flex items-center gap-2">
        <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <SlidersHorizontal size={13} aria-hidden />
          Filtres
        </h2>
        <span className="tnum text-[10px] text-[var(--text-muted)]">
          {formatInt(resultCount)} / {formatInt(total)} produits
        </span>
        <button
          type="button"
          onClick={() => onChange({ ...EMPTY_FILTERS, sort: value.sort })}
          disabled={chips.length === 0}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)] disabled:opacity-40"
        >
          <RotateCcw size={12} aria-hidden />
          Réinitialiser
        </button>
      </div>

      {/* Recherche principale */}
      <div className="relative mb-3">
        <Search
          size={16}
          strokeWidth={2.2}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
          aria-hidden
        />
        <input
          type="search"
          value={value.search}
          onChange={(e) => set("search", e.target.value)}
          placeholder="Rechercher par désignation, référence, réf. fabricant ou fournisseur…"
          aria-label="Rechercher un produit"
          className="h-11 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Catégorie">
          <select
            value={value.categoryId}
            onChange={(e) =>
              set("categoryId", e.target.value === "" ? "" : Number(e.target.value))
            }
            className={FIELD_CLASS}
          >
            <option value="">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Fournisseur">
          <select
            value={value.supplierId}
            onChange={(e) =>
              set("supplierId", e.target.value === "" ? "" : Number(e.target.value))
            }
            className={FIELD_CLASS}
          >
            <option value="">Tous fournisseurs</option>
            {suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="État du stock">
          <select
            value={value.state}
            onChange={(e) => set("state", e.target.value as StateFilter)}
            className={FIELD_CLASS}
          >
            {(Object.keys(STATE_LABELS) as StateFilter[]).map((key) => (
              <option key={key} value={key}>
                {STATE_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Lots / péremption">
          <select
            value={value.expiry}
            onChange={(e) => set("expiry", e.target.value as ExpiryFilter)}
            className={FIELD_CLASS}
          >
            {(Object.keys(EXPIRY_LABELS) as ExpiryFilter[]).map((key) => (
              <option key={key} value={key}>
                {EXPIRY_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Prix unitaire (DT)">
          <RangeInputs
            min={value.priceMin}
            max={value.priceMax}
            step="0.01"
            onMin={(v) => set("priceMin", v)}
            onMax={(v) => set("priceMax", v)}
          />
        </Field>

        <Field label="Quantité en stock">
          <RangeInputs
            min={value.stockMin}
            max={value.stockMax}
            step="1"
            onMin={(v) => set("stockMin", v)}
            onMax={(v) => set("stockMax", v)}
          />
        </Field>

        <Field label="Trier par">
          <select
            value={value.sort}
            onChange={(e) => set("sort", e.target.value as SortKey)}
            className={FIELD_CLASS}
          >
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      {chips.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-[var(--border)] pt-3">
          <span className="mr-1 text-[10px] text-[var(--text-muted)]">
            {chips.length} filtre{chips.length > 1 ? "s" : ""} actif
            {chips.length > 1 ? "s" : ""} :
          </span>
          {chips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={chip.clear}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] font-medium transition-opacity hover:opacity-80"
              style={{
                color: "var(--series-1)",
                background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
              }}
            >
              {chip.label}
              <X size={11} strokeWidth={2.4} aria-hidden />
              <span className="sr-only">Retirer ce filtre</span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function range(min: string, max: string) {
  if (min && max) return `${min} – ${max}`;
  return min ? `≥ ${min}` : `≤ ${max}`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function RangeInputs({
  min,
  max,
  step,
  onMin,
  onMax,
}: {
  min: string;
  max: string;
  step: string;
  onMin: (value: string) => void;
  onMax: (value: string) => void;
}) {
  const cls = cn(FIELD_CLASS, "tnum");
  return (
    <span className="flex items-center gap-1.5">
      <input
        type="number"
        min={0}
        step={step}
        value={min}
        onChange={(e) => onMin(e.target.value)}
        placeholder="Min"
        aria-label="Minimum"
        className={cls}
      />
      <span className="text-[11px] text-[var(--text-muted)]">–</span>
      <input
        type="number"
        min={0}
        step={step}
        value={max}
        onChange={(e) => onMax(e.target.value)}
        placeholder="Max"
        aria-label="Maximum"
        className={cls}
      />
    </span>
  );
}
