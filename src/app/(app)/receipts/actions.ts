"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ReceiptState = {
  status: "idle" | "success" | "error";
  message: string;
};

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

  revalidatePath("/receipts");
  revalidatePath("/goods");
  revalidatePath("/");

  const result = data as {
    quantity: number;
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
  };
}
