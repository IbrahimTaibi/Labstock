import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getOrderDocument } from "@/lib/receipts";
import { formatAmount, formatDate, formatInt } from "@/lib/utils";
import type { DeliveryStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<DeliveryStatus, string> = {
  pending: "En attente de livraison",
  partial: "Livrée partiellement",
  received: "Livrée",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const order = await getOrderDocument(Number(id));
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  return { title: order ? `Bon de commande ${order.number}` : "Bon de commande" };
}

export default async function OrderPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [order, user] = await Promise.all([
    getOrderDocument(numericId),
    getCurrentUser(),
  ]);
  if (!order) notFound();

  const { supplier } = order;
  const contactLines = [
    supplier.contact_name,
    supplier.address,
    supplier.phone,
    supplier.email,
  ].filter(Boolean) as string[];

  const total = order.lines.reduce(
    (sum, line) => sum + line.quantity_ordered * line.unit_price,
    0
  );

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/receipts" backLabel="Retour aux réceptions" />

      {/* La feuille force le noir sur blanc : elle ne suit pas le thème de
          l'application, une impression sombre serait illisible et vorace. */}
      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">Bon de commande</h1>
            <p className="tnum mt-0.5 text-[13px] font-semibold">{order.number}</p>
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
              <p key={line} className="text-[10px] text-[#4a4a4a]">
                {line}
              </p>
            ))}
          </div>
          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Commande
            </h2>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-[10px] text-[#6b6b6b]">Date</span>
              <span className="tnum text-[11px] font-medium">
                {formatDate(order.ordered_at)}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-[10px] text-[#6b6b6b]">État</span>
              <span className="text-[11px] font-medium">
                {STATUS_LABEL[order.status]}
              </span>
            </div>
            <div className="flex justify-between gap-4 py-0.5">
              <span className="text-[10px] text-[#6b6b6b]">Lignes</span>
              <span className="tnum text-[11px] font-medium">
                {formatInt(order.lines.length)}
              </span>
            </div>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1.5 text-left font-bold">Référence</th>
              <th className="py-1.5 text-left font-bold">Désignation</th>
              <th className="py-1.5 text-left font-bold">Conditionnement</th>
              <th className="py-1.5 text-right font-bold">Commandé</th>
              <th className="py-1.5 text-right font-bold">Reçu</th>
              <th className="py-1.5 text-right font-bold">P.U. (DT)</th>
              <th className="py-1.5 text-right font-bold">Total (DT)</th>
            </tr>
          </thead>
          <tbody>
            {order.lines.map((line) => (
              <tr key={line.id} className="border-b border-[#d8d8d8]">
                <td className="py-1.5">{line.reference}</td>
                <td className="py-1.5">{line.product_name}</td>
                <td className="py-1.5 text-[#4a4a4a]">{line.packaging ?? "—"}</td>
                <td className="tnum py-1.5 text-right">
                  {formatInt(line.quantity_ordered)}
                </td>
                <td className="tnum py-1.5 text-right">
                  {formatInt(line.quantity_received)}
                </td>
                <td className="tnum py-1.5 text-right">
                  {line.unit_price.toFixed(3).replace(".", ",")}
                </td>
                <td className="tnum py-1.5 text-right font-medium">
                  {formatAmount(line.quantity_ordered * line.unit_price)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-black">
              <td colSpan={6} className="py-2 text-right text-[11px] font-bold">
                Total commandé HT
              </td>
              <td className="tnum py-2 text-right text-[13px] font-bold">
                {formatAmount(total)} DT
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-6 text-[9px] leading-relaxed text-[#6b6b6b]">
          Document reconstitué depuis la commande enregistrée dans LABSTOCK.
          Les quantités « Reçu » reflètent les réceptions validées à la date
          d&apos;impression.
        </p>
      </article>
    </main>
  );
}
