"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/auth";

export type LabsState = {
  status: "idle" | "success" | "error";
  message: string;
};

/* Le RLS n'autorise déjà que l'admin ; la vérification ici évite simplement
   un aller-retour serveur pour un message d'erreur plus clair. */
async function requireAdmin() {
  const user = await getCurrentUser();
  if (!user) return null;
  return user.role === "admin" ? user : null;
}

function revalidateAll() {
  /* Changer de laboratoire change les données de toutes les pages. */
  revalidatePath("/", "layout");
}

export async function createLab(name: string): Promise<LabsState> {
  const admin = await requireAdmin();
  if (!admin)
    return { status: "error", message: "Réservé à l'administrateur." };

  const trimmed = name.trim();
  if (!trimmed)
    return { status: "error", message: "Le nom du laboratoire est requis." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("laboratories")
    .insert({ name: trimmed });

  if (error) {
    if (error.code === "23505")
      return { status: "error", message: `« ${trimmed} » existe déjà.` };
    return { status: "error", message: error.message };
  }

  revalidatePath("/labs");
  return { status: "success", message: `Laboratoire « ${trimmed} » créé.` };
}

export async function activateLab(labId: number): Promise<LabsState> {
  const admin = await requireAdmin();
  if (!admin)
    return { status: "error", message: "Réservé à l'administrateur." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_active_lab", { p_lab_id: labId });

  if (error) return { status: "error", message: error.message };

  revalidateAll();
  return { status: "success", message: "Laboratoire activé." };
}

export async function assignUser(
  userId: string,
  labId: number | null,
  role: UserRole
): Promise<LabsState> {
  const admin = await requireAdmin();
  if (!admin)
    return { status: "error", message: "Réservé à l'administrateur." };

  if (role !== "admin" && role !== "member")
    return { status: "error", message: "Rôle inconnu." };

  if (userId === admin.id && role !== "admin")
    return {
      status: "error",
      message: "Impossible de retirer son propre rôle d'administrateur.",
    };

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ role, lab_id: role === "admin" ? null : labId })
    .eq("id", userId);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/labs");
  return { status: "success", message: "Compte mis à jour." };
}
