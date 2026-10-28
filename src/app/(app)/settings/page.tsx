import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { LabSettingsWorkspace } from "@/components/settings/LabSettingsWorkspace";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { getCurrentUser } from "@/lib/auth";
import { getLabSettings, getSettingsWorkspace } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [data, lab] = await Promise.all([
    getSettingsWorkspace(),
    getLabSettings(user.labId),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1600px] p-4 md:p-5">
      <PageHeader
        title="Paramètres généraux"
        subtitle="Configurez l'ensemble des paramètres du système pour une gestion optimale de votre laboratoire"
      />

      <LabSettingsWorkspace
        initial={lab.settings}
        updatedAt={lab.updated_at}
        updatedBy={lab.updated_by}
        isAdmin={user.role === "admin"}
      />

      {/* Divers : compte personnel et référentiel des catégories. */}
      <section id="compte" className="mt-6 scroll-mt-4">
        <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
          Mon compte &amp; référentiels
        </h2>
        <SettingsWorkspace user={user} data={data} />
      </section>
    </main>
  );
}
