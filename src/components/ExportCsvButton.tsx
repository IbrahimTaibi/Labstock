"use client";

import { useState, useTransition } from "react";
import { FileDown, Loader2, TriangleAlert } from "lucide-react";
import { exportCsv, type ExportKind } from "@/app/(app)/exports/actions";

/**
 * Déclenche la construction du CSV côté serveur puis le télécharge. Le
 * fichier couvre l'ensemble des données de la page, pas seulement la vue
 * filtrée : c'est un export de référentiel, pas une capture d'écran.
 */
export function ExportCsvButton({
  kind,
  label = "Exporter (CSV)",
}: {
  kind: ExportKind;
  label?: string;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function download() {
    setError(null);
    start(async () => {
      const result = await exportCsv(kind);
      if (result.status === "error") {
        setError(result.message);
        return;
      }

      /* BOM en tête : sans lui, Excel lit l'UTF-8 en ANSI et casse les
         accents des libellés. */
      const blob = new Blob(["﻿" + result.content], {
        type: "text/csv;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = result.filename;
      link.click();
      URL.revokeObjectURL(url);
    });
  }

  return (
    <button
      type="button"
      onClick={download}
      disabled={pending}
      title={error ?? "Exporter toutes les données de cette page"}
      className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)] disabled:opacity-60"
    >
      {pending ? (
        <Loader2 size={14} className="animate-spin" aria-hidden />
      ) : error ? (
        <TriangleAlert
          size={14}
          style={{ color: "var(--critical)" }}
          aria-hidden
        />
      ) : (
        <FileDown size={14} aria-hidden />
      )}
      {pending ? "Export…" : error ? "Échec de l'export" : label}
    </button>
  );
}
