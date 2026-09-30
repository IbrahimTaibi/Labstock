import { createClient } from "./supabase/server";
import type {
  AnalysisCoefficient,
  CoefficientDetail,
  IssueHistoryEntry,
  IssueWorkspaceData,
  LisSource,
  LisWebhookEvent,
  PendingConsumable,
  PrescribedAnalysis,
} from "./types";

/* Les tables du connecteur LIS arrivent par une migration distincte. Tant
   qu'elle n'est pas appliquée, l'écran doit rester utilisable en mode
   simulé plutôt que de tomber en erreur : PostgREST signale une relation
   absente par 42P01 (Postgres) ou PGRST205 (cache de schéma). */
const MISSING_RELATION = new Set(["42P01", "PGRST205", "PGRST204"]);

function optional<T>(
  result: { data: T[] | null; error: { code?: string; message: string } | null },
  label: string
): T[] {
  if (!result.error) return result.data ?? [];
  if (MISSING_RELATION.has(result.error.code ?? "")) return [];
  throw new Error(`${label} : ${result.error.message}`);
}

export async function getIssueWorkspace(): Promise<IssueWorkspaceData> {
  const supabase = await createClient();

  const [orders, consumables, coefficients, history, sources, events] =
    await Promise.all([
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
      supabase
        .from("lis_sources")
        .select("id, slug, name, active, last_event_at")
        .order("name"),
      supabase
        .from("lis_webhook_events")
        .select("id, slug, prescription_id, status, detail, analyses_created, received_at")
        .order("received_at", { ascending: false })
        .limit(8),
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
    sources: optional<LisSource>(sources, "Chargement des connecteurs LIS"),
    events: optional<LisWebhookEvent>(events, "Chargement du journal LIS"),
  };
}

/** Table des coefficients, à plat, pour la page de consultation (§7.2). */
export async function getCoefficients(): Promise<AnalysisCoefficient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("analysis_consumables")
    .select("coefficient, analyses(code, name, section), products(name, reference)")
    .order("analysis_id");

  if (error) throw new Error(`Chargement des coefficients : ${error.message}`);

  type Row = {
    coefficient: number;
    analyses:
      | { code: string; name: string; section: string }
      | { code: string; name: string; section: string }[]
      | null;
    products:
      | { name: string; reference: string | null }
      | { name: string; reference: string | null }[]
      | null;
  };

  const first = <T,>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  return ((data ?? []) as Row[])
    .map((row) => {
      const analysis = first(row.analyses);
      const product = first(row.products);
      return {
        analysis_code: analysis?.code ?? "—",
        analysis_name: analysis?.name ?? "—",
        section: analysis?.section ?? "—",
        product_name: product?.name ?? "—",
        reference: product?.reference ?? null,
        coefficient: Number(row.coefficient),
      };
    })
    .sort(
      (a, b) =>
        a.analysis_code.localeCompare(b.analysis_code) ||
        a.product_name.localeCompare(b.product_name)
    );
}

/** Journal complet des appels entrants du LIS (§9.2). */
export async function getLisEvents(): Promise<LisWebhookEvent[]> {
  const supabase = await createClient();
  const result = await supabase
    .from("lis_webhook_events")
    .select("id, slug, prescription_id, status, detail, analyses_created, received_at")
    .order("received_at", { ascending: false })
    .limit(200);

  return optional<LisWebhookEvent>(result, "Chargement du journal LIS");
}

/** Historique complet des sorties, avec le détail des lots consommés. */
export async function getIssueHistory(): Promise<IssueHistoryEntry[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stock_issues")
    .select("id, mode, operator, issued_at, total_references, total_quantity")
    .order("issued_at", { ascending: false });

  if (error) throw new Error(`Chargement de l'historique : ${error.message}`);
  return (data ?? []) as IssueHistoryEntry[];
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
