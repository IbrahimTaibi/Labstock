import { createClient } from "./supabase/server";
import type {
  OrderLine,
  OrderTotals,
  PurchaseOrderDocument,
  PurchaseOrderOption,
  ReceiptHistoryEntry,
  ReceiptsWorkspaceData,
} from "./types";

/* Colonnes de l'historique, partagées par l'encart latéral et la page
   « tout l'historique » : les deux doivent décrire une réception de la
   même façon, y compris son éventuelle annulation. */
const HISTORY_SELECT =
  "id, quantity, unit_price, receipt_id, lot_id, " +
  "goods_receipts(received_at, operator, reversed_at, reversed_by, reversal_reason, purchase_orders(number)), " +
  "lots(lot_number), products(reference, name)";

type HistoryRow = {
  id: number;
  quantity: number;
  unit_price: number;
  receipt_id: number;
  lot_id: number | null;
  goods_receipts:
    | {
        received_at: string;
        operator: string;
        reversed_at: string | null;
        reversed_by: string | null;
        reversal_reason: string | null;
        purchase_orders: { number: string } | { number: string }[] | null;
      }
    | {
        received_at: string;
        operator: string;
        reversed_at: string | null;
        reversed_by: string | null;
        reversal_reason: string | null;
        purchase_orders: { number: string } | { number: string }[] | null;
      }[]
    | null;
  lots: { lot_number: string } | { lot_number: string }[] | null;
  products:
    | { reference: string | null; name: string }
    | { reference: string | null; name: string }[]
    | null;
};

const one = <T,>(value: T | T[] | null): T | null =>
  Array.isArray(value) ? (value[0] ?? null) : value;

function toHistoryEntry(row: HistoryRow): ReceiptHistoryEntry {
  const receipt = one(row.goods_receipts);
  const product = one(row.products);
  return {
    id: row.id,
    receipt_id: row.receipt_id,
    received_at: receipt?.received_at ?? "",
    operator: receipt?.operator ?? "—",
    quantity: row.quantity,
    unit_price: Number(row.unit_price),
    reference: product?.reference ?? "—",
    product_name: product?.name ?? "—",
    lot_number: one(row.lots)?.lot_number ?? null,
    lot_id: row.lot_id,
    order_number: one(receipt?.purchase_orders ?? null)?.number ?? "—",
    reversed_at: receipt?.reversed_at ?? null,
    reversed_by: receipt?.reversed_by ?? null,
    reversal_reason: receipt?.reversal_reason ?? null,
  };
}

/**
 * Bon de commande d'origine, pour consultation et impression (§3).
 * Il n'y a pas de PDF fournisseur stocké : le document est reconstitué
 * depuis la commande enregistrée, qui en est la source de vérité.
 */
