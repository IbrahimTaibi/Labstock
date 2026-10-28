"use client";

import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn, formatInt } from "@/lib/utils";

const PAGE_SIZES = [10, 25, 50, 100];

/** Numéros de page avec ellipses : 1 2 3 4 5 … 13. */
function pageNumbers(page: number, count: number): (number | "…")[] {
  if (count <= 7) return Array.from({ length: count }, (_, i) => i);
  const set = new Set([0, count - 1, page - 1, page, page + 1]);
  if (page < 4) [1, 2, 3, 4].forEach((i) => set.add(i));
  if (page > count - 5) [count - 5, count - 4, count - 3, count - 2].forEach((i) => set.add(i));
  const sorted = [...set].filter((i) => i >= 0 && i < count).sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] > 1) result.push("…");
    result.push(n);
  });
  return result;
}

export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
  onPageSize: (size: number) => void;
}) {
  const navClass =
    "grid h-8 min-w-8 place-items-center rounded-md px-1.5 text-[11px] text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)] disabled:opacity-40";
  const first = total === 0 ? 0 : page * pageSize + 1;
  const last = Math.min((page + 1) * pageSize, total);

  return (
    <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-0.5">
        <button type="button" className={navClass} disabled={page === 0} onClick={() => onPage(0)} aria-label="Première page">
          <ChevronsLeft size={14} aria-hidden />
        </button>
        <button type="button" className={navClass} disabled={page === 0} onClick={() => onPage(page - 1)} aria-label="Page précédente">
          <ChevronLeft size={14} aria-hidden />
        </button>
        {pageNumbers(page, pageCount).map((n, i) =>
          n === "…" ? (
            <span key={`gap${i}`} className="px-1.5 text-[11px] text-[var(--text-muted)]">…</span>
          ) : (
            <button
              key={n}
              type="button"
              onClick={() => onPage(n)}
              aria-current={n === page ? "page" : undefined}
              className={cn(navClass, "tnum", n === page && "font-semibold !text-white")}
              style={n === page ? { background: "var(--series-1)" } : undefined}
            >
              {n + 1}
            </button>
          )
        )}
        <button type="button" className={navClass} disabled={page >= pageCount - 1} onClick={() => onPage(page + 1)} aria-label="Page suivante">
          <ChevronRight size={14} aria-hidden />
        </button>
        <button type="button" className={navClass} disabled={page >= pageCount - 1} onClick={() => onPage(pageCount - 1)} aria-label="Dernière page">
          <ChevronsRight size={14} aria-hidden />
        </button>
      </div>

      <span className="tnum text-[11px] text-[var(--text-secondary)]">
        {formatInt(first)} - {formatInt(last)} sur {formatInt(total)}
      </span>

      <label className="flex items-center gap-2 text-[11px] text-[var(--text-secondary)]">
        Afficher
        <select
          value={pageSize}
          onChange={(e) => onPageSize(Number(e.target.value))}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] outline-none focus:border-[var(--series-1)]"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
        lignes
      </label>
    </div>
  );
}
