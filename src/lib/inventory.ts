import { createClient } from "./supabase/server";
export { summarizeCount } from "./inventory-summary";

import type {
  CategoryOption,
  InventoryLine,
  InventorySession,
  InventoryWorkspaceData,
} from "./types";

export async function getInventoryWorkspace(): Promise<InventoryWorkspaceData> {
  const supabase = await createClient();

  const [sessions, categories] = await Promise.all([
    supabase
      .from("inventory_sessions")
      .select("*")
      .order("opened_at", { ascending: false })
      .limit(8),
    supabase.from("categories").select("id, name").order("name"),
  ]);

  if (sessions.error) {
    throw new Error(`Chargement des comptages : ${sessions.error.message}`);
  }
  if (categories.error) {
    throw new Error(`Chargement des catégories : ${categories.error.message}`);
  }

  const all = (sessions.data ?? []) as InventorySession[];
  const openSession = all.find((session) => session.status === "open") ?? null;

  let lines: InventoryLine[] = [];
  if (openSession) {
    const { data, error } = await supabase
      .from("inventory_lines_view")
      .select("*")
      .eq("session_id", openSession.id)
      .order("id");

    if (error) throw new Error(`Chargement du comptage : ${error.message}`);

    lines = ((data ?? []) as InventoryLine[]).map((line) => ({
      ...line,
      unit_price: Number(line.unit_price),
      variance_value:
        line.variance_value === null ? null : Number(line.variance_value),
    }));
  }

  return {
    openSession: openSession
      ? {
          ...openSession,
          variance_value: Number(openSession.variance_value),
        }
      : null,
    lines,
    categories: (categories.data ?? []) as CategoryOption[],
    history: all
      .filter((session) => session.status !== "open")
      .map((session) => ({
        ...session,
        variance_value: Number(session.variance_value),
      })),
  };
}
