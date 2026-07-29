"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { IssueMode } from "@/lib/types";

export type IssueActionState = {
  status: "idle" | "success" | "error";
  message: string;
};

/** Import des analyses prescrites depuis le logiciel de laboratoire. */
export async function syncOrders(): Promise<IssueActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sync_lis_orders", {
    sample_count: 10,
  });

  if (error) {
    return { status: "error", message: `Synchronisation impossible : ${error.message}` };
  }

  revalidatePath("/issues");
  const result = data as { analyses: number; samples: number };
  return {
    status: "success",
    message: `${result.analyses} analyses importées (${result.samples} échantillons).`,
  };
}

/**
 * Enregistre la sortie de stock. Les quantités transmises en mode manuel
 * sont des ajustements ; la déduction et les contrôles de disponibilité
 * restent faits en base, dans une seule transaction.
 */
export async function issueStock(
  mode: IssueMode,
  overrides: Array<{ product_id: number; quantity: number }> = []
): Promise<IssueActionState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const clean = overrides.filter(
    (row) => Number.isInteger(row.quantity) && row.quantity >= 0
  );
  if (clean.length !== overrides.length) {
    return {
      status: "error",
      message: "Les quantités doivent être des entiers positifs.",
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("issue_stock", {
    p_mode: mode,
    p_operator: user.fullName,
    p_overrides: clean,
  });

  if (error) {
    /* Les messages de la fonction (stock insuffisant, rien à déduire) sont
       destinés à l'opérateur : on les transmet tels quels. */
    return { status: "error", message: error.message };
  }

  revalidatePath("/issues");
  revalidatePath("/goods");
  revalidatePath("/");

  const result = data as { total_references: number; total_quantity: number };
  return {
    status: "success",
    message: `Sortie enregistrée : ${result.total_references} références, ${result.total_quantity} unités déduites.`,
  };
}
