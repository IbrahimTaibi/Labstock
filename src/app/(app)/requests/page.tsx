import { PageHeader } from "@/components/shell/PageHeader";
import { RequestsWorkspace } from "@/components/requests/RequestsWorkspace";
import { getRequestsWorkspace } from "@/lib/purchase-requests";

export const dynamic = "force-dynamic";

export default async function RequestsPage() {
  const data = await getRequestsWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Demandes d'achat (D.A.)"
        subtitle="Gestion et suivi des demandes d'achat"
      />

      <RequestsWorkspace data={data} />
    </main>
  );
}
