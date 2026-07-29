import { CheckCircle2, CircleSlash } from "lucide-react";
import type { Lot } from "@/lib/types";

/** Statut FEFO : icône + libellé, jamais la couleur seule. */
export function FefoBadge({ lot, detailed = false }: { lot: Lot; detailed?: boolean }) {
  const active = lot.fefo_rank === 1;
  const color = active ? "var(--good)" : "var(--critical)";
  const Icon = active ? CheckCircle2 : CircleSlash;
  const label = active
    ? detailed
      ? "Actif (Prioritaire)"
      : "Actif"
    : "Inactif";

  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden />
      {label}
    </span>
  );
}

/** Rang FEFO : 1 = à consommer en premier. */
export function FefoRank({ rank }: { rank: number | null }) {
  const known = rank !== null;
  return (
    <span
      className="tnum grid h-[22px] w-[22px] place-items-center rounded-full text-[10px] font-bold ring-1"
      style={
        rank === 1
          ? { background: "var(--good)", color: "#fff", boxShadow: "none" }
          : {
              color: "var(--text-muted)",
              boxShadow: "inset 0 0 0 1px var(--border)",
            }
      }
      title={
        rank === 1
          ? "Lot prioritaire : à consommer en premier"
          : known
            ? `Rang FEFO ${rank}`
            : "Hors rotation (périmé ou épuisé)"
      }
    >
      {known ? rank : "–"}
    </span>
  );
}

/** Jours restants avant péremption, teintés par l'urgence. */
export function DaysLeft({ days }: { days: number }) {
  const color =
    days < 0 ? "var(--critical)" : days < 30 ? "var(--serious)" : "var(--good)";

  return (
    <span className="tnum font-medium" style={{ color }}>
      {days} j
    </span>
  );
}
