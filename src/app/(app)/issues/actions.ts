"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type IssueActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ManualIssueLine = {
  product_id: number;
  /** Lot imposé (étiquette scannée ou choix explicite) ; null = FEFO. */
  lot_id: number | null;
  quantity: number;
};

/**
 * Enregistre une sortie manuelle. Les contrôles de disponibilité et la
 * déduction FEFO sont faits en base, dans une seule transaction.
 */
export async function issueStockManual(
  lines: ManualIssueLine[],
  note: string
): Promise<IssueActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const clean = lines.filter((line) => line.quantity > 0);
  if (clean.length === 0)
    return { status: "error", message: "Ajoutez au moins un article à sortir." };
  if (
    clean.some(
      (line) =>
        !Number.isInteger(line.product_id) ||
        !Number.isInteger(line.quantity) ||
        (line.lot_id !== null && !Number.isInteger(line.lot_id))
    )
  )
    return {
      status: "error",
      message: "Les quantités doivent être des entiers positifs.",
    };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_stock_manual", {
    p_operator: user.fullName,
    p_lines: clean,
    p_note: note.trim() || null,
  });

  /* Les messages de la fonction (stock insuffisant, lot périmé) sont
     destinés à l'opérateur : on les transmet tels quels. */
  if (error) return { status: "error", message: error.message };

  revalidatePath("/issues");
  revalidatePath("/goods");
  revalidatePath("/products");
  revalidatePath("/");

  const result = data as { total_references: number; total_quantity: number };
  return {
    status: "success",
    message: `Sortie enregistrée : ${result.total_references} référence${
      result.total_references > 1 ? "s" : ""
    }, ${result.total_quantity} unité${result.total_quantity > 1 ? "s" : ""} déduite${
      result.total_quantity > 1 ? "s" : ""
    }.`,
  };
}
