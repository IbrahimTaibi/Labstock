"use client";

import { useSyncExternalStore } from "react";
import { CalendarClock, RefreshCw } from "lucide-react";

/* Horloge branchée sur `useSyncExternalStore` plutôt que sur un effet :
   React sait alors qu'il ne doit pas comparer l'heure du serveur à celle du
   navigateur, et l'hydratation ne produit aucun écart. */
const subscribe = (notify: () => void) => {
  const id = setInterval(notify, 30_000);
  return () => clearInterval(id);
};
const getSnapshot = () => Math.floor(Date.now() / 30_000);
const getServerSnapshot = () => 0;

/** Date et heure courantes du poste de réception (§2). */
export function LiveClock() {
  const tick = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /* `0` = rendu serveur : on n'affiche pas une heure qui serait celle du
     serveur, potentiellement dans un autre fuseau que l'opérateur. */
  const label =
    tick === 0
      ? "—"
      : new Date().toLocaleString("fr-FR", {
          day: "2-digit",
          month: "2-digit",
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        });

  return (
    <div className="card flex items-center gap-2 px-3 py-2 text-[11px]">
      <CalendarClock size={14} className="text-[var(--text-muted)]" aria-hidden />
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
          Poste de réception
        </div>
        <div className="tnum font-medium text-[var(--text-primary)]">{label}</div>
      </div>
    </div>
  );
}

/**
 * État de synchronisation du stock (§2, bloc Système).
 *
 * LABSTOCK n'est branché à aucun ERP tiers : « synchronisé » dit que le
 * stock affiché reflète bien les réceptions enregistrées, l'entrée en stock
 * étant faite dans la même transaction que la réception.
 */
export function SyncStatus({ lastReceiptAt }: { lastReceiptAt: string | null }) {
  return (
    <div className="card flex items-center gap-2 px-3 py-2 text-[11px]">
      <RefreshCw
        size={14}
        strokeWidth={2.2}
        style={{ color: "var(--good)" }}
        aria-hidden
      />
      <div className="leading-tight">
        <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
          Système
        </div>
        <div className="font-medium" style={{ color: "var(--good)" }}>
          Synchronisé
        </div>
      </div>
      <span className="sr-only">
        {lastReceiptAt
          ? `Dernière écriture de stock le ${lastReceiptAt}`
          : "Aucune réception enregistrée sur cette commande"}
      </span>
    </div>
  );
}
