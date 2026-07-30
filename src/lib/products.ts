import { createClient } from "./supabase/server";
import type {
  ProductLot,
  ProductRow,
  ProductsWorkspaceData,
  ProductStockState,
} from "./types";

/**
 * Catalogue produits du laboratoire avec catégories, fournisseurs et lots
 * encore détenus. Le stock affiché vient de products.stock_qty, tenu à jour
 * par les réceptions, sorties et régularisations d'inventaire.
 */
export async function getProductsWorkspace(): Promise<ProductsWorkspaceData> {
  const supabase = await createClient();

  const [productsRes, categoriesRes, suppliersRes, lotsRes] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, reference, category_id, supplier_id, unit_price, stock_qty, min_stock, created_at, categories(name), suppliers(name)"
      )
      .order("name"),
    supabase.from("categories").select("id, name").order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("lots")
      .select("id, product_id, lot_number, expiry_date, current_qty")
      .gt("current_qty", 0)
      .order("expiry_date"),
  ]);

  for (const res of [productsRes, categoriesRes, suppliersRes, lotsRes]) {
    if (res.error)
      throw new Error(`Chargement des produits : ${res.error.message}`);
  }

  type Join = { name: string } | { name: string }[] | null;
  const joinName = (value: Join) =>
    (Array.isArray(value) ? value[0]?.name : value?.name) ?? "—";

  const today = new Date().toISOString().slice(0, 10);

  const products: ProductRow[] = (productsRes.data ?? []).map((p) => {
    const unitPrice = Number(p.unit_price);
    const state: ProductStockState =
      p.stock_qty === 0 ? "out" : p.stock_qty <= p.min_stock ? "low" : "ok";
    return {
      id: p.id,
      name: p.name,
      reference: p.reference,
      display_reference:
        p.reference ?? `REF-${String(p.id).padStart(6, "0")}`,
      category_id: p.category_id,
      category: joinName(p.categories as Join),
      supplier_id: p.supplier_id,
      supplier: joinName(p.suppliers as Join),
      unit_price: unitPrice,
      stock_qty: p.stock_qty,
      min_stock: p.min_stock,
      stock_value: p.stock_qty * unitPrice,
      state,
      created_at: p.created_at,
    };
  });

  const lots: ProductLot[] = (lotsRes.data ?? []).map((l) => ({
    ...l,
    is_expired: l.expiry_date < today,
  }));

  return {
    products,
    lots,
    categories: categoriesRes.data ?? [],
    suppliers: suppliersRes.data ?? [],
    totals: {
      count: products.length,
      stock_value: products.reduce((sum, p) => sum + p.stock_value, 0),
      ok_count: products.filter((p) => p.state === "ok").length,
      low_count: products.filter((p) => p.state === "low").length,
      out_count: products.filter((p) => p.state === "out").length,
    },
  };
}
