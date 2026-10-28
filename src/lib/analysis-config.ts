import { createClient } from "./supabase/server";
import type { AnalysisConfig, AnalysisConfigData, AnalysisItem } from "./types";

type Joined<T> = T | T[] | null;
const first = <T,>(value: Joined<T>): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

/**
 * Écran « Configuration de l'analyse » : le catalogue des analyses (pour
 * le sélecteur), les référentiels (articles, automates) et l'analyse
 * ouverte avec toutes ses lignes de consommation.
 */
export async function getAnalysisConfigData(
  analysisId: number | null
): Promise<AnalysisConfigData> {
  const supabase = await createClient();

  const [analysesRes, countsRes, productsRes, instrumentsRes] = await Promise.all([
    supabase.from("analyses").select("id, code, name, category, section, active").order("code"),
    supabase.from("analysis_consumables").select("analysis_id"),
    supabase.from("products").select("id, name, reference, packaging").order("name"),
    supabase
      .from("instruments")
      .select("id, name, category, status, lis_interface, calibration, maintenance")
      .order("name"),
  ]);

  if (analysesRes.error) throw new Error(`Chargement des analyses : ${analysesRes.error.message}`);
  if (countsRes.error) throw new Error(`Chargement des coefficients : ${countsRes.error.message}`);
  if (productsRes.error) throw new Error(`Chargement des articles : ${productsRes.error.message}`);
  if (instrumentsRes.error)
    throw new Error(`Chargement des automates : ${instrumentsRes.error.message}`);

  const counts = new Map<number, number>();
  for (const row of countsRes.data ?? [])
    counts.set(row.analysis_id, (counts.get(row.analysis_id) ?? 0) + 1);

  let current: AnalysisConfig | null = null;
  if (analysisId !== null) {
    const { data, error } = await supabase
      .from("analyses")
      .select(
        "id, code, name, section, category, description, turnaround_hours, sample_type, tube, sample_volume_ml, transport_conditions, urgent_allowed, bio_validation_required, microscopy_control, active, instrument_id, notes, updated_at, updated_by, analysis_consumables(product_id, coefficient, role, consumption_unit, auto_destock, condition, germ_type, incubation, products(name, reference, packaging))"
      )
      .eq("id", analysisId)
      .maybeSingle();
    if (error) throw new Error(`Chargement de l'analyse : ${error.message}`);

    if (data) {
      type Row = {
        product_id: number;
        coefficient: number;
        role: AnalysisItem["role"];
        consumption_unit: string | null;
        auto_destock: boolean;
        condition: string | null;
        germ_type: string | null;
        incubation: string | null;
        products: Joined<{ name: string; reference: string | null; packaging: string | null }>;
      };
      const { analysis_consumables, section, ...rest } = data as typeof data & {
        analysis_consumables: Row[];
      };
      current = {
        ...rest,
        /* Analyses antérieures à la fiche : la rubrique historique tient
           lieu de catégorie. */
        category: rest.category ?? section,
        sample_volume_ml: rest.sample_volume_ml === null ? null : Number(rest.sample_volume_ml),
        items: (analysis_consumables ?? []).map((row) => {
          const product = first(row.products);
          return {
            product_id: row.product_id,
            product_name: product?.name ?? "—",
            reference: product?.reference ?? null,
            packaging: product?.packaging ?? null,
            role: row.role,
            coefficient: Number(row.coefficient),
            consumption_unit: row.consumption_unit,
            auto_destock: row.auto_destock,
            condition: row.condition,
            germ_type: row.germ_type,
            incubation: row.incubation,
          };
        }),
      };
    }
  }

  return {
    analyses: (analysesRes.data ?? []).map((a) => ({
      id: a.id,
      code: a.code,
      name: a.name,
      category: a.category ?? a.section,
      active: a.active,
      item_count: counts.get(a.id) ?? 0,
    })),
    current,
    products: productsRes.data ?? [],
    instruments: instrumentsRes.data ?? [],
  };
}
