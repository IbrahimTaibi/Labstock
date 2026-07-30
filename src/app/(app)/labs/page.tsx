import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LabsWorkspace } from "@/components/labs/LabsWorkspace";
import { getCurrentUser } from "@/lib/auth";
import { getLabsWorkspace } from "@/lib/labs";

export const dynamic = "force-dynamic";

export default async function LabsPage() {
  const user = await getCurrentUser();
  if (!user || user.role !== "admin") redirect("/");

  const data = await getLabsWorkspace(user.labId);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Laboratoires"
        subtitle="Création des laboratoires et affectation des comptes"
      />

      <LabsWorkspace data={data} currentUserId={user.id} />
    </main>
  );
}
