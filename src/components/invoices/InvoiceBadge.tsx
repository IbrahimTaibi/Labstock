import { CheckCircle2, CircleAlert, Clock } from "lucide-react";
import type { InvoiceStatus } from "@/lib/types";

const CONFIG: Record<
  InvoiceStatus,
  { label: string; color: string; Icon: typeof Clock }
> = {
  paid: { label: "Payée", color: "var(--good)", Icon: CheckCircle2 },
  pending: { label: "En attente", color: "var(--text-muted)", Icon: Clock },
  overdue: { label: "En retard", color: "var(--critical)", Icon: CircleAlert },
};

/** Statut de facture : icône + libellé, jamais la couleur seule. */
export function InvoiceBadge({ status }: { status: InvoiceStatus }) {
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
