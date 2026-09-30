"use client";

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Boxes,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { applyFilters, summarize } from "@/lib/analytics-summary";
import type {
  AnalyticsFilters,
  AnalyticsWorkspaceData,
  AnalyticsRow,
  AnalyticsStatus,
} from "@/lib/types";
import { formatAmount, formatInt } from "@/lib/utils";
import { AnalyticsCharts } from "./AnalyticsCharts";
import { ArticlePanel } from "./ArticlePanel";
import { ArticlesTable } from "./ArticlesTable";

const COVERAGE_MIN = [
  { label: "Aucun minimum", value: "" },
  { label: "7 jours", value: "7" },
  { label: "15 jours", value: "15" },
  { label: "30 jours", value: "30" },
];

const COVERAGE_MAX = [
  { label: "Aucun maximum", value: "" },
  { label: "1 mois", value: "30" },
  { label: "3 mois", value: "90" },
  { label: "6 mois", value: "180" },
];

const STATUSES: { label: string; value: AnalyticsStatus | "all" }[] = [
  { label: "Tous", value: "all" },
  { label: "Sain", value: "sain" },
  { label: "Alerte", value: "alerte" },
  { label: "Rupture", value: "rupture" },
  { label: "Sur-stock", value: "surstock" },
];

const EMPTY: AnalyticsFilters = {
  coverageMin: null,
  coverageMax: null,
  status: "all",
  category: "",
  supplier: "",
};

const selectClass =
  "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