export async function getOrderDocument(
  id: number
): Promise<PurchaseOrderDocument | null> {
  const supabase = await createClient();

  const [orderRes, linesRes] = await Promise.all([
    supabase
      .from("purchase_orders")
      .select(
        "id, number, ordered_at, status, suppliers(name, contact_name, email, phone, address)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("purchase_order_lines_view")
      .select(
        "id, reference, product_name, packaging, quantity_ordered, quantity_received, unit_price"
      )
      .eq("order_id", id)
      .order("id"),
  ]);

  if (orderRes.error)
    throw new Error(`Chargement de la commande : ${orderRes.error.message}`);
  if (linesRes.error)
    throw new Error(`Chargement des lignes : ${linesRes.error.message}`);
  if (!orderRes.data) return null;

  const row = orderRes.data;
  type SupplierJoin = PurchaseOrderDocument["supplier"];
  const joined = row.suppliers as SupplierJoin | SupplierJoin[] | null;

  return {
    id: row.id,
    number: row.number,
    ordered_at: row.ordered_at,
    status: row.status as PurchaseOrderDocument["status"],
    supplier: (Array.isArray(joined) ? joined[0] : joined) ?? {
      name: "—",
      contact_name: null,
      email: null,
      phone: null,
      address: null,
    },
    lines: (linesRes.data ?? []).map((line) => ({
      ...line,
      unit_price: Number(line.unit_price),
    })),
  };
}

/** Historique des réceptions, toutes commandes confondues (cadré au labo par le RLS). */
export async function getReceiptHistory(
  limit?: number
): Promise<ReceiptHistoryEntry[]> {
  const supabase = await createClient();
  const query = supabase
    .from("goods_receipt_lines")
    .select(HISTORY_SELECT)
    .order("id", { ascending: false });

  const { data, error } = limit ? await query.limit(limit) : await query;
  if (error) throw new Error(`Chargement de l'historique : ${error.message}`);

  return ((data ?? []) as unknown as HistoryRow[]).map(toHistoryEntry);
}

export async function getReceiptsWorkspace(
  orderNumber?: string
): Promise<ReceiptsWorkspaceData> {
  const supabase = await createClient();

  /* Seules les commandes engagées auprès du fournisseur se réceptionnent :
     un panier en préparation n'a encore rien commandé, et une commande
     annulée ne livrera rien. La base refuse de toute façon ces réceptions ;
     on évite simplement de les proposer. */
  const { data: orderRows, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, number, ordered_at, status, suppliers(name)")
    .in("lifecycle", ["approved", "sent"])
    .order("ordered_at", { ascending: false });

  if (orderError) {
    throw new Error(`Chargement des commandes : ${orderError.message}`);
  }

  type OrderRow = {
    id: number;
    number: string;
    ordered_at: string;
    status: PurchaseOrderOption["status"];
    suppliers: { name: string } | { name: string }[] | null;
  };

  const orders: PurchaseOrderOption[] = ((orderRows ?? []) as OrderRow[]).map(
    (row) => ({
      id: row.id,
      number: row.number,
      ordered_at: row.ordered_at,
      status: row.status,
      supplier:
        (Array.isArray(row.suppliers) ? row.suppliers[0]?.name : row.suppliers?.name) ??
        "—",
    })
  );

  const selectedOrder =
    orders.find((order) => order.number === orderNumber) ?? orders[0] ?? null;

  if (!selectedOrder) {
    return {
      orders,
      selectedOrder: null,
      lines: [],
      history: [],
      totals: {
        receivedValue: 0,
        unitsReceived: 0,
        lotsCreated: 0,
        receiptCount: 0,
        lastReceiptAt: null,
      },
    };
  }

  const [lines, history, totals] = await Promise.all([
    supabase
      .from("purchase_order_lines_view")
      .select("*")
      .eq("order_id", selectedOrder.id)
      .order("id"),
    getReceiptHistory(6),
    summarizeOrderReceipts(selectedOrder.id),
  ]);

  if (lines.error) throw new Error(`Chargement des lignes : ${lines.error.message}`);

  const orderLines = (lines.data ?? []) as OrderLine[];
  const productIds = [...new Set(orderLines.map((line) => line.product_id))];
  const today = new Date();
  const todayDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  const { data: lots, error: lotsError } = productIds.length
    ? await supabase
        .from("lots")
        .select("product_id, lot_number, expiry_date, current_qty, id")
        .in("product_id", productIds)
        .gt("current_qty", 0)
        .gte("expiry_date", todayDate)
        .order("expiry_date")
        .order("id")
    : { data: [], error: null };

  if (lotsError) throw new Error(`Chargement des lots FEFO : ${lotsError.message}`);

  const fefoByProduct = new Map<
    number,
    { lot_number: string; expiry_date: string }[]
  >();
  for (const lot of lots ?? []) {
    const productLots = fefoByProduct.get(lot.product_id) ?? [];
    productLots.push({ lot_number: lot.lot_number, expiry_date: lot.expiry_date });
    fefoByProduct.set(lot.product_id, productLots);
  }

  return {
    orders,
    selectedOrder,
    lines: orderLines.map((line) => ({
      ...line,
      unit_price: Number(line.unit_price),
      fefoLots: fefoByProduct.get(line.product_id) ?? [],
    })),
    history,
    totals,
  };
}

/**
 * Cumuls réellement réceptionnés sur un bon de commande. Les réceptions
 * contre-passées sont exclues : afficher une valeur qu'on a annulée
 * donnerait un cumul qui ne correspond à rien en stock.
 */
async function summarizeOrderReceipts(orderId: number): Promise<OrderTotals> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("goods_receipt_lines")
    .select(
      "quantity, unit_price, lot_id, receipt_id, goods_receipts!inner(order_id, received_at, reversed_at)"
    )
    .eq("goods_receipts.order_id", orderId)
    .is("goods_receipts.reversed_at", null);

  if (error) throw new Error(`Chargement des cumuls : ${error.message}`);

  type Row = {
    quantity: number;
    unit_price: number;
    lot_id: number | null;
    receipt_id: number;
    goods_receipts:
      | { received_at: string }
      | { received_at: string }[]
      | null;
  };

  const rows = (data ?? []) as unknown as Row[];
  const lots = new Set<number>();
  const receipts = new Set<number>();
  let receivedValue = 0;
  let unitsReceived = 0;
  let lastReceiptAt: string | null = null;

  for (const row of rows) {
    receivedValue += row.quantity * Number(row.unit_price);
    unitsReceived += row.quantity;
    receipts.add(row.receipt_id);
    if (row.lot_id !== null) lots.add(row.lot_id);

    const receivedAt = one(row.goods_receipts)?.received_at ?? null;
    if (receivedAt && (!lastReceiptAt || receivedAt > lastReceiptAt)) {
      lastReceiptAt = receivedAt;
    }
  }

  return {
    receivedValue,
    unitsReceived,
    /* Lots distincts alimentés par ce BC — un même lot fournisseur livré en
       deux fois ne compte qu'une fois. */
    lotsCreated: lots.size,
    receiptCount: receipts.size,
    lastReceiptAt,
  };
}

export function summarizeOrder(lines: OrderLine[]) {
  return {
    ordered: lines.length,
    fullyReceived: lines.filter((line) => line.delivery_status === "received").length,
    outstanding: lines.filter((line) => line.delivery_status !== "received").length,
    unitsRemaining: lines.reduce((sum, line) => sum + line.quantity_remaining, 0),
  };
}
