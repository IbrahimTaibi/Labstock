import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  ClipboardCheck,
  PackagePlus,
  PackageMinus,
  Pencil,
  Plus,
  ScanBarcode,
} from "lucide-react";

import { Td, Th } from "@/components/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { DaysLeft, FefoBadge, FefoRank } from "@/components/goods/FefoBadge";
import { getLot, getLotHistory } from "@/lib/lots";
import { formatDate, formatDateTime, formatInt } from "@/lib/utils";
import type { LotHistoryKind } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVENT: Record<
  LotHistoryKind,
  { label: string; icon: React.ReactNode; color: string }
> = {
  created: {
    label: "Création du lot",
    icon: <Plus size={13} strokeWidth={2.4} aria-hidden />,
    color: "var(--series-1)",
  },
  updated: {
    label: "Modification de la fiche",
    icon: <Pencil size={13} strokeWidth={2.4} aria-hidden />,
    color: "var(--text-muted)",
  },
  receipt: {
    label: "Réception",
    icon: <PackagePlus size={13} strokeWidth={2.4} aria-hidden />,
    color: "var(--good)",
  },
  issue: {
    label: "Sortie de stock",
    icon: <PackageMinus size={13} strokeWidth={2.4} aria-hidden />,
    color: "var(--serious)",
  },
  count: {
    label: "Comptage d'inventaire",
    icon: <ClipboardCheck size={13} strokeWidth={2.4} aria-hidden />,
    color: "var(--series-2)",
  },
};

export default async function LotHistoryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [lot, events] = await Promise.all([
    getLot(numericId),
    getLotHistory(numericId),
  ]);
  if (!lot) notFound();

  return (
    <main className="mx-auto w-full max-w-[1100px] p-4 md:p-5">
      <PageHeader
        title={`Historique du lot ${lot.lot_number}`}
        subtitle={`${lot.product_name} · ${lot.supplier}`}
        actions={
          <>
            <Link
              href={`/goods/barcodes/print?ids=${lot.id}`}
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
            >
              <ScanBarcode size={14} aria-hidden />
              Étiquette
            </Link>
            <Link
              href="/goods"
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
            >
              <ArrowLeft size={14} aria-hidden />
              Retour
            </Link>
          </>
        }
      />

      <section className="card mb-3 grid grid-cols-2 gap-x-6 gap-y-2 p-4 sm:grid-cols-3 lg:grid-cols-6">
        <Summary label="Désignation" value={lot.product_name} />
        <Summary label="Référence interne" value={lot.internal_ref ?? "—"} />
        <Summary label="Péremption" value={formatDate(lot.expiry_date)} />
        <Summary label="Stock actuel" value={`${formatInt(lot.current_qty)} u.`} />
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">Jours restants</div>
          <div className="mt-0.5">
            <DaysLeft days={lot.days_left} />
          </div>
        </div>
        <div>
          <div className="text-[10px] text-[var(--text-muted)]">Statut FEFO</div>
          <div className="mt-0.5 flex items-center gap-1.5">
            <FefoBadge lot={lot} />
            <FefoRank rank={lot.fefo_rank} />
          </div>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Chronologie ({formatInt(events.length)} événements)
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-[11px]">
            <thead>
              <tr>
                <Th>Événement</Th>
                <Th>Date et heure</Th>
                <Th>Opérateur</Th>
                <Th align="right">Quantité</Th>
                <Th>Référence</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((event, index) => {
                const meta = EVENT[event.kind];
                return (
                  <tr key={`${event.kind}-${index}`}>
                    <Td nowrap>
                      <span className="flex items-center gap-1.5 font-medium">
                        <span style={{ color: meta.color }}>{meta.icon}</span>
                        {meta.label}
                      </span>
                    </Td>
                    <Td nowrap>{formatDateTime(event.occurred_at)}</Td>
                    <Td>{event.actor ?? "—"}</Td>
                    <Td align="right">
                      {event.quantity === null ? (
                        "—"
                      ) : (
                        <span
                          className="font-semibold"
                          style={{
                            color:
                              event.quantity < 0
                                ? "var(--critical)"
                                : event.quantity > 0
                                  ? "var(--good)"
                                  : "var(--text-muted)",
                          }}
                        >
                          {event.quantity > 0 ? "+" : ""}
                          {formatInt(event.quantity)}
                        </span>
                      )}
                    </Td>
                    <Td>{event.reference ?? "—"}</Td>
                  </tr>
                );
              })}

              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                  >
                    Aucun événement enregistré pour ce lot.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 truncate text-[12px] font-medium text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
