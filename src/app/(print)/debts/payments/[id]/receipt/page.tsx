import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getPaymentReceipt } from "@/lib/debts";
import { formatDate, formatDateTime, formatTnd } from "@/lib/utils";
import type { PaymentMethod } from "@/lib/types";

export const dynamic = "force-dynamic";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "Virement",
  check: "Chèque",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const receipt = Number.isInteger(Number(id))
    ? await getPaymentReceipt(Number(id))
    : null;
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  return {
    title: receipt
      ? `Reçu ${receipt.payment.reference ?? receipt.payment.invoice_number}`
      : "Reçu de paiement",
  };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#eeeeee] py-1.5">
      <dt className="text-[10px] text-[#6b6b6b]">{label}</dt>
      <dd className="tnum text-right text-[11px] font-medium text-black">{value}</dd>
    </div>
  );
}

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [receipt, user] = await Promise.all([
    getPaymentReceipt(numericId),
    getCurrentUser(),
  ]);
  if (!receipt) notFound();

  const { payment, debt } = receipt;
  const reversed = payment.reversed_at !== null;

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/debts/payments" backLabel="Retour aux règlements" />

      <article className="relative mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">Reçu de paiement</h1>
            <p className="tnum mt-0.5 text-[13px] font-semibold">
              {payment.reference ?? `Règlement n° ${payment.payment_id}`}
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

        {reversed ? (
          <p className="mt-4 border-2 border-black px-3 py-2 text-center text-[12px] font-bold uppercase tracking-wider">
            Règlement annulé le {formatDateTime(payment.reversed_at!)}
            {payment.reversed_by ? ` par ${payment.reversed_by}` : ""}
            {payment.reversal_reason ? ` — ${payment.reversal_reason}` : ""}
          </p>
        ) : null}

        <section className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Règlement
            </h2>
            <dl>
              <Field label="Date de règlement" value={formatDate(payment.paid_at)} />
              <Field label="Mode de paiement" value={METHOD_LABEL[payment.method]} />
              <Field label="Référence" value={payment.reference ?? "—"} />
              <Field label="Saisi par" value={payment.created_by ?? "—"} />
            </dl>
          </div>
          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Facture réglée
            </h2>
            <dl>
              <Field label="N° Facture" value={debt.number} />
              {debt.external_number ? (
                <Field label="Réf. fournisseur" value={debt.external_number} />
              ) : null}
              <Field
                label={debt.source === "subcontractor" ? "Sous-traitant" : "Fournisseur"}
                value={debt.creditor}
              />
              <Field label="Date facture" value={formatDate(debt.issue_date)} />
            </dl>
          </div>
        </section>

        <section className="mt-6 border-2 border-black p-4">
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[12px] font-bold uppercase tracking-wider">
              Montant réglé
            </span>
            <span
              className={`tnum text-[22px] font-bold ${reversed ? "line-through" : ""}`}
            >
              {formatTnd(payment.amount)} TND
            </span>
          </div>
        </section>

        <section className="mt-5 ml-auto w-full max-w-[340px]">
          <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
            Situation de la facture à ce jour
          </h2>
          <dl>
            <Field label="Montant de la facture (TTC)" value={`${formatTnd(debt.amount_due)} TND`} />
            <Field label="Total réglé" value={`${formatTnd(debt.amount_paid)} TND`} />
            <Field label="Solde restant dû" value={`${formatTnd(debt.balance)} TND`} />
          </dl>
        </section>

        {payment.note ? (
          <p className="mt-5 text-[10px] text-[#3d3d3d]">
            <span className="font-semibold">Note : </span>
            {payment.note}
          </p>
        ) : null}

        <div className="mt-12 grid grid-cols-2 gap-8 text-[10px] text-[#6b6b6b]">
          <div className="border-t border-black pt-1.5">Visa du laboratoire</div>
          <div className="border-t border-black pt-1.5">Visa du bénéficiaire</div>
        </div>

        <footer className="mt-8 border-t border-[#e0e0e0] pt-3 text-[9px] leading-relaxed text-[#6b6b6b]">
          <p>
            Document généré par Labstock le {formatDate(new Date().toISOString())}.
            La situation de la facture reflète l&apos;ensemble des règlements
            valides à la date d&apos;impression.
          </p>
        </footer>
      </article>
    </main>
  );
}
