"use client";

import { useMemo, useState } from "react";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDashed,
  Search,
} from "lucide-react";
import { Td, Th } from "@/components/DataTable";
import type { InventoryLine } from "@/lib/types";
import { formatAmount, formatDate, formatInt } from "@/lib/utils";

type Filter = "all" | "counted" | "remaining" | "variance";

const PAGE_SIZE = 20;

export function CountTable({
  lines,
  drafts,
  onDraftChange,
  onCommit,
  disabled,
}: {
  lines: InventoryLine[];
  /** Saisies en cours, non encore enregistrées. */
  drafts: Record<number, string>;
  onDraftChange: (lineId: number, value: string) => void;
  onCommit: (lineId: number, value: string) => void;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return lines.filter((line) => {
      if (needle) {
        const haystack = `${line.product_name} ${line.reference} ${line.lot_number}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (filter === "counted" && !line.is_counted) return false;
      if (filter === "remaining" && line.is_counted) return false;
      if (filter === "variance" && (line.variance_units ?? 0) === 0) return false;
      return true;
    });
  }, [lines, search, filter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const selectClass =
    "rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Comptage physique
        </h2>

        <div className="relative">
          <Search
            size={13}
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden
          />
          <input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Produit, référence, lot…"
            aria-label="Rechercher une ligne de comptage"
            className="w-[220px] rounded-lg border border-[var(--border)] bg-[var(--surface)] py-1.5 pl-7 pr-2 text-[11px] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
          />
        </div>

        <select
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value as Filter);
            setPage(0);
          }}
          aria-label="Filtrer les lignes"
          className={selectClass}
        >
          <option value="all">Toutes les lignes</option>
          <option value="remaining">Reste à compter</option>
          <option value="counted">Déjà comptées</option>
          <option value="variance">Avec écart</option>
        </select>

        <span className="text-[10px] text-[var(--text-muted)]">
          {formatInt(filtered.length)} lignes
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] border-collapse text-[11px]">
          <thead>
            <tr>
              <Th align="center">État</Th>
              <Th>Produit</Th>
              <Th>Lot</Th>
              <Th>Péremption</Th>
              <Th align="right">Attendu</Th>
              <Th align="right">Compté</Th>
              <Th align="right">Écart</Th>
              <Th align="right">Valeur écart</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((line) => {
              const draft = drafts[line.id];
              const value =
                draft !== undefined
                  ? draft
                  : line.counted_qty === null
                    ? ""
                    : String(line.counted_qty);
              const variance = line.variance_units;

              return (
                <tr key={line.id}>
                  <Td align="center">
                    {line.is_counted ? (
                      <Check
                        size={13}
                        strokeWidth={2.8}
                        style={{ color: "var(--good)" }}
                        aria-label="Comptée"
                      />
                    ) : (
                      <CircleDashed
                        size={13}
                        strokeWidth={2.2}
                        style={{ color: "var(--text-muted)" }}
                        aria-label="Non comptée"
                      />
                    )}
                  </Td>
                  <Td>
                    <span className="block max-w-[200px] truncate font-medium">
                      {line.product_name}
                    </span>
                    <span className="text-[9px] text-[var(--text-muted)]">
                      {line.reference} · {line.category}
                    </span>
                  </Td>
                  <Td nowrap>{line.lot_number}</Td>
                  <Td nowrap>{formatDate(line.expiry_date)}</Td>
                  <Td align="right">{formatInt(line.expected_qty)}</Td>
                  <Td align="right">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={value}
                      disabled={disabled}
                      onChange={(event) => onDraftChange(line.id, event.target.value)}
                      onBlur={(event) => onCommit(line.id, event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          onCommit(line.id, (event.target as HTMLInputElement).value);
                        }
                      }}
                      placeholder="—"
                      aria-label={`Quantité comptée pour ${line.lot_number}`}
                      className="tnum w-[74px] rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-right text-[11px] outline-none focus:border-[var(--series-1)] disabled:bg-[var(--page)]"
                    />
                  </Td>
                  <Td align="right">
                    {variance === null ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      <span
                        className="font-semibold"
                        style={{
                          color:
                            variance === 0
                              ? "var(--good)"
                              : variance < 0
                                ? "var(--critical)"
                                : "var(--serious)",
                        }}
                      >
                        {variance > 0 ? "+" : ""}
                        {formatInt(variance)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    {line.variance_value === null || line.variance_value === 0 ? (
                      <span className="text-[var(--text-muted)]">—</span>
                    ) : (
                      <span
                        style={{
                          color:
                            line.variance_value < 0
                              ? "var(--critical)"
                              : "var(--serious)",
                        }}
                      >
                        {line.variance_value > 0 ? "+" : "−"}
                        {formatAmount(Math.abs(line.variance_value))} DT
                      </span>
                    )}
                  </Td>
                </tr>
              );
            })}

            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={8}
                  className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                >
                  Aucune ligne ne correspond à ces critères.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
        <span>
          Page {current + 1} / {pageCount}
        </span>
        <span className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            aria-label="Page précédente"
            className="grid h-6 w-6 place-items-center rounded border border-[var(--border)] transition-colors hover:bg-[var(--page)] disabled:opacity-40"
          >
            <ChevronLeft size={13} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current >= pageCount - 1}
            aria-label="Page suivante"
            className="grid h-6 w-6 place-items-center rounded border border-[var(--border)] transition-colors hover:bg-[var(--page)] disabled:opacity-40"
          >
            <ChevronRight size={13} aria-hidden />
          </button>
        </span>
      </div>
    </section>
  );
}
