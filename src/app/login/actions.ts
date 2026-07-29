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
    /* Message volontairement identique pour un e-mail inconnu et un mot de
       passe erroné : ne pas révéler quels comptes existent. */
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
