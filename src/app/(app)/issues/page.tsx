import { PageHeader } from "@/components/shell/PageHeader";
import { LiveClock } from "@/components/receipts/ReceiptHeaderInfo";
import { ManualIssueWorkspace } from "@/components/issues/ManualIssueWorkspace";
import { getManualIssueData } from "@/lib/issues";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const data = await getManualIssueData();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Gestion des sorties de stock"
        subtitle="Sortie manuelle de consommables : scan ou recherche, lots FEFO, validation signée"
        actions={<LiveClock />}
      />

      <ManualIssueWorkspace data={data} />
    </main>
  );
}
