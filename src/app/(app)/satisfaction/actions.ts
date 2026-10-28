"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type EvaluationState = {
  status: "success" | "error";
  message: string;
  evaluationId?: number;
};

export type EvaluationInput = {
  /** Nulle pour une nouvelle évaluation. */
  id: number | null;
  orderId: number;
  expectedDate: string;
  deliveredDate: string;
  conforming: boolean;
  quality: string;
  remark: string;
  delayCause: string | null;
  rating: number;
  comment: string | null;
};

const DATE = /^\d{4}-\d{2}-\d{2}$/;

function revalidate() {
  revalidatePath("/satisfaction");
  revalidatePath("/suppliers");
}

export async function saveEvaluation(input: EvaluationInput): Promise<EvaluationState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  if (!Number.isInteger(input.orderId))
    return { status: "error", message: "Sélectionnez le bon de commande à évaluer." };
  if (!DATE.test(input.expectedDate))
    return { status: "error", message: "La date de livraison prévue est requise." };
  if (!DATE.test(input.deliveredDate))
    return { status: "error", message: "La date de livraison réelle est requise." };
  if (!input.quality.trim() || !input.remark.trim())
    return { status: "error", message: "La qualité et la remarque sont obligatoires." };
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5)
    return { status: "error", message: "La note doit être comprise entre 1 et 5." };

  const row = {
    order_id: input.orderId,
    expected_date: input.expectedDate,
    delivered_date: input.deliveredDate,
    conforming: input.conforming,
    quality: input.quality.trim(),
    remark: input.remark.trim(),
    /* Une cause de retard n'a pas de sens pour une livraison à l'heure. */
    delay_cause: input.deliveredDate > input.expectedDate ? input.delayCause?.trim() || null : null,
    rating: input.rating,
    comment: input.comment?.trim() || null,
    evaluated_by: user.fullName,
  };

  const supabase = await createClient();
  const query =
    input.id === null
      ? supabase.from("delivery_evaluations").insert(row)
      : supabase
          .from("delivery_evaluations")
          .update({ ...row, updated_at: new Date().toISOString() })
          .eq("id", input.id);
  const { data, error } = await query.select("id").maybeSingle();

  if (error) {
    if (error.code === "23505")
      return {
        status: "error",
        message: "Ce bon de commande est déjà évalué : sélectionnez son évaluation pour la modifier.",
      };
    return { status: "error", message: error.message };
  }
  if (!data) return { status: "error", message: "Évaluation introuvable." };

  revalidate();
  return {
    status: "success",
    message: input.id === null ? "Évaluation enregistrée." : "Évaluation modifiée.",
    evaluationId: data.id,
  };
}

export async function deleteEvaluation(id: number): Promise<EvaluationState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("delivery_evaluations")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Évaluation introuvable." };

  revalidate();
  return { status: "success", message: "Évaluation supprimée." };
}