export function AnalyticsWorkspace({ data }: { data: AnalyticsWorkspaceData }) {
  const router = useRouter();

  /* `draft` est ce que l'utilisateur manipule, `applied` ce qui est
     réellement calculé. Les séparer est ce qui donne un sens au bouton
     « Calculer » : sans cela il n'aurait rien à déclencher. */
  const [draft, setDraft] = useState<AnalyticsFilters>(EMPTY);
  const [applied, setApplied] = useState<AnalyticsFilters>(EMPTY);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const rows = useMemo(
    () => applyFilters(data.rows, applied, search),
    [data.rows, applied, search]
  );

  const totals = useMemo(
    () => summarize(rows, data.catalogueArticles),
    [rows, data.catalogueArticles]
  );

  const selected = rows.find((row) => row.product_id === selectedId) ?? null;

  const orderable = rows.filter((row) => row.order_quantity > 0);
  const orderValue = orderable.reduce((sum, row) => sum + row.order_value, 0);

  const dirty = JSON.stringify(draft) !== JSON.stringify(applied);

  const printHref = `/analytics/print?${new URLSearchParams({
    ...(applied.status !== "all" ? { status: applied.status } : {}),
    ...(applied.category ? { category: applied.category } : {}),
    ...(applied.supplier ? { supplier: applied.supplier } : {}),
    ...(applied.coverageMin !== null ? { min: String(applied.coverageMin) } : {}),
    ...(applied.coverageMax !== null ? { max: String(applied.coverageMax) } : {}),
    ...(search.trim() ? { q: search.trim() } : {}),
  }).toString()}`;

  /* L'export reprend exactement les lignes affichées : un fichier qui
     ignorerait les filtres actifs contredirait ce que l'écran montre. */
  function exportCsv() {
    const header = [
      "Référence", "Désignation", "Catégorie", "Fournisseur",
      "Stock initial", "Entrées", "Sorties", "Stock final", "Stock moyen",
      "CMJ 30j", "CMJ 90j", "Couverture (j)", "Rotation", "CUMP",
      "Valeur stock", "SDS", "SDA", "Min", "Max", "Statut",
      "Qté à commander", "Valeur commande",
    ];

    const escape = (value: string | number | null) => {
      const text = value === null ? "" : String(value);
      return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };

    const body = rows.map((row) =>
      [
        row.reference, row.product_name, row.category, row.supplier,
        row.stock_initial, row.entries, row.exits, row.stock_final,
        row.stock_average, row.cmj_short, row.cmj_long,
        row.coverage_days, row.rotation, row.cump, row.stock_value,
        row.safety_stock, row.alert_stock, row.min_stock, row.max_stock,
        row.status, row.order_quantity, row.order_value,
      ].map(escape).join(";")
    );

    /* BOM en tête : sans lui, Excel lit l'UTF-8 en ANSI et casse les accents. */
    const blob = new Blob(["﻿" + [header.join(";"), ...body].join("\r\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `inventaire-analytique-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-3">
      <section className="card flex flex-wrap items-end gap-2 p-3">
        <Filter label="Couverture min.">
          <select
            value={draft.coverageMin === null ? "" : String(draft.coverageMin)}
            onChange={(event) =>
              setDraft({
                ...draft,
                coverageMin: event.target.value ? Number(event.target.value) : null,
              })
            }
            className={selectClass}
          >
            {COVERAGE_MIN.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Couverture max.">
          <select
            value={draft.coverageMax === null ? "" : String(draft.coverageMax)}
            onChange={(event) =>
              setDraft({
                ...draft,
                coverageMax: event.target.value ? Number(event.target.value) : null,
              })
            }
            className={selectClass}
          >
            {COVERAGE_MAX.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Statut stock">
          <select
            value={draft.status}
            onChange={(event) =>
              setDraft({ ...draft, status: event.target.value as AnalyticsStatus | "all" })
            }
            className={selectClass}
          >
            {STATUSES.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Catégorie">
          <select
            value={draft.category}
            onChange={(event) => setDraft({ ...draft, category: event.target.value })}
            className={selectClass}
          >
            <option value="">Toutes les catégories</option>
            {data.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Fournisseur">
          <select
            value={draft.supplier}
            onChange={(event) => setDraft({ ...draft, supplier: event.target.value })}
            className={selectClass}
          >
            <option value="">Tous les fournisseurs</option>
            {data.suppliers.map((supplier) => (
              <option key={supplier} value={supplier}>
                {supplier}
              </option>
            ))}
          </select>
        </Filter>

        <div className="ml-auto flex items-end gap-2">
          <button
            type="button"
            onClick={() => {
              setApplied(draft);
              setSelectedId(null);
              router.refresh();
            }}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
            style={{
              background: "var(--series-1)",
              /* Un léger relief tant que des filtres sont en attente : le
                 bouton doit se signaler quand il a quelque chose à faire. */
              boxShadow: dirty ? "0 0 0 3px color-mix(in srgb, var(--series-1) 25%, transparent)" : "none",
            }}
          >
            <RefreshCw size={13} aria-hidden />
            Calculer
          </button>

          <button
            type="button"
            disabled={orderable.length === 0}
            title={
              orderable.length === 0
                ? "Aucun article sous son seuil d'alerte."
                : `Exporter ${orderable.length} article(s) à commander`
            }
            onClick={exportCsv}
            className="flex items-center gap-2 rounded-lg px-3.5 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: "var(--series-2)" }}
          >
            <ShoppingCart size={13} aria-hidden />
            Estimation commande
            {orderable.length > 0 ? (
              <span className="tnum rounded bg-black/20 px-1.5 py-0.5 text-[9px]">
                {formatAmount(orderValue)} DT
              </span>
            ) : null}
          </button>
        </div>
      </section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Valeur totale stock"
          value={`${formatAmount(totals.totalValue)} DT`}
          note={`${formatInt(totals.articles)} article${totals.articles > 1 ? "s" : ""} analysé${totals.articles > 1 ? "s" : ""}`}
          color="var(--series-1)"
          icon={<Wallet size={16} strokeWidth={2.2} />}
        />
        <Kpi
          label="Valeur stock direct"
          value={`${formatAmount(totals.directValue)} DT`}
          note={share(totals.directValue, totals.totalValue)}
          color="var(--series-2)"
          icon={<Boxes size={16} strokeWidth={2.2} />}
        />
        <Kpi
          label="Valeur stock de sécurité"
          value={`${formatAmount(totals.safetyValue)} DT`}
          note={share(totals.safetyValue, totals.totalValue)}
          color="var(--good)"
          icon={<ShieldCheck size={16} strokeWidth={2.2} />}
        />
        <Kpi
          label="Valeur stock d'alerte"
          value={`${formatAmount(totals.alertValue)} DT`}
          note={share(totals.alertValue, totals.totalValue)}
          color="var(--critical)"
          icon={<ShieldAlert size={16} strokeWidth={2.2} />}
        />
        <Kpi
          label="Articles analysés"
          value={formatInt(totals.articles)}
          note={`${share(totals.articles, totals.catalogueArticles)} du catalogue`}
          color="var(--series-4)"
          icon={<BarChart3 size={16} strokeWidth={2.2} />}
        />
      </div>

      {totals.byStatus.rupture > 0 ? (
        <p
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
          style={{
            color: "var(--critical)",
            background: "color-mix(in srgb, var(--critical) 10%, transparent)",
          }}
        >
          <AlertTriangle size={13} strokeWidth={2.4} aria-hidden />
          {formatInt(totals.byStatus.rupture)} article
          {totals.byStatus.rupture > 1 ? "s" : ""} au niveau du stock de
          sécurité ou en dessous.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <ArticlesTable
          rows={rows}
          search={search}
          onSearch={setSearch}
          selectedId={selectedId}
          onSelect={(row: AnalyticsRow) => setSelectedId(row.product_id)}
          onExportCsv={exportCsv}
          printHref={printHref}
        />

        {selected ? (
          <ArticlePanel
            key={selected.product_id}
            row={selected}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <aside className="card p-4">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Fiche article
            </h2>
            <p className="mt-6 text-center text-[11px] leading-relaxed text-[var(--text-muted)]">
              Sélectionnez un article dans le tableau
              <br />
              pour afficher sa fiche complète.
            </p>
          </aside>
        )}
      </div>

      <AnalyticsCharts totals={totals} exits={data.exits} />
    </div>
  );
}

function share(part: number, whole: number) {
  if (whole <= 0) return "—";
  return `${((part / whole) * 100).toFixed(1).replace(".", ",")} %`;
}

function Filter({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Kpi({
  label,
  value,
  note,
  color,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="card flex items-center gap-3 p-3.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
          {label}
        </div>
        <div className="truncate text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
          {value}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">{note}</div>
      </div>
    </article>
  );
}
