"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/** `email` est renvoyé pour réafficher la saisie : React réinitialise les
    champs non contrôlés dès que l'action se termine. */
export type SignInState = { error: string | null; email: string };

export async function signIn(
  _prev: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/");

  if (!email || !password) {
    return {
      error: "Renseignez votre adresse e-mail et votre mot de passe.",
      email,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    /* Un identifiant refusé et une panne de configuration produisent tous
       deux une erreur : les confondre rend le diagnostic impossible en
       production. Seul le premier cas reste volontairement vague, pour ne
       pas révéler quels comptes existent. */
    const rejected =
      error.code === "invalid_credentials" ||
      error.code === "email_not_confirmed";

    if (!rejected) {
      console.error("[auth] échec non lié aux identifiants", {
        code: error.code,
        status: error.status,
        message: error.message,
      });
      return {
        error:
          "Service d'authentification injoignable. Vérifiez la configuration du serveur.",
        email,
      };
    }

    return { error: "Identifiants incorrects.", email };
  }

  revalidatePath("/", "layout");
  /* Ne redirige que vers un chemin interne, jamais vers une URL fournie. */
  redirect(next.startsWith("/") && !next.startsWith("//") ? next : "/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}
