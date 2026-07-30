import { createClient } from "./supabase/server";
import type { SettingsWorkspaceData } from "./types";

/** Référentiels du laboratoire pour l'écran Paramètres. */
export async function getSettingsWorkspace(): Promise<SettingsWorkspaceData> {
  const supabase = await createClient();

  const [categoriesRes, productsRes] = await Promise.all([
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("products").select("category_id"),
  ]);

  if (categoriesRes.error)
    throw new Error(`Chargement des catégories : ${categoriesRes.error.message}`);
  if (productsRes.error)
    throw new Error(`Chargement des produits : ${productsRes.error.message}`);

  const counts = new Map<number, number>();
  for (const p of productsRes.data ?? []) {
    counts.set(p.category_id, (counts.get(p.category_id) ?? 0) + 1);
  }

  return {
    categories: (categoriesRes.data ?? []).map((c) => ({
      ...c,
      products: counts.get(c.id) ?? 0,
    })),
  };
}
