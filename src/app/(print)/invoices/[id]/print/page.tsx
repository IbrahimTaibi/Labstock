import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getInvoiceDocument } from "@/lib/invoices";
import { formatAmount, formatDate, formatInt } from "@/lib/utils";
import type { InvoiceStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  paid: "Payée",
  pending: "En attente de règlement",
  overdue: "En retard",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const invoice = await getInvoiceDocument(Number(id));
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  return { title: invoice ? `Facture ${invoice.number}` : "Facture" };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 py-0.5">
      <dt className="text-[10px] text-[#6b6b6b]">{label}</dt>
      <dd className="tnum text-[11px] font-medium text-black">{value}</dd>
    </div>
  );
}

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [invoice, user] = await Promise.all([
    getInvoiceDocument(numericId),
    getCurrentUser(),
  ]);
  if (!invoice) notFound();

  const { supplier } = invoice;
  const contactLines = [
    supplier.contact_name,
    supplier.address,
    supplier.phone,
    supplier.email,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/invoices" />

      {/* La feuille force le noir sur blanc : elle ne suit pas le thème de
          l'application, une impression sombre serait illisible et vorace. */}
      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">Facture</h1>
            <p className="tnum mt-0.5 text-[13px] font-semibold">
              {invoice.number}
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

        <section className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Fournisseur
            </h2>
            <p className="text-[12px] font-semibold">{supplier.name}</p>
            {contactLines.map((line) => (
              <p key={line} className="text-[10px] leading-snug text-[#3d3d3d]">
                {line}
              </p>
            ))}
          </div>

          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Détail
            </h2>
            <dl>
              <Field label="Date d'émission" value={formatDate(invoice.issue_date)} />
              <Field label="Échéance" value={formatDate(invoice.due_date)} />
              <Field label="Statut" value={STATUS_LABEL[invoice.status]} />
              {invoice.payment_date ? (
                <Field
                  label="Réglée le"
                  value={formatDate(invoice.payment_date)}
                />
              ) : null}
            </dl>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1.5 text-left text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
                Désignation
              </th>
              <th className="py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
                Qté
              </th>
              <th className="py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
                Prix unitaire
              </th>
              <th className="py-1.5 text-right text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
                Montant
              </th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line) => (
              <tr
                key={line.id}
                className="border-b border-[#e0e0e0] break-inside-avoid"
              >
                <td className="py-1.5 pr-3 text-[11px]">{line.description}</td>
                <td className="tnum py-1.5 text-right text-[11px]">
                  {formatInt(line.quantity)}
                </td>
                <td className="tnum py-1.5 text-right text-[11px]">
                  {formatAmount(line.unit_price)}
                </td>
                <td className="tnum py-1.5 text-right text-[11px] font-medium">
                  {formatAmount(line.quantity * line.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={3} className="py-2 text-right text-[12px] font-bold">
                Total
              </td>
              <td className="tnum py-2 text-right text-[14px] font-bold">
                {formatAmount(invoice.amount)} DT
              </td>
            </tr>
          </tfoot>
        </table>

        {invoice.lines.length === 0 ? (
          <p className="mt-3 text-[10px] italic text-[#6b6b6b]">
            Aucun détail de ligne enregistré pour cette facture.
          </p>
        ) : null}

        <footer className="mt-8 border-t border-[#e0e0e0] pt-3 text-[9px] leading-relaxed text-[#6b6b6b]">
          <p>
            Document généré par LABSTOCK le {formatDate(new Date().toISOString())}.
            Montants exprimés en dinars tunisiens, tels qu&apos;enregistrés dans
            le suivi des factures fournisseurs.
          </p>
        </footer>
      </article>
    </main>
  );
}
