import { createClient } from "./supabase/server";
import type {
  CoefficientDetail,
  IssueHistoryEntry,
  IssueWorkspaceData,
  PendingConsumable,
  PrescribedAnalysis,
} from "./types";

export async function getIssueWorkspace(): Promise<IssueWorkspaceData> {
  const supabase = await createClient();

  const [orders, consumables, coefficients, history] = await Promise.all([
    supabase
      .from("lis_orders")
      .select("id, batch_ref, sample_count, imported_at, analyses(code, name, section)")
      .eq("status", "pending")
      .order("id"),
    supabase.from("pending_consumables").select("*").order("product_name"),
    supabase
      .from("analyses")
      .select("code, name, analysis_consumables(products(name))")
      .order("code"),
    supabase
      .from("stock_issues")
      .select("id, mode, operator, issued_at, total_references, total_quantity")
      .order("issued_at", { ascending: false })
      .limit(5),
  ]);

  const failed = [orders, consumables, coefficients, history].find((r) => r.error);
  if (failed?.error) {
    throw new Error(`Chargement des sorties : ${failed.error.message}`);
  }

  /* Une jointure imbriquée peut arriver en objet ou en tableau selon la
     cardinalité déduite : on normalise dans les deux cas. */
  const one = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  type OrderRow = {
    id: number;
    batch_ref: string;
    sample_count: number;
    imported_at: string;
    analyses: { code: string; name: string; section: string } | { code: string; name: string; section: string }[] | null;
  };

  const analyses: PrescribedAnalysis[] = ((orders.data ?? []) as OrderRow[]).map(
    (row) => {
      const analysis = one(row.analyses);
      return {
        id: row.id,
        batch_ref: row.batch_ref,
        code: analysis?.code ?? "—",
        name: analysis?.name ?? "—",
        section: analysis?.section ?? "—",
        sample_count: row.sample_count,
        imported_at: row.imported_at,
      };
    }
  );

  type CoefficientRow = {
    code: string;
    name: string;
    analysis_consumables: { products: { name: string } | { name: string }[] | null }[] | null;
  };

  const coefficientDetails: CoefficientDetail[] = (
    (coefficients.data ?? []) as CoefficientRow[]
  ).map((row) => ({
    code: row.code,
    analysis: row.name,
    consumables: (row.analysis_consumables ?? [])
      .map((link) => one(link.products)?.name)
      .filter((name): name is string => Boolean(name)),
  }));

  const rows = (consumables.data ?? []) as PendingConsumable[];

  return {
    analyses,
    consumables: rows.map((row) => ({
      ...row,
      raw_quantity: Number(row.raw_quantity),
      coefficient: row.coefficient === null ? null : Number(row.coefficient),
    })),
    coefficients: coefficientDetails,
    history: (history.data ?? []) as IssueHistoryEntry[],
    lastSync: analyses[0]?.imported_at ?? null,
  };
}

export function summarize(data: IssueWorkspaceData) {
  const totalSamples = data.analyses.reduce(
    (sum, analysis) => sum + analysis.sample_count,
    0
  );
  const totalQuantity = data.consumables.reduce(
    (sum, row) => sum + row.required_quantity,
    0
  );
  const stockAvailable = data.consumables.reduce(
    (sum, row) => sum + row.stock_available,
    0
  );

  return {
    totalAnalyses: data.analyses.length,
    totalSamples,
    totalReferences: data.consumables.length,
    totalQuantity,
    stockAvailable,
    allAvailable: data.consumables.every((row) => row.is_available),
    shortages: data.consumables.filter((row) => !row.is_available),
  };
}
