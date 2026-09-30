import { CheckCircle2, CircleSlash, ShieldCheck, TriangleAlert } from "lucide-react";
import { lotConformity } from "@/lib/lot-conformity";
import { formatDate } from "@/lib/utils";
import type { Lot } from "@/lib/types";

/* Seuils de couleur de la péremption. Ils sont calés sur le KPI
   « Péremption < 30 jours » : une ligne orange dans le tableau et la carte
   qui la compte doivent désigner exactement le même ensemble de lots. */
export const EXPIRY_TONES = { expired: 0, soon: 30 } as const;

export function expiryTone(days: number): string {
  if (days < EXPIRY_TONES.expired) return "var(--critical)";
  if (days < EXPIRY_TONES.soon) return "var(--serious)";
  return "var(--good)";
}

/** Statut FEFO d'un lot. */
export function FefoBadge({ lot, detailed = false }: { lot: Lot; detailed?: boolean }) {
  return <FefoStatus rank={lot.fefo_rank} detailed={detailed} />;
}

/** Statut FEFO à partir du seul rang : icône + libellé, jamais la couleur seule. */
export function FefoStatus({
  rank,
  detailed = false,
}: {
  rank: number | null;
  detailed?: boolean;
}) {
  const active = rank === 1;
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
  return (
    <span className="tnum font-medium" style={{ color: expiryTone(days) }}>
      {days} j
    </span>
  );
}

/** Date de péremption, teintée selon la même échelle que les jours restants. */
export function ExpiryDate({ lot }: { lot: Lot }) {
  return (
    <span
      className="tnum font-medium"
      style={{ color: expiryTone(lot.days_left) }}
      title={
        lot.is_expired
          ? `Périmé depuis ${Math.abs(lot.days_left)} jours`
          : `Périme dans ${lot.days_left} jours`
      }
    >
      {formatDate(lot.expiry_date)}
    </span>
  );
}

/**
 * Conformité du lot (§5.2). Le critère est dérivé, pas saisi : voir
 * `lotConformity`. Le motif est affiché en clair plutôt que laissé à
 * l'interprétation d'un badge rouge.
 */
export function ConformityBadge({ lot }: { lot: Lot }) {
  const { conforme, reasons } = lotConformity(lot);
  const color = conforme ? "var(--good)" : "var(--serious)";
  const Icon = conforme ? ShieldCheck : TriangleAlert;

  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
      title={conforme ? "Lot consommable et tracé" : reasons.join(" · ")}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden />
      {conforme ? "Conforme" : "Non conforme"}
    </span>
  );
}
