"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { RequestPriority } from "@/lib/types";

export type RequestState = {
  status: "idle" | "success" | "error";
  message: string;
};

function revalidate() {
  revalidatePath("/requests");
  /* Une conversion crée un bon de commande, visible sur les réceptions. */
  revalidatePath("/receipts");
}

/* Les exceptions de la base sont rédigées pour l'utilisateur : on garde le
   texte plutôt que de le remplacer par un message générique moins utile. */
function readableError(message: string) {
  return message.replace(/^.*?:\s*(?=[A-ZÀ-Ü])/, "");
}

export type RequestInput = {
  productId: number | null;
  reference: string | null;
  designation: string;
  supplierId: number | null;
  quantity: number;
  priority: RequestPriority;
  comment: string | null;
  estimatedUnitPrice: number | null;
};

/** Création d'une demande (§7). Le numéro DA-… est posé par la base. */
export async function createRequest(
  input: RequestInput
): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  if (user.labId === null)
    return {
      status: "error",
      message: "Aucun laboratoire attribué à ce compte.",
    };

  const designation = input.designation.trim();
  if (!designation)
    return { status: "error", message: "La désignation est requise." };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    return {
      status: "error",
      message: "La quantité demandée doit être un entier positif.",
    };

  const supabase = await createClient();
  const { error } = await supabase.from("purchase_requests").insert({
    lab_id: user.labId,
    product_id: input.productId,
    reference: input.reference?.trim() || null,
    designation,
    supplier_id: input.supplierId,
    quantity_requested: input.quantity,
    estimated_unit_price: input.estimatedUnitPrice,
    priority: input.priority,
    requester: user.fullName,
    comment: input.comment?.trim() || null,
    last_actor: user.fullName,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Demande d'achat créée." };
}

/** Modification d'une demande encore en attente (§7). */
export async function updateRequest(
  id: number,
  input: RequestInput
): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const designation = input.designation.trim();
  if (!designation)
    return { status: "error", message: "La désignation est requise." };
  if (!Number.isInteger(input.quantity) || input.quantity <= 0)
    return {
      status: "error",
      message: "La quantité demandée doit être un entier positif.",
    };

  const supabase = await createClient();
  /* Garde-fou applicatif : une demande déjà tranchée ne se réécrit pas. Le
     filtre porte sur le statut pour qu'une demande validée entre-temps ne
     soit pas modifiée au passage. */
  const { data, error } = await supabase
    .from("purchase_requests")
    .update({
      product_id: input.productId,
      reference: input.reference?.trim() || null,
      designation,
      supplier_id: input.supplierId,
      quantity_requested: input.quantity,
      estimated_unit_price: input.estimatedUnitPrice,
      priority: input.priority,
      comment: input.comment?.trim() || null,
      last_actor: user.fullName,
    })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");

  if (error) return { status: "error", message: readableError(error.message) };
  if (!data || data.length === 0)
    return {
      status: "error",
      message: "Seule une demande en attente peut être modifiée.",
    };

  revalidate();
  return { status: "success", message: "Demande mise à jour." };
}

/** Validation, avec arbitrage possible à la baisse (§9.3). */
export async function approveRequest(
  id: number,
  quantity: number | null
): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_purchase_request", {
    p_request_id: id,
    p_operator: user.fullName,
    p_quantity: quantity,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Demande validée." };
}

/** Refus motivé (§10.4). */
export async function rejectRequest(
  id: number,
  reason: string
): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_purchase_request", {
    p_request_id: id,
    p_operator: user.fullName,
    p_reason: reason,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Demande refusée." };
}

/**
 * Conversion en bon de commande (§9.4) : plusieurs demandes validées d'un
 * même fournisseur forment une seule commande.
 */
export async function convertRequests(ids: number[]): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  if (ids.length === 0)
    return {
      status: "error",
      message: "Sélectionnez au moins une demande à convertir.",
    };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("convert_purchase_requests", {
    p_request_ids: ids,
    p_operator: user.fullName,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  const result = data as { number?: string; lines?: number } | null;
  revalidate();
  return {
    status: "success",
    message: `Bon de commande ${result?.number ?? ""} créé (${
      result?.lines ?? 0
    } ligne(s)).`,
  };
}

/** Suppression (§7). Interdite dès qu'une demande est engagée. */
export async function deleteRequest(id: number): Promise<RequestState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_requests")
    .delete()
    .eq("id", id)
    .in("status", ["pending", "rejected"])
    .select("id");

  if (error) return { status: "error", message: readableError(error.message) };
  if (!data || data.length === 0)
    return {
      status: "error",
      message:
        "Une demande validée ou convertie ne peut pas être supprimée : son historique doit être conservé.",
    };

  revalidate();
  return { status: "success", message: "Demande supprimée." };
}
