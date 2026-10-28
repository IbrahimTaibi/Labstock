import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getSuppliersWorkspace } from "@/lib/suppliers";
import { formatDate, formatTnd } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Fiche fournisseur" };

function Row({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-6 border-b border-[#e5e5e5] py-1.5">
      <dt className="text-[10px] text-[#6b6b6b]">{label}</dt>
      <dd className="text-right text-[11px] font-medium text-black">{value || "—"}</dd>
    </div>
  );
}

const ORDER_STATUS: Record<string, string> = {
  pending: "En attente",
  partial: "Partielle",
  received: "Livrée",
};

export default async function SupplierPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [data, user] = await Promise.all([getSuppliersWorkspace(), getCurrentUser()]);
  const supplier = data.suppliers.find((s) => s.id === numericId);
  if (!supplier) notFound();

  const orders = data.orders.filter((o) => o.supplier_id === supplier.id).slice(0, 15);
  const evaluation = data.evaluations.find((e) => e.supplier_id === supplier.id) ?? null;
  const terms =
    supplier.payment_terms_days === null
      ? null
      : supplier.payment_terms_days === 0
        ? "Comptant"
        : `${supplier.payment_terms_days} jours`;

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/suppliers" backLabel="Retour aux fournisseurs" />

      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">Fiche fournisseur</h1>
            <p className="mt-0.5 text-[13px] font-semibold">
              {supplier.code} · {supplier.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">Laboratoire</p>
            <p className="text-[12px] font-semibold">{user?.labName ?? "Laboratoire"}</p>
            <p className="text-[10px] text-[#6b6b6b]">Édité le {formatDate(new Date().toISOString().slice(0, 10))}</p>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-2 gap-x-10">
          <dl>
            <Row label="Statut" value={supplier.active ? "Actif" : "Inactif"} />
            <Row label="Catégorie principale" value={supplier.category} />
            <Row label="Matricule fiscal" value={supplier.tax_id} />
            <Row label="Date de création" value={formatDate(supplier.created_on)} />
            <Row label="Conditions de paiement" value={terms} />
            <Row label="Devise par défaut" value={supplier.currency} />
          </dl>
          <dl>
            <Row label="Adresse" value={supplier.address} />
            <Row label="Code postal" value={supplier.postal_code} />
            <Row label="Téléphone / Fax" value={supplier.phone} />
            <Row label="GSM" value={supplier.mobile} />
            <Row label="Email" value={supplier.email} />
            <Row
              label="Dernière évaluation"
              value={evaluation ? `${evaluation.score.toFixed(1).replace(".", ",")} / 5` : "Non évalué"}
            />
          </dl>
        </section>

        <section className="mt-8">
          <h2 className="mb-2 text-[12px] font-bold uppercase tracking-wider">Commandes récentes</h2>
          {orders.length === 0 ? (
            <p className="text-[11px] text-[#6b6b6b]">Aucune commande.</p>
          ) : (
            <table className="w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b border-black text-left">
                  <th className="py-1.5 font-semibold">Bon de commande</th>
                  <th className="py-1.5 font-semibold">Date</th>
                  <th className="py-1.5 font-semibold">Statut</th>
                  <th className="py-1.5 text-right font-semibold">Montant HT (TND)</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-b border-[#e5e5e5]">
                    <td className="py-1.5">{o.number}</td>
                    <td className="py-1.5">{formatDate(o.ordered_at)}</td>
                    <td className="py-1.5">
                      {o.lifecycle === "cancelled" ? "Annulée" : ORDER_STATUS[o.status] ?? o.status}
                    </td>
                    <td className="tnum py-1.5 text-right">{formatTnd(o.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </article>
    </main>
  );
}
