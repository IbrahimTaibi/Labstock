import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getPurchaseRequestDocument } from "@/lib/purchase-requests";
import { formatDate, formatDateTime, formatInt, formatTnd } from "@/lib/utils";
import type { RequestPriority, RequestStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "En attente",
  approved: "Validée",
  converted: "Convertie en BC",
  rejected: "Refusée",
};

const PRIORITY_LABEL: Record<RequestPriority, string> = {
  critical: "Critique",
  urgent: "Urgente",
  normal: "Normale",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const doc = Number.isInteger(Number(id))
    ? await getPurchaseRequestDocument(Number(id))
    : null;
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  return { title: doc ? `Demande d'achat ${doc.request.number}` : "Demande d'achat" };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#eeeeee] py-1.5">
      <dt className="text-[10px] text-[#6b6b6b]">{label}</dt>
      <dd className="tnum text-right text-[11px] font-medium text-black">{value}</dd>
    </div>
  );
}

export default async function PurchaseRequestPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [doc, user] = await Promise.all([
    getPurchaseRequestDocument(numericId),
    getCurrentUser(),
  ]);
  if (!doc) notFound();

  const { request, events } = doc;
  const quantity = request.quantity_approved ?? request.quantity_requested;
  const estimate =
    request.estimated_unit_price === null ? null : request.estimated_unit_price * quantity;

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/requests" backLabel="Retour aux demandes" />

      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">Demande d&apos;achat</h1>
            <p className="tnum mt-0.5 text-[13px] font-semibold">{request.number}</p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">
              Laboratoire
            </p>
            <p className="text-[12px] font-semibold">{user?.labName ?? "Laboratoire"}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase">
              {STATUS_LABEL[request.status]}
            </p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-8">
          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Demande
            </h2>
            <dl>
              <Field label="Date de la demande" value={formatDate(request.requested_at)} />
              <Field label="Demandeur" value={request.requester} />
              <Field label="Priorité" value={PRIORITY_LABEL[request.priority]} />
              <Field label="Fournisseur proposé" value={request.supplier ?? "À déterminer"} />
            </dl>
          </div>
          <div>
            <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
              Validation
            </h2>
            <dl>
              <Field
                label="Date de validation"
                value={request.validated_at ? formatDate(request.validated_at) : "—"}
              />
              <Field label="Validé par" value={request.validated_by ?? "—"} />
              <Field label="Bon de commande" value={request.purchase_order_number ?? "—"} />
            </dl>
          </div>
        </section>

        <table className="mt-6 w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              {["Référence", "Désignation", "Qté demandée", "Qté validée", "P.U. estimé"].map(
                (label, index) => (
                  <th
                    key={label}
                    className={`py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b] ${
                      index >= 2 ? "text-right" : "pr-3 text-left"
                    }`}
                  >
                    {label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-[#e0e0e0] text-[11px]">
              <td className="tnum py-2 pr-3">{request.reference ?? "—"}</td>
              <td className="py-2 pr-3">{request.designation}</td>
              <td className="tnum py-2 text-right">{formatInt(request.quantity_requested)}</td>
              <td className="tnum py-2 text-right">
                {request.quantity_approved === null ? "—" : formatInt(request.quantity_approved)}
              </td>
              <td className="tnum py-2 text-right">
                {request.estimated_unit_price === null
                  ? "—"
                  : `${formatTnd(request.estimated_unit_price)} TND`}
              </td>
            </tr>
          </tbody>
          {estimate !== null ? (
            <tfoot>
              <tr className="border-t-2 border-black">
                <td colSpan={4} className="py-2 text-right text-[11px] font-bold">
                  Montant estimé
                </td>
                <td className="tnum py-2 text-right text-[13px] font-bold">
                  {formatTnd(estimate)} TND
                </td>
              </tr>
            </tfoot>
          ) : null}
        </table>

        {request.comment ? (
          <p className="mt-5 text-[11px] text-[#3d3d3d]">
            <span className="font-semibold">Commentaire : </span>
            {request.comment}
          </p>
        ) : null}
        {request.rejection_reason ? (
          <p className="mt-2 text-[11px] font-semibold">
            Motif du refus : {request.rejection_reason}
          </p>
        ) : null}

        <section className="mt-6">
          <h2 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]">
            Historique de la demande
          </h2>
          <ul>
            {events.map((event) => (
              <li
                key={event.id}
                className="flex justify-between gap-4 border-b border-[#eeeeee] py-1.5 text-[10px]"
              >
                <span>{event.detail ?? event.kind}</span>
                <span className="tnum text-[#6b6b6b]">
                  {formatDateTime(event.occurred_at)}
                  {event.actor ? ` · ${event.actor}` : ""}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-12 grid grid-cols-2 gap-8 text-[10px] text-[#6b6b6b]">
          <div className="border-t border-black pt-1.5">Visa du demandeur</div>
          <div className="border-t border-black pt-1.5">Visa du responsable</div>
        </div>

        <footer className="mt-8 border-t border-[#e0e0e0] pt-3 text-[9px] leading-relaxed text-[#6b6b6b]">
          <p>
            Document généré par Labstock le {formatDate(new Date().toISOString())}.
            Toutes les actions sur la demande sont enregistrées dans son
            historique, conformément aux exigences ISO 15189:2022.
          </p>
        </footer>
      </article>
    </main>
  );
}
