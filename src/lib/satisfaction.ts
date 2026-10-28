import { getCurrentUser } from "./auth";
import { createClient } from "./supabase/server";
import type { DeliveryEvaluation, EvaluableOrder, SatisfactionData } from "./types";

function addDays(iso: string, days: number) {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Écran « Évaluation de la satisfaction des fournisseurs » : les B.C. passés
 * au fournisseur (validés ou envoyés) et leurs évaluations de livraison.
 * Un brouillon ou un B.C. annulé n'a pas de livraison à juger.
 */
export async function getSatisfactionData(): Promise<SatisfactionData> {
  const supabase = await createClient();

  const [ordersRes, receiptsRes, evaluationsRes, user] = await Promise.all([
    supabase
      .from("purchase_orders_view")
      .select("id, number, supplier_id, supplier, order_date, delivery_days")
      .in("lifecycle", ["approved", "sent"])
      .order("order_date", { ascending: false })
      .order("id", { ascending: false }),
    supabase
      .from("goods_receipts")
      .select("order_id, received_at")
      .is("reversed_at", null),
    supabase
      .from("delivery_evaluations")
      .select(
        "id, order_id, expected_date, delivered_date, delay_days, conforming, quality, remark, delay_cause, rating, auto_score, comment, evaluated_by"
      )
      .order("delivered_date", { ascending: false })
      .order("id", { ascending: false }),
    getCurrentUser(),
  ]);

  if (ordersRes.error) throw new Error(`Chargement des commandes : ${ordersRes.error.message}`);
  if (receiptsRes.error) throw new Error(`Chargement des réceptions : ${receiptsRes.error.message}`);
  if (evaluationsRes.error)
    throw new Error(`Chargement des évaluations : ${evaluationsRes.error.message}`);

  /* Date réelle = la dernière réception : une commande livrée en deux fois
     n'est livrée qu'à la seconde. */
  const delivered = new Map<number, string>();
  for (const receipt of receiptsRes.data ?? []) {
    const day = String(receipt.received_at).slice(0, 10);
    const previous = delivered.get(receipt.order_id);
    if (!previous || day > previous) delivered.set(receipt.order_id, day);
  }

  const evaluationByOrder = new Map(
    (evaluationsRes.data ?? []).map((e) => [e.order_id as number, e.id as number])
  );

  const orders: EvaluableOrder[] = (ordersRes.data ?? []).map((o) => ({
    id: o.id,
    number: o.number,
    supplier_id: o.supplier_id,
    supplier: o.supplier ?? "—",
    order_date: o.order_date,
    expected_date: o.delivery_days === null ? null : addDays(o.order_date, o.delivery_days),
    delivered_date: delivered.get(o.id) ?? null,
    evaluation_id: evaluationByOrder.get(o.id) ?? null,
  }));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const evaluations: DeliveryEvaluation[] = (evaluationsRes.data ?? []).flatMap((e) => {
    /* Une évaluation dont le B.C. a depuis été annulé sort de l'écran avec
       lui : ses indicateurs ne portent que sur des commandes vivantes. */
    const order = orderById.get(e.order_id);
    if (!order) return [];
    return [
      {
        ...e,
        order_number: order.number,
        supplier_id: order.supplier_id,
        supplier: order.supplier,
        order_date: order.order_date,
        rating: Number(e.rating),
        auto_score: Number(e.auto_score),
        delay_days: Number(e.delay_days),
      },
    ];
  });

  return { orders, evaluations, operator: user?.fullName ?? "" };
}
