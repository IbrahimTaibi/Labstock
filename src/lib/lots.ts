import { createClient } from "./supabase/server";
export { lotConformity } from "./lot-conformity";

import type { Lot, LotHistoryEvent, LotStats, ProductOption } from "./types";

export async function getLots(): Promise<Lot[]> {
  const supabase = await createClient();

  /* Ordre FEFO : les lots encore consommables d'abord, du plus urgent au
     plus lointain ; les périmés ferment la marche (traités via le filtre). */
  const { data, error } = await supabase
    .from("lots_view")
    .select("*")
    .order("is_expired", { ascending: true })
    .order("expiry_date", { ascending: true });

  if (error) throw new Error(`Chargement des lots : ${error.message}`);
  return (data ?? []) as Lot[];
}

export async function getProductOptions(): Promise<ProductOption[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, unit_price, categories(name), suppliers(name)")
    .order("name");

  if (error) throw new Error(`Chargement des produits : ${error.message}`);

  type Row = {
    id: number;
    name: string;
    unit_price: number;
    categories: { name: string } | { name: string }[] | null;
    suppliers: { name: string } | { name: string }[] | null;
  };

  const first = (value: Row["categories"]) =>
    Array.isArray(value) ? value[0]?.name : value?.name;

  return ((data ?? []) as Row[]).map((row) => ({
    id: row.id,
    name: row.name,
    unit_price: Number(row.unit_price),
    category: first(row.categories) ?? "—",
    supplier: first(row.suppliers) ?? "—",
  }));
}

/** Un lot précis, pour la fiche d'historique complet. */
export async function getLot(id: number): Promise<Lot | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots_view")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Chargement du lot : ${error.message}`);
  return (data as Lot) ?? null;
}

/** Chronologie recomposée d'un lot : création, réceptions, sorties, comptages. */
export async function getLotHistory(id: number): Promise<LotHistoryEvent[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lot_history_view")
    .select("lot_id, kind, occurred_at, actor, quantity, reference")
    .eq("lot_id", id)
    .order("occurred_at", { ascending: false });

  if (error) throw new Error(`Chargement de l'historique : ${error.message}`);
  return (data ?? []) as LotHistoryEvent[];
}

const EXPIRY_WARNING_DAYS = 30;

export function computeLotStats(lots: Lot[]): LotStats {
  return {
    total: lots.length,
    active: lots.filter((lot) => lot.fefo_rank === 1).length,
    inactive: lots.filter((lot) => lot.fefo_rank !== 1).length,
    expiringSoon: lots.filter(
      (lot) => !lot.is_expired && lot.days_left < EXPIRY_WARNING_DAYS
    ).length,
    expired: lots.filter((lot) => lot.is_expired).length,
  };
}

export { EXPIRY_WARNING_DAYS };
