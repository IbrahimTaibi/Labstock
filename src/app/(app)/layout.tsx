import { redirect } from "next/navigation";
import { Building2 } from "lucide-react";
import { Sidebar } from "@/components/shell/Sidebar";
import { getCurrentUser } from "@/lib/auth";

/**
 * Coquille des pages authentifiées. Le proxy filtre déjà les requêtes, mais
 * la session est revérifiée ici pour que ces pages ne puissent jamais rendre
 * de données sans utilisateur valide.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  /* Un membre sans laboratoire ne verrait que des écrans vides : on lui
     explique la situation plutôt que de le laisser errer. */
  const awaitingLab = user.role === "member" && user.labId === null;

  return (
    <div className="flex min-h-screen">
      <Sidebar isAdmin={user.role === "admin"} labName={user.labName} />
      <div className="min-w-0 flex-1">
        {awaitingLab ? (
          <main className="grid min-h-screen place-items-center p-6">
            <div className="card max-w-md p-6 text-center">
              <Building2
                size={28}
                strokeWidth={1.8}
                className="mx-auto mb-3 text-[var(--text-muted)]"
                aria-hidden
              />
              <h1 className="mb-1 text-[14px] font-semibold text-[var(--text-primary)]">
                Aucun laboratoire attribué
              </h1>
              <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
                Votre compte n&apos;est rattaché à aucun laboratoire.
                Contactez l&apos;administrateur pour être affecté, puis
                reconnectez-vous.
              </p>
            </div>
          </main>
        ) : (
          children
        )}
      </div>
    </div>
  );
}
