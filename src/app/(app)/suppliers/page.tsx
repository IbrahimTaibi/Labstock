import { PageHeader } from "@/components/shell/PageHeader";
import { SuppliersWorkspace } from "@/components/suppliers/SuppliersWorkspace";
import { getSuppliersWorkspace } from "@/lib/suppliers";

export const dynamic = "force-dynamic";

export default async function SuppliersPage() {
  const data = await getSuppliersWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Fournisseurs"
        subtitle="Référentiel fournisseurs : produits, commandes et encours de facturation"
        alertCount={data.totals.overdue_count}
      />

      <SuppliersWorkspace data={data} />
    </main>
  );
}
