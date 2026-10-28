import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { InvoiceEntryWorkspace } from "@/components/invoices/InvoiceEntryWorkspace";
import { getInvoiceEntryData } from "@/lib/invoices";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  /* ?brouillon=<id> reprend un brouillon ; ?n=… force un écran vierge
     après une validation. */
  searchParams: Promise<{ brouillon?: string; n?: string }>;
}) {
  const { brouillon, n } = await searchParams;
  const draftId = brouillon ? Number(brouillon) : null;
  if (draftId !== null && !Number.isInteger(draftId)) notFound();

  const data = await getInvoiceEntryData(draftId);
  if (draftId !== null && !data.draft) notFound();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title={data.draft ? `Brouillon ${data.draft.number}` : "Nouvelle facture fournisseur"}
        subtitle="Import, lecture automatique et vérification des lignes"
      />
      <InvoiceEntryWorkspace key={`${draftId ?? "new"}-${n ?? ""}`} data={data} />
    </main>
  );
}
