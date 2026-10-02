import { PageHeader } from "@/components/shell/PageHeader";
import { DebtsWorkspace } from "@/components/debts/DebtsWorkspace";
import { getDebtsWorkspace } from "@/lib/debts";

export const dynamic = "force-dynamic";

export default async function DebtsPage() {
  const data = await getDebtsWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Gestion des dettes fournisseurs"
        subtitle="Suivi des échéances et des paiements fournisseurs"
      />

      <DebtsWorkspace data={data} />
    </main>
  );
}
