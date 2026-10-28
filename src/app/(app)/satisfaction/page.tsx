import { PageHeader } from "@/components/shell/PageHeader";
import { SatisfactionWorkspace } from "@/components/satisfaction/SatisfactionWorkspace";
import { getSatisfactionData } from "@/lib/satisfaction";

export const dynamic = "force-dynamic";

export default async function SatisfactionPage() {
  const data = await getSatisfactionData();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Évaluation de la satisfaction des fournisseurs"
        subtitle="Suivi qualité des livraisons et performance fournisseurs"
      />
      <SatisfactionWorkspace data={data} />
    </main>
  );
}
