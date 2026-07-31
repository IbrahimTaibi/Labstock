import {
  Boxes,
  CheckCircle2,
  Clock,
  ScanBarcode,
  XCircle,
} from "lucide-react";

import { ExportCsvButton } from "@/components/ExportCsvButton";
import { PageHeader } from "@/components/shell/PageHeader";
import { GoodsWorkspace } from "@/components/goods/GoodsWorkspace";
import { computeLotStats, getLots, getProductOptions } from "@/lib/lots";
import { formatInt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function GoodsPage() {
  const [lots, products] = await Promise.all([getLots(), getProductOptions()]);
  const stats = computeLotStats(lots);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Gestion des marchandises"
        subtitle="Ajouter, modifier et suivre les lots de marchandises en stock"
        actions={
          <>
            <button
              type="button"
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
            >
              <ScanBarcode size={14} aria-hidden />
              Imprimer codes-barres
            </button>
            <ExportCsvButton kind="lots" />
          </>
        }
      />

      <GoodsWorkspace lots={lots} products={products} />

      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatTile
          label="Total lots"
          value={stats.total}
          note="Tous articles confondus"
          color="var(--series-1)"
          icon={<Boxes size={16} strokeWidth={2.2} />}
        />
        <StatTile
          label="Lots actifs (FEFO)"
          value={stats.active}
          note="À utiliser en priorité"
          color="var(--good)"
          icon={<CheckCircle2 size={16} strokeWidth={2.2} />}
        />
        <StatTile
          label="Péremption < 30 jours"
          value={stats.expiringSoon}
          note="À utiliser rapidement"
          color="var(--serious)"
          icon={<Clock size={16} strokeWidth={2.2} />}
        />
        <StatTile
          label="Lots expirés"
          value={stats.expired}
          note="À retirer du stock"
          color="var(--critical)"
          icon={<XCircle size={16} strokeWidth={2.2} />}
        />
        <StatTile
          label="Lots inactifs (FEFO)"
          value={stats.inactive}
          note="Non prioritaires"
          color="var(--text-muted)"
          icon={<Boxes size={16} strokeWidth={2.2} />}
        />
      </div>
    </main>
  );
}

function StatTile({
  label,
  value,
  note,
  color,
  icon,
}: {
  label: string;
  value: number;
  note: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="card flex items-center gap-3 p-3.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
          {label}
        </div>
        <div className="text-[22px] font-semibold leading-tight text-[var(--text-primary)]">
          {formatInt(value)}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">{note}</div>
      </div>
    </article>
  );
}
