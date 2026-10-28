import { notFound, redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { AnalysisConfigWorkspace } from "@/components/settings/AnalysisConfigWorkspace";
import { getAnalysisConfigData } from "@/lib/analysis-config";
import { getCurrentUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Configuration d'une analyse. `?id=<n>` ouvre une analyse ; sans
 * paramètre, la première du catalogue ; `?nouvelle=1` une fiche vierge.
 */
export default async function AnalysisConfigPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string; nouvelle?: string; info?: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { id, nouvelle, info } = await searchParams;
  const requested = id ? Number(id) : null;
  if (requested !== null && !Number.isInteger(requested)) notFound();

  /* Sans choix explicite, on ouvre la première analyse plutôt qu'un écran
     vide : c'est presque toujours pour consulter qu'on arrive ici. */
  let data = await getAnalysisConfigData(requested);
  if (requested === null && !nouvelle && data.analyses.length > 0)
    data = await getAnalysisConfigData(data.analyses[0].id);
  if (requested !== null && !data.current) notFound();

  return (
    <main className="mx-auto w-full max-w-[1600px] p-4 md:p-5">
      <PageHeader
        title="Configuration de l'analyse"
        subtitle="Paramétrage complet de l'analyse : prélèvements, automates, réactifs, consommables, protocoles et règles"
      />
      <AnalysisConfigWorkspace
        key={`${data.current?.id ?? "new"}-${nouvelle ?? ""}`}
        data={data}
        isAdmin={user.role === "admin"}
        notice={info ?? null}
      />
    </main>
  );
}
