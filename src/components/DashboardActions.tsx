"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { CalendarDays, Download, RefreshCw } from "lucide-react";
import type { Dashboard } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function toCsv(dashboard: Dashboard) {
  const rows: string[][] = [
    ["Section", "Libellé", "Valeur"],
    ...dashboard.stockByCategory.map((row) => [
      "Stock par catégorie",
      row.category,
      String(row.value),
    ]),
    ...dashboard.invoiceStatus.map((row) => [
      "État des factures",
      row.status,
      String(row.amount),
    ]),
    ...dashboard.criticalProducts.map((row) => [
      "Produit critique",
      row.name,
      `${row.stock}/${row.min_stock}`,
    ]),
    ...dashboard.overdueInvoices.map((row) => [
      "Facture en retard",
      row.number,
      String(row.amount),
    ]),
  ];

  return rows
    .map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(";"))
    .join("\n");
}

export function DashboardActions({ dashboard }: { dashboard: Dashboard }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [exported, setExported] = useState(false);

  function handleExport() {
    const blob = new Blob(["﻿" + toCsv(dashboard)], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `labstock-rapport-${dashboard.period.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    setExported(true);
    setTimeout(() => setExported(false), 2000);
  }

  return (
    <>
      <div className="card flex items-center gap-2 px-3 py-2 text-[11px]">
        <CalendarDays size={14} className="text-[var(--text-muted)]" aria-hidden />
        <div className="leading-tight">
          <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
            Période
          </div>
          <div className="tnum font-medium text-[var(--text-primary)]">
            {formatDate(dashboard.period.start)} – {formatDate(dashboard.period.end)}
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => startTransition(() => router.refresh())}
        className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
      >
        <RefreshCw
          size={14}
          className={isPending ? "animate-spin" : undefined}
          aria-hidden
        />
        {isPending ? "Actualisation…" : "Actualiser"}
      </button>

      <button
        type="button"
        onClick={handleExport}
        className="flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: "var(--series-1)" }}
      >
        <Download size={14} aria-hidden />
        {exported ? "Rapport exporté" : "Exporter le rapport"}
      </button>
    </>
  );
}
