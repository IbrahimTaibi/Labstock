"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { AnalysisItemRole, InstrumentStatus } from "@/lib/types";

export type AnalysisConfigState = {
  status: "success" | "error";
  message: string;
  analysisId?: number;
};

export type AnalysisConfigInput = {
  id: number | null;
  analysis: {
    code: string;
    name: string;
    category: string;
    description: string;
    turnaround_hours: number | null;
    sample_type: string;
    tube: string;
    sample_volume_ml: number | null;
    transport_conditions: string;
    urgent_allowed: boolean;
    bio_validation_required: boolean;
    microscopy_control: boolean;
    active: boolean;
    notes: string;
  };
  /** Nul : aucun automate rattaché. */
  instrument: {
    id: number | null;
    name: string;
    category: string;
    status: InstrumentStatus;
    lis_interface: boolean;
    calibration: string;
    maintenance: string;
  } | null;
  items: {
    product_id: number;
    role: AnalysisItemRole;
    coefficient: number;
    consumption_unit: string;
    auto_destock: boolean;
    condition: string;
    germ_type: string;
    incubation: string;
  }[];
};

const ROLES: AnalysisItemRole[] = ["consumable", "reagent", "culture", "antibiotic"];

/**
 * Enregistre la configuration d'une analyse. Réservé à l'administrateur :
 * un coefficient engage tous les déstockages à venir (voir l'écran des
 * coefficients). Les sorties déjà validées ne sont pas touchées.
 */
export async function saveAnalysisConfig(
  input: AnalysisConfigInput
): Promise<AnalysisConfigState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };
  if (user.role !== "admin")
    return { status: "error", message: "Réservé à l'administrateur." };

  if (!input.analysis.code.trim())
    return { status: "error", message: "Le code LIS est obligatoire." };
  if (!input.analysis.name.trim())
    return { status: "error", message: "Le nom de l'analyse est obligatoire." };
  if (!input.analysis.category.trim())
    return { status: "error", message: "La catégorie est obligatoire." };

  const seen = new Set<number>();
  for (const item of input.items) {
    if (!Number.isInteger(item.product_id))
      return { status: "error", message: "Chaque ligne doit désigner un article." };
    if (seen.has(item.product_id))
      return {
        status: "error",
        message: "Un même article figure deux fois : regroupez ses quantités sur une seule ligne.",
      };
    seen.add(item.product_id);
    if (!ROLES.includes(item.role))
      return { status: "error", message: "Type de ligne inconnu." };
    if (!Number.isFinite(item.coefficient) || item.coefficient <= 0)
      return { status: "error", message: "Chaque quantité par test doit être supérieure à zéro." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_analysis_config", {
    p_analysis_id: input.id,
    p_analysis: input.analysis,
    p_instrument: input.instrument,
    p_items: input.items,
    p_operator: user.fullName,
  });

  if (error) {
    if (error.code === "23505")
      return {
        status: "error",
        message: error.message.includes("instruments")
          ? "Un automate de ce nom existe déjà : choisissez-le dans la liste."
          : `Le code LIS « ${input.analysis.code.trim()} » est déjà utilisé par une autre analyse.`,
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/settings/analyses");
  revalidatePath("/issues");
  revalidatePath("/issues/coefficients");

  const result = data as { analysis_id: number; items: number };
  return {
    status: "success",
    analysisId: result.analysis_id,
    message:
      input.id === null
        ? `Analyse créée (${result.items} ligne(s) de consommation).`
        : `Configuration enregistrée (${result.items} ligne(s) de consommation).`,
  };
}
