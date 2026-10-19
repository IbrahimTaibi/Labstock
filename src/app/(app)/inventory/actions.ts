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

/** Fiche complémentaire d'un lot scanné : ce que la ligne de comptage ne porte pas. */
export type ScanProductInfo = {
  manufacturer_ref: string | null;
  supplier: string | null;
  stock_qty: number;
  min_stock: number;
  alert_stock: number;
  lot_location: string | null;
  lot_packaging: string | null;
  lot_manufacturer: string | null;
  lot_received_at: string;
};

export async function getScanProductInfo(
  productId: number,
  lotId: number
): Promise<ScanProductInfo | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const supabase = await createClient();
  const [product, lot] = await Promise.all([
    supabase
      .from("products")
      .select("manufacturer_ref, stock_qty, min_stock, alert_stock, suppliers(name)")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("lots")
      .select("location, packaging, manufacturer, created_at")
      .eq("id", lotId)
      .maybeSingle(),
  ]);

  if (product.error || lot.error || !product.data || !lot.data) return null;

  const supplier = product.data.suppliers as { name: string } | { name: string }[] | null;
  return {
    manufacturer_ref: product.data.manufacturer_ref,
    supplier: (Array.isArray(supplier) ? supplier[0]?.name : supplier?.name) ?? null,
    stock_qty: product.data.stock_qty,
    min_stock: product.data.min_stock,
    alert_stock: product.data.alert_stock,
    lot_location: lot.data.location,
    lot_packaging: lot.data.packaging,
    lot_manufacturer: lot.data.manufacturer,
    lot_received_at: lot.data.created_at,
  };
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
