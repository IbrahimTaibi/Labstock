import { PageHeader } from "@/components/shell/PageHeader";
import { LiveClock } from "@/components/receipts/ReceiptHeaderInfo";
import { AnalyticsWorkspace } from "@/components/analytics/AnalyticsWorkspace";
import { getAnalyticsWorkspace } from "@/lib/analytics";

export const dynamic = "force-dynamic";

export default async function AnalyticsPage() {
  const data = await getAnalyticsWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Inventaire analytique"
        subtitle="Consommation moyenne, rotation, couverture et réapprovisionnement"
        actions={<LiveClock />}
      />

      <AnalyticsWorkspace data={data} />
    </main>
  );
}
