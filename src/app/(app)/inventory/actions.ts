"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { InventoryScope } from "@/lib/types";

export type InventoryState = {
  status: "idle" | "success" | "error";
  message: string;
};

function revalidate() {
  revalidatePath("/inventory");
  revalidatePath("/goods");
  revalidatePath("/");
}

export async function openSession(
  scope: InventoryScope,
  categoryId: number | null
): Promise<InventoryState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_inventory_session", {
    p_scope: scope,
    p_category_id: categoryId,
    p_operator: user.fullName,
  });

  if (error) return { status: "error", message: error.message };

  revalidate();
  const result = data as { reference: string; lines: number };
  return {
    status: "success",
    message: `Comptage ${result.reference} ouvert — ${result.lines} lots à vérifier.`,
  };
}

export async function saveCount(
  lineId: number,
  countedQty: number
): Promise<InventoryState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  if (!Number.isInteger(countedQty) || countedQty < 0) {
    return {
      status: "error",
      message: "La quantité comptée doit être un entier positif ou nul.",
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("save_inventory_count", {
    p_line_id: lineId,
    p_counted_qty: countedQty,
    p_operator: user.fullName,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/inventory");
  return { status: "success", message: "Comptage enregistré." };
}

export async function closeSession(sessionId: number): Promise<InventoryState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("close_inventory_session", {
    p_session_id: sessionId,
    p_operator: user.fullName,
  });

  if (error) return { status: "error", message: error.message };

  revalidate();
  const result = data as {
    counted_lines: number;
    skipped_lines: number;
    adjusted_lots: number;
    variance_units: number;
  };

  return {
    status: "success",
    message:
      `Comptage clôturé : ${result.adjusted_lots} lot(s) régularisé(s), ` +
      `écart net ${result.variance_units > 0 ? "+" : ""}${result.variance_units} unités. ` +
      `${result.skipped_lines} ligne(s) non comptée(s) laissée(s) inchangée(s).`,
  };
}
