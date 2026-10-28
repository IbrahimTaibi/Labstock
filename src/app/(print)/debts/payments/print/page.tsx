import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getDebtsWorkspace } from "@/lib/debts";
import { formatDate, formatDateTime, formatInt, formatTnd } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Historique des règlements" };

const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "Virement",
  check: "Chèque",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
};

export default async function PaymentHistoryPrintPage() {
  const [{ payments }, user] = await Promise.all([
    getDebtsWorkspace(),
    getCurrentUser(),
  ]);

  /* Les règlements annulés restent sur la feuille, barrés : c'est le
     principe de la contre-passation. Le total ne compte que les valides. */
  const valid = payments.filter((p) => p.reversed_at === null);
  const total = valid.reduce((sum, p) => sum + p.amount, 0);

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/debts/payments" backLabel="Retour aux règlements" />

      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">
              Historique des règlements
            </h1>
            <p className="mt-0.5 text-[11px] text-[#3d3d3d]">
              Dettes fournisseurs et sous-traitants — état au{" "}
              {formatDate(new Date().toISOString())}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">
              Laboratoire
            </p>
            <p className="text-[12px] font-semibold">
              {user?.labName ?? "Laboratoire"}
            </p>
          </div>
        </header>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              {["Date", "N° Facture", "Fournisseur", "Mode", "Référence", "Montant (TND)"].map(
                (label, index) => (
                  <th
                    key={label}
                    className={`py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b] ${
                      index === 5 ? "text-right" : "pr-3 text-left"
                    }`}
                  >
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {payments.map((p) => {
              const reversed = p.reversed_at !== null;
              return (
                <tr
                  key={p.payment_id}
                  className="border-b border-[#e0e0e0] break-inside-avoid text-[10px]"
                >
                  <td className="tnum py-1.5 pr-3">{formatDate(p.paid_at)}</td>
                  <td className="tnum py-1.5 pr-3">{p.invoice_number}</td>
                  <td className="py-1.5 pr-3">{p.creditor}</td>
                  <td className="py-1.5 pr-3">
                    {METHOD_LABEL[p.method]}
                    {reversed ? (
                      <span className="ml-1 font-semibold">
                        (annulé le {formatDateTime(p.reversed_at!)})
                      </span>
                    ) : null}
                  </td>
                  <td className="tnum py-1.5 pr-3">{p.reference ?? "—"}</td>
                  <td
                    className={`tnum py-1.5 text-right font-medium ${reversed ? "line-through" : ""}`}
                  >
                    {formatTnd(p.amount)}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={5} className="py-2 text-right text-[11px] font-bold">
                Total réglé ({formatInt(valid.length)} règlement
                {valid.length > 1 ? "s" : ""} valide{valid.length > 1 ? "s" : ""})
              </td>
              <td className="tnum py-2 text-right text-[13px] font-bold">
                {formatTnd(total)} TND
              </td>
            </tr>
          </tfoot>
        </table>

        {payments.length === 0 ? (
          <p className="mt-3 text-[10px] italic text-[#6b6b6b]">
            Aucun règlement enregistré.
          </p>
        ) : null}

        <footer className="mt-8 border-t border-[#e0e0e0] pt-3 text-[9px] leading-relaxed text-[#6b6b6b]">
          <p>
            Document généré par Labstock le {formatDate(new Date().toISOString())}.
            Les règlements annulés sont conservés et barrés, conformément aux
            exigences de traçabilité ISO 15189:2022.
          </p>
        </footer>
      </article>
    </main>
  );
}
