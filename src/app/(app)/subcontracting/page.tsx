import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { SubcontractorInvoiceWorkspace } from "@/components/subcontracting/SubcontractorInvoiceWorkspace";
import { getSubcontractorInvoiceData } from "@/lib/subcontracting";

export const dynamic = "force-dynamic";

export default async function SubcontractingPage({
  searchParams,
}: {
  /* ?facture=<id> ouvre une facture existante ; ?n=… force un écran vierge
     après une suppression ; ?info=… porte le message de l'action qui a
     changé d'URL. */
  searchParams: Promise<{ facture?: string; n?: string; info?: string }>;
}) {
  const { facture, n, info } = await searchParams;
  const invoiceId = facture ? Number(facture) : null;
  if (invoiceId !== null && !Number.isInteger(invoiceId)) notFound();

  const data = await getSubcontractorInvoiceData(invoiceId);
  if (invoiceId !== null && !data.invoice) notFound();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title={data.invoice ? `Facture ${data.invoice.number}` : "Facture sous-traitant"}
        subtitle="Gestion des prestations de sous-traitance de laboratoire"
      />
      <SubcontractorInvoiceWorkspace
        key={`${invoiceId ?? "new"}-${n ?? ""}`}
        data={data}
        notice={info ?? null}
      />
    </main>
  );
}
