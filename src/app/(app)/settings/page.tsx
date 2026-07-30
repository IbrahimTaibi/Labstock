import { redirect } from "next/navigation";
import { PageHeader } from "@/components/shell/PageHeader";
import { SettingsWorkspace } from "@/components/settings/SettingsWorkspace";
import { getCurrentUser } from "@/lib/auth";
import { getSettingsWorkspace } from "@/lib/settings";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const data = await getSettingsWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Paramètres"
        subtitle="Profil, sécurité et référentiels du laboratoire"
      />

      <SettingsWorkspace user={user} data={data} />
    </main>
  );
}
