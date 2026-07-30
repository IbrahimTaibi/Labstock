import { PageHeader } from "@/components/shell/PageHeader";
import { InventoryWorkspace } from "@/components/inventory/InventoryWorkspace";
import { getInventoryWorkspace, summarizeCount } from "@/lib/inventory";

export const dynamic = "force-dynamic";

export default async function InventoryPage() {
  const data = await getInventoryWorkspace();
  const totals = summarizeCount(data.lines);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Inventaire physique"
        subtitle="Comptage des lots et régularisation des écarts de stock"
        alertCount={totals.discrepancies}
      />

      <InventoryWorkspace data={data} />
    </main>
  );
}
