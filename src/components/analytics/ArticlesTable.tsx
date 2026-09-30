"use client";

import { useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Eye,
  FileDown,
  Printer,
  Search,
} from "lucide-react";
import { Td, Th } from "@/components/DataTable";
import { STATUS_META } from "@/lib/analytics-summary";
import type { AnalyticsRow } from "@/lib/types";
import { formatAmount, formatInt } from "@/lib/utils";

const PAGE_SIZE = 10;

const decimal = (value: number, digits = 2) =>
  value.toFixed(digits).replace(".", ",");

export function ArticlesTable({
  rows,
  search,
  onSearch,
  selectedId,
  onSelect,
  onExportCsv,
  printHref,
}: {
  rows: AnalyticsRow[];
  search: string;
  onSearch: (value: string) => void;
  selectedId: number | null;
  onSelect: (row: AnalyticsRow) => void;
  onExportCsv: () => void;
  printHref: string;
}) {
  const [page, setPage] = useState(0);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const visible = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Analyse détaillée des articles
        </h2>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-semibold"
          style={{
            color: "var(--series-1)",
            background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
          }}
        >
          {formatInt(rows.length)} article{rows.length > 1 ? "s" : ""}
        </span>

        <div className="relative ml-auto">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            value={search}
            onChange={(event) => {
              onSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Rechercher un article…"
            aria-label="Rechercher un article"
            className="w-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-7 pr-2 text-[11px] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
          />
        </div>

        <button
          type="button"
          onClick={onExportCsv}
          title="Exporter le tableau filtré (CSV, lisible par Excel)"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
        >
          <FileDown size={12} aria-hidden />
          Excel
        </button>
        <a
          href={printHref}
          target="_blank"
          rel="noopener"
          title="Version imprimable du tableau filtré"
          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
        >
          <Printer size={12} aria-hidden />
          PDF
        </a>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[1180px] border-collapse text-[11px]">
          <thead>
            <tr>
              <Th>Réf.</Th>
              <Th>Désignation</Th>
              <Th align="right">Stock init.</Th>
              <Th align="right">Entrées</Th>
              <Th align="right">Sorties</Th>
              <Th align="right">Stock final</Th>
              <Th align="right">Stock moyen</Th>
              <Th align="right">CMJ 30j</Th>
              <Th align="right">CMJ long</Th>
              <Th align="right">Couv. (j)</Th>
              <Th align="right">Rotation</Th>
              <Th>Statut</Th>
              <Th align="right">Qté à cmder</Th>
              <Th align="right">Valeur</Th>
              <Th align="center">Voir</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => {
              const meta = STATUS_META[row.status];
              return (
                <tr
                  key={row.product_id}
                  onClick={() => onSelect(row)}
                  className="cursor-pointer transition-colors hover:bg-[var(--page)]"
                  style={
                    row.product_id === selectedId
                      ? {
                          background:
                            "color-mix(in srgb, var(--series-1) 8%, transparent)",
                        }
                      : undefined
                  }
                >
                  <Td nowrap>
                    <span className="font-medium" style={{ color: "var(--series-1)" }}>
                      {row.reference}
                    </span>
                  </Td>
                  <Td>
                    <span className="block max-w-[190px] truncate font-medium">
                      {row.product_name}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {row.category}
                    </span>
                  </Td>
                  <Td align="right">{formatInt(row.stock_initial)}</Td>
                  <Td align="right">
                    <span style={{ color: "var(--good)" }}>
                      {row.entries > 0 ? `+${formatInt(row.entries)}` : "—"}
                    </span>
                  </Td>
                  <Td align="right">
                    <span style={{ color: "var(--serious)" }}>
                      {row.exits > 0 ? `−${formatInt(row.exits)}` : "—"}
                    </span>
                  </Td>
                  <Td align="right" className="font-semibold">
                    {formatInt(row.stock_final)}
                  </Td>
                  <Td align="right">{decimal(row.stock_average, 1)}</Td>
                  <Td align="right">{decimal(row.cmj_short, 2)}</Td>
                  <Td align="right">{decimal(row.cmj_long, 2)}</Td>
                  <Td align="right">
                    {row.coverage_days === null ? (
                      <span className="text-[var(--text-muted)]" title="Aucune sortie sur la période">
                        —
                      </span>
                    ) : (
                      decimal(row.coverage_days, 0)
                    )}
                  </Td>
                  <Td align="right">
                    {row.rotation === null ? "—" : decimal(row.rotation, 2)}
                  </Td>
                  <Td>
                    <span
                      className="whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-bold"
                      style={{
                        color: meta.color,
                        background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
                      }}
                    >
                      {meta.label}
                    </span>
                  </Td>
                  <Td align="right" className="font-semibold">
                    {row.order_quantity > 0 ? formatInt(row.order_quantity) : "—"}
                  </Td>
                  <Td align="right">
                    {row.order_value > 0 ? formatAmount(row.order_value) : "—"}
                  </Td>
                  <Td align="center">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onSelect(row);
                      }}
                      title="Voir la fiche article"
                      className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--series-1)]"
                    >
                      <Eye size={13} aria-hidden />
                      <span className="sr-only">Fiche de {row.product_name}</span>
                    </button>
                  </Td>
                </tr>
              );
            })}

            {visible.length === 0 ? (
              <tr>
                <td
                  colSpan={15}
                  className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                >
                  Aucun article ne correspond à ces critères.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span>
          {rows.length === 0
            ? "Aucun article"
            : `Affichage de ${current * PAGE_SIZE + 1} à ${Math.min(
                (current + 1) * PAGE_SIZE,
                rows.length
              )} sur ${formatInt(rows.length)} articles`}
        </span>

        <div className="flex items-center gap-1">
          <PageButton onClick={() => setPage(0)} disabled={current === 0} label="Première page">
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
