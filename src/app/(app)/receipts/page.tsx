import { FileText } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  LiveClock,
  SyncStatus,
} from "@/components/receipts/ReceiptHeaderInfo";
import { ReceiptsWorkspace } from "@/components/receipts/ReceiptsWorkspace";
import { getReceiptsWorkspace } from "@/lib/receipts";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const data = await getReceiptsWorkspace(order);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Gestion des réceptions de marchandises"
        subtitle="Réception des commandes fournisseurs"
        actions={
          <>
            <div className="card flex items-center gap-2 px-3 py-2 text-[11px]">
              <FileText size={14} className="text-[var(--text-muted)]" aria-hidden />
              <div className="leading-tight">
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  Commande
                </div>
                <div className="tnum font-medium text-[var(--text-primary)]">
                  {data.selectedOrder
                    ? `${data.selectedOrder.number} · ${formatDate(data.selectedOrder.ordered_at)}`
                    : "—"}
                </div>
              </div>
            </div>
            <LiveClock />
            <SyncStatus lastReceiptAt={data.totals.lastReceiptAt} />
          </>
        }
      />

      {data.selectedOrder ? (
        /* Changer de bon de commande repart d'une session de saisie vierge :
           la dernière réception validée ne concerne plus l'écran affiché. */
        <ReceiptsWorkspace key={data.selectedOrder.id} data={data} />
      ) : (
        <p className="card p-6 text-center text-[12px] text-[var(--text-muted)]">
          Aucun bon de commande enregistré.
        </p>
      )}
    </main>
  );
}
