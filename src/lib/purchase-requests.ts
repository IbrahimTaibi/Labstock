import {
  REQUEST_PRIORITY_ORDER,
  REQUEST_STATUS_ORDER,
} from "./request-status";
import { createClient } from "./supabase/server";
import type {
  PurchaseRequestEvent,
  PurchaseRequestRow,
  RequestPriority,
  RequestStatus,
  RequestSupplierTotal,
  RequestTotals,
  RequestsWorkspaceData,
} from "./types";

/**
 * Demandes d'achat du laboratoire, leur historique et les agrégats de
 * l'écran. Les six cartes (§3), les deux camemberts (§5) et le Top 5 (§5.3)
 * sont dérivés de la même liste : c'est ce qui garantit la cohérence que
 * §10.1 relève comme fautive dans la maquette (8+12+6 pour un total de 24).
 *
 * Le RLS cadre la lecture au laboratoire.
 */
export async function getRequestsWorkspace(): Promise<RequestsWorkspaceData> {
  const supabase = await createClient();

  const PAGE = 1000;
  const requests: PurchaseRequestRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await supabase
      .from("purchase_requests_view")
      .select("*")
      .order("requested_at", { ascending: false })
      .order("id", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (page.error)
      throw new Error(`Chargement des demandes : ${page.error.message}`);

    requests.push(
      ...(page.data ?? []).map((row) => ({
        ...row,
        estimated_unit_price:
          row.estimated_unit_price === null
            ? null
            : Number(row.estimated_unit_price),
      }))
    );
    if ((page.data?.length ?? 0) < PAGE) break;
  }

  const [eventsRes, productsRes, suppliersRes] = await Promise.all([
    supabase
      .from("purchase_request_events")
      .select("id, request_id, kind, occurred_at, actor, detail")
      .order("occurred_at", { ascending: false }),
    supabase
      .from("products")
      .select("id, name, reference, supplier_id")
      .order("name"),
    supabase.from("suppliers").select("id, name").order("name"),
  ]);

  if (eventsRes.error)
    throw new Error(`Chargement de l'historique : ${eventsRes.error.message}`);
  if (productsRes.error)
    throw new Error(`Chargement des produits : ${productsRes.error.message}`);
  if (suppliersRes.error)
    throw new Error(
      `Chargement des fournisseurs : ${suppliersRes.error.message}`
    );

  /* §3 — « Ce mois » compte le mois calendaire en cours, pas les 30 derniers
     jours : c'est ce que dit le sous-texte de la carte. */
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
    .toISOString()
    .slice(0, 10);

  const totals: RequestTotals = {
    total: requests.length,
    pending: 0,
    approved: 0,
    converted: 0,
    rejected: 0,
    critical: 0,
    this_month: 0,
  };

  const statusCount = new Map<RequestStatus, number>();
  const priorityCount = new Map<RequestPriority, number>();
  const supplierCount = new Map<string, number>();

  for (const request of requests) {
    totals[request.status] += 1;
    if (request.priority === "critical") totals.critical += 1;
    if (request.requested_at >= monthStart) totals.this_month += 1;

    statusCount.set(
      request.status,
      (statusCount.get(request.status) ?? 0) + 1
    );
    priorityCount.set(
      request.priority,
      (priorityCount.get(request.priority) ?? 0) + 1
    );
    if (request.supplier) {
      supplierCount.set(
        request.supplier,
        (supplierCount.get(request.supplier) ?? 0) + 1
      );
    }
  }

  const byStatus = REQUEST_STATUS_ORDER.filter((key) =>
    statusCount.has(key)
  ).map((key) => ({ key, count: statusCount.get(key) ?? 0 }));

  const byPriority = REQUEST_PRIORITY_ORDER.filter((key) =>
    priorityCount.has(key)
  ).map((key) => ({ key, count: priorityCount.get(key) ?? 0 }));

  const topSuppliers: RequestSupplierTotal[] = [...supplierCount.entries()]
    .map(([supplier, count]) => ({ supplier, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    requests,
    events: (eventsRes.data ?? []) as PurchaseRequestEvent[],
    totals,
    byStatus,
    byPriority,
    topSuppliers,
    products: productsRes.data ?? [],
    suppliers: suppliersRes.data ?? [],
  };
}
