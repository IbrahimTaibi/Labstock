import { CheckCircle2, Clock, PackageOpen } from "lucide-react";
import type { DeliveryStatus } from "@/lib/types";

const CONFIG: Record<
  DeliveryStatus,
  { label: string; color: string; Icon: typeof CheckCircle2 }
> = {
  received: { label: "Livré", color: "var(--good)", Icon: CheckCircle2 },
  partial: { label: "Partiel", color: "var(--serious)", Icon: PackageOpen },
  pending: { label: "En attente", color: "var(--text-muted)", Icon: Clock },
};

/** Statut de livraison : icône + libellé, jamais la couleur seule. */
export function DeliveryBadge({ status }: { status: DeliveryStatus }) {
  const { label, color, Icon } = CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden />
      {label}
    </span>
  );
}
