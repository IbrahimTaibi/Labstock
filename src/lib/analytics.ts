import { createClient } from "./supabase/server";
export { applyFilters, summarize } from "./analytics-summary";

import type {
  AnalyticsRow,
  AnalyticsWorkspaceData,
  ArticleDetail,
  ArticleLot,
  ArticleMovement,
} from "./types";

/** Fenêtre longue : lisse les pics, sert au taux de couverture et à la rotation. */
export const DAYS_LONG = 90;
/** Fenêtre courte : CMJ affichée à côté, plus réactive. */
export const DAYS_SHORT = 30;
/** Profondeur de la courbe d'évolution des sorties (§6.3). */
export const EXITS_WINDOW = 30;

export async function getAnalyticsWorkspace(): Promise<AnalyticsWorkspaceData> {
  const supabase = await createClient();

  const [analytics, exits, catalogue] = await Promise.all([
    supabase.rpc("inventory_analytics", {
      p_days_long: DAYS_LONG,
      p_days_short: DAYS_SHORT,
    }),
    supabase.rpc("inventory_exits_series", { p_days: EXITS_WINDOW }),
    supabase.from("products").select("id", { count: "exact", head: true }),
  ]);

  if (analytics.error) {
    throw new Error(`Chargement de l'analyse : ${analytics.error.message}`);
  }
  if (exits.error) {
    throw new Error(`Chargement des sorties : ${exits.error.message}`);
  }

  /* Postgres renvoie `numeric` en chaîne : sans conversion explicite, les
     additions côté JavaScript concatèneraient au lieu d'additionner. */
  const rows = ((analytics.data ?? []) as AnalyticsRow[]).map((row) => ({
    ...row,
    stock_average: Number(row.stock_average),
    cmj_short: Number(row.cmj_short),
    cmj_long: Number(row.cmj_long),
    coverage_days: row.coverage_days === null ? null : Number(row.coverage_days),
    rotation: row.rotation === null ? null : Number(row.rotation),
    cump: Number(row.cump),
    stock_value: Number(row.stock_value),
    order_value: Number(row.order_value),
  }));

  return {
    rows,
    categories: [...new Set(rows.map((row) => row.category))].sort(),
    suppliers: [...new Set(rows.map((row) => row.supplier))].sort(),
    exits: ((exits.data ?? []) as { day: string; quantity: number }[]).map(
      (point) => ({ day: point.day, quantity: Number(point.quantity) })
    ),
    catalogueArticles: catalogue.count ?? rows.length,
  };
}

/** Lots et mouvements d'un article, pour les onglets de la fiche (§8.5, §8.6). */
export async function getArticleDetail(productId: number): Promise<ArticleDetail> {
  const supabase = await createClient();

  const [lots, movements] = await Promise.all([
    supabase
      .from("lots")
      .select("id, lot_number, expiry_date, current_qty, location")
      .eq("product_id", productId)
      .gt("current_qty", 0)
      /* FEFO : le plus proche de la péremption se consomme en premier. */
      .order("expiry_date")
      .order("id"),
    supabase
      .from("stock_movements")
      .select("id, type, quantity, moved_at")
      .eq("product_id", productId)
      .order("moved_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(30),
  ]);

  if (lots.error) throw new Error(`Chargement des lots : ${lots.error.message}`);
  if (movements.error) {
    throw new Error(`Chargement des mouvements : ${movements.error.message}`);
  }

  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  return {
    lots: ((lots.data ?? []) as Omit<ArticleLot, "is_expired">[]).map((lot) => ({
      ...lot,
      is_expired: lot.expiry_date < todayIso,
    })),
    movements: (movements.data ?? []) as ArticleMovement[],
  };
}
