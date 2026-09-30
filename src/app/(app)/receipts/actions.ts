"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReceiptState = {
  status: "idle" | "success" | "error";
  message: string;
  /** Renseigné en cas de succès : cible de l'étiquette et de l'annulation. */
  receipt?: {
    receiptId: number;
    lotId: number;
    lotNumber: string;
    quantity: number;
    value: number;
    fefoRank: number | null;
    lotCreated: boolean;
    orderStatus: string;
  };
};

function revalidate() {
  revalidatePath("/receipts");
  /* La réception crée un lot et bouge le stock : marchandises, produits et
     tableau de bord doivent suivre. */
  revalidatePath("/goods");
  revalidatePath("/products");
  revalidatePath("/suppliers");
  revalidatePath("/");
}

export async function receiveGoods(input: {
  orderLineId: number;
  quantity: number;
  lotNumber: string;
  expiryDate: string;
}): Promise<ReceiptState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const lotNumber = input.lotNumber.trim();
  if (!lotNumber) {
    return { status: "error", message: "Le numéro de lot est obligatoire." };
  }
  if (!input.expiryDate) {
    return { status: "error", message: "La date de péremption est obligatoire." };
  }
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    return {
      status: "error",
      message: "La quantité reçue doit être un entier strictement positif.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("receive_goods", {
    p_order_line_id: input.orderLineId,
    p_quantity: input.quantity,
    p_lot_number: lotNumber,
    p_expiry_date: input.expiryDate,
    p_operator: user.fullName,
  });

  if (error) {
    /* Les messages de la fonction décrivent précisément le refus
       (péremption, reste à recevoir, lot déjà pris) : on les transmet. */
    return { status: "error", message: error.message };
  }

  revalidate();

  const result = data as {
    receipt_id: number;
    lot_id: number;
    quantity: number;
    value: number;
    lot_number: string;
    lot_created: boolean;
    fefo_rank: number | null;
    order_status: string;
  };

  return {
    status: "success",
    message: `${result.quantity} unités reçues — lot « ${result.lot_number} » ${
      result.lot_created ? "créé" : "complété"
    }, priorité FEFO ${result.fefo_rank ?? "—"}.`,
    receipt: {
      receiptId: result.receipt_id,
      lotId: result.lot_id,
      lotNumber: result.lot_number,
      quantity: result.quantity,
      value: Number(result.value),
      fefoRank: result.fefo_rank,
      lotCreated: result.lot_created,
      orderStatus: result.order_status,
    },
  };
}

/**
 * Contre-passe une réception validée. Rien n'est effacé : la réception
 * d'origine est marquée annulée et un mouvement de sortie compense
 * l'entrée. Voir `reverse_goods_receipt()` pour les garde-fous.
 */
export async function cancelReceipt(
  receiptId: number,
  reason?: string
): Promise<ReceiptState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("reverse_goods_receipt", {
    p_receipt_id: receiptId,
    p_operator: user.fullName,
    p_reason: reason?.trim() || null,
  });

  if (error) return { status: "error", message: error.message };

  revalidate();

  const result = data as { units: number };
  return {
    status: "success",
    message: `Réception annulée — ${result.units} unités retirées du stock. L'écriture d'origine reste tracée.`,
  };
}
