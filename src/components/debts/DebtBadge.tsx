import {
  CalendarOff,
  CheckCircle2,
  CircleAlert,
  Clock,
  TriangleAlert,
} from "lucide-react";
import type { DebtStatus } from "@/lib/types";

/* Libellés repris de la légende du cahier des charges (§7.1). Les bornes
   elles-mêmes vivent dans public.debt_ageing_bucket() : cette table ne fait
   que les nommer. */
export const DEBT_STATUS_CONFIG: Record<
  DebtStatus,
  { label: string; short: string; color: string; Icon: typeof Clock }
> = {
  paid: {
    label: "Payée",
    short: "Payées",
    color: "var(--good)",
    Icon: CheckCircle2,
  },
  /* Escalade voulue : vert -> ambre -> orange -> rose -> rouge, dans la
     palette existante. La légende du cahier des charges demande cinq teintes
     distinctes, pas cinq teintes précises. */
  not_due: {
    label: "Non échue",
    short: "Non échues",
    color: "var(--series-3)",
    Icon: Clock,
  },
  late_1_30: {
    label: "Échue [1;30]",
    short: "Échues [1-30]",
    color: "var(--warning)",
    Icon: TriangleAlert,
  },
  late_31_60: {
    label: "Échue [31;60]",
    short: "Échues [31-60]",
    color: "var(--series-2)",
    Icon: TriangleAlert,
  },
  late_61_90: {
    label: "Échue [61;90]",
    short: "Échues [61-90]",
    color: "var(--series-5)",
    Icon: CircleAlert,
  },
  late_90_plus: {
    label: "Échue > 90 j",
    short: "Échues > 90 j",
    color: "var(--critical)",
    Icon: CircleAlert,
  },
  no_due_date: {
    label: "Sans échéance",
    short: "Sans échéance",
    color: "var(--text-muted)",
    Icon: CalendarOff,
  },
};

/** Statut de dette : icône + libellé, jamais la couleur seule. */
export function DebtBadge({ status }: { status: DebtStatus }) {
  const { label, color, Icon } = DEBT_STATUS_CONFIG[status];
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
