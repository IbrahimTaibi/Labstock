import { createClient } from "./supabase/server";
import type { Dashboard } from "./types";

export async function getDashboard(): Promise<Dashboard> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard");
  if (error) throw new Error(`Chargement du tableau de bord : ${error.message}`);
  return data as Dashboard;
}

/** Variation en % entre les deux derniers points d'une série. */
export function lastChange(series: number[]): number | null {
  if (series.length < 2) return null;
  const previous = series[series.length - 2];
  const current = series[series.length - 1];
  if (!previous) return null;
  return ((current - previous) / previous) * 100;
}
