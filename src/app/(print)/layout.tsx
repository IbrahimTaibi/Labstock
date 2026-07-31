import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

/**
 * Coquille des documents imprimables : même contrôle de session que les
 * pages applicatives, mais sans barre latérale ni en-tête — une feuille
 * n'a pas de navigation.
 */
export default async function PrintLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  return <>{children}</>;
}
