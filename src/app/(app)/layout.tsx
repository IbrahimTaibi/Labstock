import { redirect } from "next/navigation";
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

  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
