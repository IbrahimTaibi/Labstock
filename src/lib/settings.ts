import { mergeLabSettings, type LabSettings } from "./lab-settings";
import { createClient } from "./supabase/server";
import type { SettingsWorkspaceData } from "./types";

/**
 * Configuration générale du laboratoire. Sans document enregistré, les
 * valeurs par défaut s'appliquent, avec le nom du laboratoire en base.
 */
export async function getLabSettings(labId: number | null): Promise<{
  settings: LabSettings;
  updated_at: string | null;
  updated_by: string | null;
}> {
  const supabase = await createClient();
  const [settingsRes, labRes] = await Promise.all([
    supabase.from("lab_settings").select("settings, updated_at, updated_by").maybeSingle(),
    labId === null
      ? Promise.resolve({ data: null, error: null })
      : supabase.from("laboratories").select("name").eq("id", labId).maybeSingle(),
  ]);

  if (settingsRes.error)
    throw new Error(`Chargement des paramètres : ${settingsRes.error.message}`);

  const settings = mergeLabSettings(settingsRes.data?.settings);
  if (!settings.lab.name && labRes.data?.name) settings.lab.name = labRes.data.name;

  return {
    settings,
    updated_at: settingsRes.data?.updated_at ?? null,
    updated_by: settingsRes.data?.updated_by ?? null,
  };
}

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
