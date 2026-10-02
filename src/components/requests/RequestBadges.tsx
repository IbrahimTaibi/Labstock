import {
  CheckCircle2,
  Clock,
  CircleAlert,
  Flame,
  Minus,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import type { RequestPriority, RequestStatus } from "@/lib/types";

export const REQUEST_STATUS_CONFIG: Record<
  RequestStatus,
  { label: string; color: string; Icon: typeof Clock }
> = {
  pending: {
    label: "En attente",
    color: "var(--warning)",
    Icon: Clock,
  },
  approved: {
    label: "Validée",
    color: "var(--good)",
    Icon: CheckCircle2,
  },
  converted: {
    label: "Convertie en BC",
    color: "var(--series-1)",
    Icon: ShoppingCart,
  },
  rejected: {
    label: "Refusée",
    color: "var(--critical)",
    Icon: XCircle,
  },
};

export const REQUEST_PRIORITY_CONFIG: Record<
  RequestPriority,
  { label: string; color: string; Icon: typeof Clock }
> = {
  critical: {
    label: "Critique",
    color: "var(--critical)",
    Icon: Flame,
  },
  urgent: {
    label: "Urgente",
    color: "var(--series-2)",
    Icon: CircleAlert,
  },
  normal: {
    label: "Normale",
    color: "var(--text-muted)",
    Icon: Minus,
  },
};

/** Statut d'une demande : icône + libellé, jamais la couleur seule. */
export function RequestStatusBadge({ status }: { status: RequestStatus }) {
  const { label, color, Icon } = REQUEST_STATUS_CONFIG[status];
  return <Badge label={label} color={color} Icon={Icon} />;
}

export function RequestPriorityBadge({
  priority,
}: {
  priority: RequestPriority;
}) {
  const { label, color, Icon } = REQUEST_PRIORITY_CONFIG[priority];
  return <Badge label={label} color={color} Icon={Icon} />;
}

function Badge({
  label,
  color,
  Icon,
}: {
  label: string;
  color: string;
  Icon: typeof Clock;
}) {
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
