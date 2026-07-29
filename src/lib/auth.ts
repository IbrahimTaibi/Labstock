import { createClient } from "./supabase/server";

export type CurrentUser = {
  id: string;
  email: string;
  fullName: string;
  jobTitle: string;
  initials: string;
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
 * Les métadonnées ne servent qu'à l'affichage : elles sont modifiables par
 * l'utilisateur et ne doivent jamais fonder une décision d'autorisation.
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

  return {
    id: user.id,
    email,
    fullName,
    jobTitle:
      (user.user_metadata?.job_title as string | undefined) ?? "Utilisateur",
    initials: initialsFrom(fullName) || "?",
  };
}
