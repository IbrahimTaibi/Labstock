import Link from "next/link";
import { ArrowLeft, ScanBarcode } from "lucide-react";

import { Td, Th } from "@/components/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { getReceiptHistory } from "@/lib/receipts";
import { formatAmount, formatDateTime, formatInt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ReceiptHistoryPage() {
  const history = await getReceiptHistory();

  const active = history.filter((entry) => entry.reversed_at === null);
  const units = active.reduce((sum, entry) => sum + entry.quantity, 0);

  return (
    <main className="mx-auto w-full max-w-[1200px] p-4 md:p-5">
      <PageHeader
        title="Historique des réceptions"
        subtitle="Toutes commandes confondues, annulations comprises"
        actions={
          <Link
            href="/receipts"
            className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Retour aux réceptions
          </Link>
        }
      />

      <section className="card mb-3 grid grid-cols-2 gap-x-6 gap-y-2 p-4 sm:grid-cols-4">
        <Summary label="Lignes réceptionnées" value={formatInt(history.length)} />
        <Summary label="Dont annulées" value={formatInt(history.length - active.length)} />
        <Summary label="Unités entrées en stock" value={formatInt(units)} />
        <Summary
          label="Valeur cumulée"
          /* Annulations exclues : une réception contre-passée n'a rien
             apporté au stock, sa valeur ne doit pas gonfler le cumul. */
          value={`${formatAmount(
            active.reduce((sum, entry) => sum + entry.quantity * entry.unit_price, 0)
          )} DT`}
        />
      </section>

      <section className="card p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse text-[11px]">
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Commande</Th>
                <Th>Référence</Th>
                <Th>Désignation</Th>
                <Th>Lot</Th>
                <Th align="right">Qté reçue</Th>
                <Th>Opérateur</Th>
                <Th>État</Th>
                <Th align="center">Étiquette</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr key={entry.id} style={entry.reversed_at ? { opacity: 0.6 } : undefined}>
                  <Td nowrap>
                    {entry.received_at ? formatDateTime(entry.received_at) : "—"}
                  </Td>
                  <Td nowrap>{entry.order_number}</Td>
                  <Td nowrap className="font-medium">
                    {entry.reference}
                  </Td>
                  <Td>
                    <span className="block max-w-[200px] truncate">
                      {entry.product_name}
                    </span>
                  </Td>
                  <Td nowrap>{entry.lot_number ?? "—"}</Td>
                  <Td align="right">
                    <span
                      style={
                        entry.reversed_at
                          ? { textDecoration: "line-through", color: "var(--text-muted)" }
                          : undefined
                      }
                    >
                      +{formatInt(entry.quantity)}
                    </span>
                  </Td>
                  <Td>{entry.operator}</Td>
                  <Td>
                    {entry.reversed_at ? (
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--critical)" }}
                        title={[
                          `Annulée le ${formatDateTime(entry.reversed_at)}`,
                          entry.reversed_by ? `par ${entry.reversed_by}` : null,
                          entry.reversal_reason,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      >
                        Annulée
                      </span>
                    ) : (
                      <span
                        className="text-[10px] font-semibold"
                        style={{ color: "var(--good)" }}
                      >
                        Validée
                      </span>
                    )}
                  </Td>
                  <Td align="center">
                    {entry.lot_id !== null && !entry.reversed_at ? (
                      <a
                        href={`/goods/barcodes/print?ids=${entry.lot_id}`}
                        target="_blank"
                        rel="noopener"
                        title={`Étiquette du lot ${entry.lot_number ?? ""}`}
                        className="inline-grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--series-1)]"
                      >
                        <ScanBarcode size={13} aria-hidden />
                        <span className="sr-only">Imprimer l&apos;étiquette</span>
                      </a>
                    ) : (
                      "—"
                    )}
                  </Td>
                </tr>
              ))}

              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                  >
                    Aucune réception enregistrée.
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
      <div className="mt-0.5 truncate text-[15px] font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
