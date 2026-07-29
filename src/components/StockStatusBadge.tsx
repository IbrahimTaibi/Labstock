import { AlertTriangle, CircleAlert, XCircle } from "lucide-react";
import type { StockStatus } from "@/lib/types";

const STATUS_CONFIG: Record<
  StockStatus,
  { label: string; color: string; Icon: typeof AlertTriangle }
> = {
  out_of_stock: { label: "Rupture", color: "var(--critical)", Icon: XCircle },
  near_out: { label: "Rupture proche", color: "var(--serious)", Icon: CircleAlert },
  low: { label: "Faible", color: "var(--warning)", Icon: AlertTriangle },
};

/** Statut = icône + libellé ; la couleur seule ne porte jamais le sens. */
export function StockStatusBadge({ status }: { status: StockStatus }) {
  const { label, color, Icon } = STATUS_CONFIG[status];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap font-medium">
      <Icon size={12} strokeWidth={2.5} style={{ color }} aria-hidden />
      <span className="text-[var(--text-primary)]">{label}</span>
    </span>
  );
}
