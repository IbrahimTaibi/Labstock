import { createClient } from "./supabase/server";
import type {
  OrderLine,
  PurchaseOrderOption,
  ReceiptHistoryEntry,
  ReceiptsWorkspaceData,
} from "./types";

export async function getReceiptsWorkspace(
  orderNumber?: string
): Promise<ReceiptsWorkspaceData> {
  const supabase = await createClient();

  const { data: orderRows, error: orderError } = await supabase
    .from("purchase_orders")
    .select("id, number, ordered_at, status, suppliers(name)")
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
    return { orders, selectedOrder: null, lines: [], history: [] };
  }

  const [lines, history] = await Promise.all([
    supabase
      .from("purchase_order_lines_view")
      .select("*")
      .eq("order_id", selectedOrder.id)
      .order("id"),
    supabase
      .from("goods_receipt_lines")
      .select(
        "id, quantity, goods_receipts(received_at, operator), lots(lot_number), products(reference)"
      )
      .order("id", { ascending: false })
      .limit(6),
  ]);

  if (lines.error) throw new Error(`Chargement des lignes : ${lines.error.message}`);
  if (history.error) {
    throw new Error(`Chargement de l'historique : ${history.error.message}`);
  }

  const one = <T>(value: T | T[] | null): T | null =>
    Array.isArray(value) ? (value[0] ?? null) : value;

  type HistoryRow = {
    id: number;
    quantity: number;
    goods_receipts: { received_at: string; operator: string } | { received_at: string; operator: string }[] | null;
    lots: { lot_number: string } | { lot_number: string }[] | null;
    products: { reference: string | null } | { reference: string | null }[] | null;
  };

  const historyEntries: ReceiptHistoryEntry[] = (
    (history.data ?? []) as HistoryRow[]
  ).map((row) => {
    const receipt = one(row.goods_receipts);
    return {
      id: row.id,
      quantity: row.quantity,
      received_at: receipt?.received_at ?? "",
      operator: receipt?.operator ?? "—",
      lot_number: one(row.lots)?.lot_number ?? null,
      reference: one(row.products)?.reference ?? "—",
    };
  });

  return {
    orders,
    selectedOrder,
    lines: ((lines.data ?? []) as OrderLine[]).map((line) => ({
      ...line,
      unit_price: Number(line.unit_price),
    })),
    history: historyEntries,
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
