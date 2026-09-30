"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, Plus, ScanBarcode } from "lucide-react";

/**
 * Le bouton « Nouvelle marchandise » vit dans l'en-tête de page, rendu côté
 * serveur, tandis que le formulaire est piloté par `GoodsWorkspace`. Plutôt
 * que de hisser tout l'état de l'écran jusqu'au serveur pour ce seul bouton,
 * les deux communiquent par un évènement de fenêtre.
 */
export const NEW_LOT_EVENT = "labstock:new-lot";

export function NewLotButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(NEW_LOT_EVENT))}
      className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
      style={{ background: "var(--series-1)" }}
    >
      <Plus size={14} strokeWidth={2.6} aria-hidden />
      Nouvelle marchandise
    </button>
  );
}

const SCOPES = [
  {
    label: "Lots actifs (FEFO)",
    hint: "Un lot prioritaire par produit",
    query: "scope=active",
  },
  {
    label: "Tous les lots valides",
    hint: "Hors lots périmés",
    query: "scope=all",
  },
] as const;

/** Impression d'étiquettes GS1-128, par périmètre et en plusieurs exemplaires. */
export function BarcodeMenu() {
  const [open, setOpen] = useState(false);
  const [copies, setCopies] = useState(1);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={root}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
      >
        <ScanBarcode size={14} aria-hidden />
        Imprimer codes-barres
        <ChevronDown size={12} aria-hidden />
      </button>

      {open ? (
        <div
          role="menu"
          className="card absolute right-0 z-40 mt-1 w-[248px] p-1.5 shadow-lg"
        >
          {SCOPES.map((scope) => (
            <a
              key={scope.query}
              role="menuitem"
              href={`/goods/barcodes/print?${scope.query}&copies=${copies}`}
              target="_blank"
              rel="noopener"
              onClick={() => setOpen(false)}
              className="block rounded-md px-2.5 py-2 transition-colors hover:bg-[var(--page)]"
            >
              <span className="block text-[11px] font-medium text-[var(--text-primary)]">
                {scope.label}
              </span>
              <span className="block text-[9px] text-[var(--text-muted)]">
                {scope.hint}
              </span>
            </a>
          ))}

          <label className="mt-1 flex items-center justify-between gap-2 border-t border-[var(--border)] px-2.5 pt-2 text-[10px] text-[var(--text-muted)]">
            Exemplaires par lot
            <select
              value={copies}
              onChange={(event) => setCopies(Number(event.target.value))}
              className="rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[10px] text-[var(--text-primary)] outline-none"
            >
              {[1, 2, 3, 4, 5, 10].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>

          <p className="px-2.5 pb-1 pt-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
            Pour n&apos;imprimer que certains lots, cochez-les dans la liste
            puis utilisez le bouton qui apparaît au-dessus du tableau.
          </p>
        </div>
      ) : null}
    </div>
  );
}
