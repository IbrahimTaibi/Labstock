import { createClient } from "./supabase/server";
import type {
  AvailableRequest,
  OrderCartLine,
  OrdersWorkspaceData,
  PurchaseOrderRow,
} from "./types";

function toOrder(row: Record<string, unknown>): PurchaseOrderRow {
  return {
    ...(row as unknown as PurchaseOrderRow),
    total_ht: Number(row.total_ht),
    total_vat: Number(row.total_vat),
    total_ttc: Number(row.total_ttc),
  };
}

/**
 * Écran Bon de commande. `orderId` désigne le B.C. ouvert — un panier en
 * préparation, ou une commande passée consultée en lecture.
 *
 * Le panier vit en base dès sa création (§9 « Enregistrer… modifiable
 * ultérieurement ») : rien n'est perdu en quittant la page, et les totaux
 * sont ceux que la base calcule, pas une seconde arithmétique côté écran.
 */
export async function getOrdersWorkspace(
  orderId?: number
): Promise<OrdersWorkspaceData> {
  const supabase = await createClient();

  const [recentRes, suppliersRes, productsRes, requestsRes, engagedRes] =
    await Promise.all([
      supabase
        .from("purchase_orders_view")
        .select("*")
        .order("id", { ascending: false })
        .limit(50),
      supabase.from("suppliers").select("id, name").order("name"),
      supabase
        .from("products")
        .select("id, name, reference, supplier_id, unit_price")
        .order("name"),
      supabase
        .from("purchase_requests_view")
        .select(
          "id, number, requested_at, product_id, reference, designation, supplier_id, quantity_requested, quantity_approved, requester"
        )
        .eq("status", "approved")
        .not("product_id", "is", null)
        .not("supplier_id", "is", null)
        .order("requested_at", { ascending: true }),
      /* D.A. déjà engagées dans un B.C. vivant (§5, §10.6). Une ligne d'un
         B.C. annulé ne compte plus : la demande est de nouveau libre. */
      supabase
        .from("purchase_order_lines")
        .select("request_id, purchase_orders!inner(lifecycle)")
        .not("request_id", "is", null)
        .neq("purchase_orders.lifecycle", "cancelled"),
    ]);

  if (recentRes.error)
    throw new Error(`Chargement des commandes : ${recentRes.error.message}`);
  if (suppliersRes.error)
    throw new Error(
      `Chargement des fournisseurs : ${suppliersRes.error.message}`
    );
  if (productsRes.error)
    throw new Error(`Chargement des produits : ${productsRes.error.message}`);
  if (requestsRes.error)
    throw new Error(`Chargement des demandes : ${requestsRes.error.message}`);
  if (engagedRes.error)
    throw new Error(`Chargement des engagements : ${engagedRes.error.message}`);

  const engaged = new Set(
    (engagedRes.data ?? []).map((row) => row.request_id as number)
  );

  const available: AvailableRequest[] = (requestsRes.data ?? [])
    .filter((row) => !engaged.has(row.id))
    .map((row) => ({
      id: row.id,
      number: row.number,
      requested_at: row.requested_at,
      product_id: row.product_id as number,
      reference: row.reference,
      designation: row.designation,
      supplier_id: row.supplier_id as number,
      /* §5.2 — la quantité validée, reprise telle quelle. */
      quantity: row.quantity_approved ?? row.quantity_requested,
      requester: row.requester,
    }));

  const recent = (recentRes.data ?? []).map(toOrder);

  let current: PurchaseOrderRow | null = null;
  let lines: OrderCartLine[] = [];

  if (orderId !== undefined && Number.isInteger(orderId)) {
    const [orderRes, linesRes] = await Promise.all([
      supabase
        .from("purchase_orders_view")
        .select("*")
        .eq("id", orderId)
        .maybeSingle(),
      supabase
        .from("purchase_order_cart_view")
        .select("*")
        .eq("order_id", orderId)
        .order("id"),
    ]);

    if (orderRes.error)
      throw new Error(`Chargement du B.C. : ${orderRes.error.message}`);
    if (linesRes.error)
      throw new Error(`Chargement des lignes : ${linesRes.error.message}`);

    current = orderRes.data ? toOrder(orderRes.data) : null;
    lines = (linesRes.data ?? []).map((row) => ({
      ...row,
      unit_price: Number(row.unit_price),
      vat_rate: Number(row.vat_rate),
      line_total_ht: Number(row.line_total_ht),
      line_vat: Number(row.line_vat),
    }));
  }

  return {
    current,
    lines,
    available,
    recent,
    suppliers: suppliersRes.data ?? [],
    products: (productsRes.data ?? []).map((product) => ({
      ...product,
      unit_price: Number(product.unit_price),
    })),
  };
}
