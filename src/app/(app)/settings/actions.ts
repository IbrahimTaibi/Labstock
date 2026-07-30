"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function updateProfile(
  fullName: string,
  jobTitle: string
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const name = fullName.trim();
  if (!name)
    return { status: "error", message: "Le nom complet est requis." };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: name, job_title: jobTitle.trim() || null },
  });

  if (error) return { status: "error", message: error.message };

  /* Le profil est reflété dans profiles pour l'écran d'administration. */
  await supabase
    .from("profiles")
    .update({ full_name: name })
    .eq("id", user.id);

  revalidatePath("/", "layout");
  return { status: "success", message: "Profil mis à jour." };
}

export async function changePassword(
  password: string,
  confirmation: string
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  if (password.length < 8)
    return {
      status: "error",
      message: "Le mot de passe doit compter au moins 8 caractères.",
    };
  if (password !== confirmation)
    return {
      status: "error",
      message: "Les deux mots de passe ne correspondent pas.",
    };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });

  if (error) {
    if (error.code === "same_password")
      return {
        status: "error",
        message: "Le nouveau mot de passe doit différer de l'actuel.",
      };
    return { status: "error", message: error.message };
  }

  return { status: "success", message: "Mot de passe modifié." };
}

export async function saveCategory(
  id: number | null,
  name: string
): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const trimmed = name.trim();
  if (!trimmed)
    return { status: "error", message: "Le nom de la catégorie est requis." };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("categories").update({ name: trimmed }).eq("id", id)
    : await supabase.from("categories").insert({ name: trimmed });

  if (error) {
    if (error.code === "23505")
      return {
        status: "error",
        message: `La catégorie « ${trimmed} » existe déjà.`,
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/settings");
  return {
    status: "success",
    message: id
      ? `Catégorie renommée en « ${trimmed} ».`
      : `Catégorie « ${trimmed} » créée.`,
  };
}

export async function deleteCategory(id: number): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.from("categories").delete().eq("id", id);

  if (error) {
    if (error.code === "23503")
      return {
        status: "error",
        message:
          "Suppression impossible : des produits ou comptages utilisent cette catégorie.",
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/settings");
  return { status: "success", message: "Catégorie supprimée." };
}

export async function renameLab(name: string): Promise<SettingsState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  if (user.role !== "admin")
    return { status: "error", message: "Réservé à l'administrateur." };
  if (user.labId === null)
    return { status: "error", message: "Aucun laboratoire actif." };

  const trimmed = name.trim();
  if (!trimmed)
    return { status: "error", message: "Le nom du laboratoire est requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("laboratories")
    .update({ name: trimmed })
    .eq("id", user.labId);

  if (error) {
    if (error.code === "23505")
      return {
        status: "error",
        message: `Un laboratoire « ${trimmed} » existe déjà.`,
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/", "layout");
  return { status: "success", message: `Laboratoire renommé en « ${trimmed} ».` };
}
