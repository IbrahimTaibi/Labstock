import { createClient } from "./supabase/server";

export type UserRole = "admin" | "member";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  initials: string;
  role: UserRole;
  /** Laboratoire effectif : le sien pour un membre, celui consulté pour l'admin. */
  labId: number | null;
  labName: string | null;
};

function initialsFrom(name: string) {
  return name
    .split(/[\s.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Utilisateur de la requête en cours, revalidé auprès du serveur d'auth.
 * Renvoie null si la session est absente ou invalide.
 *
 * Le rôle et le laboratoire proviennent de la table `profiles` (protégée par
 * RLS) : les métadonnées du jeton ne servent qu'à l'affichage, car elles sont
 * modifiables par l'utilisateur.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const email = user.email ?? "";
  const fullName =
    (user.user_metadata?.full_name as string | undefined) ?? email.split("@")[0];

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, lab_id, active_lab_id")
    .eq("id", user.id)
    .single();

  const role: UserRole = profile?.role === "admin" ? "admin" : "member";
  let labId: number | null =
    role === "admin" ? profile?.active_lab_id ?? null : profile?.lab_id ?? null;
  let labName: string | null = null;

  if (role === "admin" && labId === null) {
    /* Même repli que current_lab_id() côté base : l'admin consulte le
       premier laboratoire tant qu'il n'a pas fait de choix explicite. */
    const { data: fallback } = await supabase
      .from("laboratories")
      .select("id, name")
      .order("id")
      .limit(1)
      .maybeSingle();
    labId = fallback?.id ?? null;
    labName = fallback?.name ?? null;
  } else if (labId !== null) {
    const { data: lab } = await supabase
      .from("laboratories")
      .select("name")
      .eq("id", labId)
      .maybeSingle();
    labName = lab?.name ?? null;
  }

  return {
    id: user.id,
    email,
    fullName,
    jobTitle:
      (user.user_metadata?.job_title as string | undefined) ??
      (role === "admin" ? "Administrateur" : "Utilisateur"),
    initials: initialsFrom(fullName) || "?",
    role,
    labId,
    labName,
  };
}
