import { createClient } from "./supabase/server";
import type {
  SupplierEvaluation,
  SupplierInvoice,
  SupplierOrder,
  SupplierProduct,
  SupplierRow,
  SuppliersWorkspaceData,
} from "./types";

const RECENT_INVOICES_PER_SUPPLIER = 20;

/**
 * Fournisseurs du laboratoire avec leur fiche, leurs produits, commandes et
 * factures. Les agrégats sont calculés ici sur l'ensemble des factures ; seul
 * un extrait récent part au client pour l'affichage.
 */
export async function getSuppliersWorkspace(): Promise<SuppliersWorkspaceData> {
  const supabase = await createClient();

  /* PostgREST plafonne une réponse à 1 000 lignes : les encours par
     fournisseur porteraient sinon sur une partie seulement des factures. */
  const PAGE = 1000;
  const invoiceRows: {
    id: number;
    supplier_id: number;
    number: string;
    amount: number;
    status: SupplierInvoice["status"];
    issue_date: string;
    due_date: string;
    payment_date: string | null;
  }[] = [];

  for (let offset = 0; ; offset += PAGE) {
    const page = await supabase
      .from("invoices")
      .select(
        "id, supplier_id, number, amount, status, issue_date, due_date, payment_date"
      )
      .neq("status", "draft")
      .order("issue_date", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (page.error)
      throw new Error(`Chargement des factures : ${page.error.message}`);
    invoiceRows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE) break;
  }

  const [suppliersRes, productsRes, ordersRes, orderLinesRes, receiptsRes, evaluationsRes] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select(
          "id, code, name, contact_name, email, phone, mobile, address, postal_code, tax_id, category, payment_terms_days, currency, active, created_on, notes"
        )
        .order("code"),
      supabase
        .from("products")
        .select(
          "id, supplier_id, name, reference, stock_qty, min_stock, unit_price, categories(name)"
        )
        .order("name"),
      supabase
        .from("purchase_orders")
        .select("id, supplier_id, number, ordered_at, order_date, delivery_days, status, lifecycle")
        .order("ordered_at", { ascending: false }),
      supabase
        .from("purchase_order_lines")
        .select("order_id, quantity_ordered, unit_price"),
      supabase
        .from("goods_receipts")
        .select("id, order_id, received_at, reversed_at")
        .order("received_at", { ascending: false }),
      supabase
        .from("supplier_evaluations")
        .select("id, supplier_id, period, quality, delays, documents, service, pricing, comment")
        .order("period", { ascending: false }),
    ]);

  for (const res of [
    suppliersRes,
    productsRes,
    ordersRes,
    orderLinesRes,
    receiptsRes,
    evaluationsRes,
  ]) {
    if (res.error)
      throw new Error(`Chargement des fournisseurs : ${res.error.message}`);
  }

  type CategoryJoin = { name: string } | { name: string }[] | null;
  const categoryName = (value: CategoryJoin) =>
    (Array.isArray(value) ? value[0]?.name : value?.name) ?? "—";

  const products: SupplierProduct[] = (productsRes.data ?? []).map((p) => ({
    id: p.id,
    supplier_id: p.supplier_id,
    name: p.name,
    reference: p.reference,
    category: categoryName(p.categories as CategoryJoin),
    stock_qty: p.stock_qty,
    min_stock: p.min_stock,
    unit_price: Number(p.unit_price),
  }));

  const orderTotals = new Map<number, { lines: number; total: number }>();
  for (const line of orderLinesRes.data ?? []) {
    const entry = orderTotals.get(line.order_id) ?? { lines: 0, total: 0 };
    entry.lines += 1;
    entry.total += line.quantity_ordered * Number(line.unit_price);
    orderTotals.set(line.order_id, entry);
  }

  const addDays = (iso: string, days: number) => {
    const date = new Date(`${iso}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };

  const orders: SupplierOrder[] = (ordersRes.data ?? []).map((o) => ({
    id: o.id,
    supplier_id: o.supplier_id,
    number: o.number,
    ordered_at: o.ordered_at,
    status: o.status,
    lifecycle: o.lifecycle,
    expected_date:
      o.delivery_days === null
        ? null
        : addDays(o.order_date ?? o.ordered_at, o.delivery_days),
    lines: orderTotals.get(o.id)?.lines ?? 0,
    total: orderTotals.get(o.id)?.total ?? 0,
  }));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const receipts = (receiptsRes.data ?? []).flatMap((r) => {
    const order = orderById.get(r.order_id);
    if (!order) return [];
    return [
      {
        id: r.id,
        supplier_id: order.supplier_id,
        order_id: r.order_id,
        received_at: r.received_at,
        expected_date: order.expected_date,
        reversed: r.reversed_at !== null,
      },
    ];
  });

  const evaluations: SupplierEvaluation[] = (evaluationsRes.data ?? []).map((e) => {
    const criteria = [e.quality, e.delays, e.documents, e.service, e.pricing].map(Number);
    return {
      id: e.id,
      supplier_id: e.supplier_id,
      period: e.period,
      quality: criteria[0],
      delays: criteria[1],
      documents: criteria[2],
      service: criteria[3],
      pricing: criteria[4],
      score: criteria.reduce((sum, n) => sum + n, 0) / criteria.length,
      comment: e.comment,
    };
  });
  /* Évaluations triées du plus récent au plus ancien : la première vue est
     la dernière note. */
  const latestRating = new Map<number, number>();
  for (const e of evaluations) {
    if (!latestRating.has(e.supplier_id)) latestRating.set(e.supplier_id, e.score);
  }

  type Acc = {
    products: number;
    stock_value: number;
    open_orders: number;
    invoice_count: number;
    invoiced_total: number;
    pending_amount: number;
    overdue_count: number;
    overdue_amount: number;
    last_invoice_date: string | null;
  };
  const empty = (): Acc => ({
    products: 0,
    stock_value: 0,
    open_orders: 0,
    invoice_count: 0,
    invoiced_total: 0,
    pending_amount: 0,
    overdue_count: 0,
    overdue_amount: 0,
    last_invoice_date: null,
  });

  const acc = new Map<number, Acc>();
  const of = (supplierId: number) => {
    let entry = acc.get(supplierId);
    if (!entry) {
      entry = empty();
      acc.set(supplierId, entry);
    }
    return entry;
  };

  for (const p of products) {
    const entry = of(p.supplier_id);
    entry.products += 1;
    entry.stock_value += p.stock_qty * p.unit_price;
  }

  /* En cours : validée ou envoyée au fournisseur, pas entièrement reçue. */
  const isOpen = (o: SupplierOrder) =>
    o.status !== "received" && (o.lifecycle === "approved" || o.lifecycle === "sent");
  for (const o of orders) {
    if (isOpen(o)) of(o.supplier_id).open_orders += 1;
  }

  const monthStart = new Date().toISOString().slice(0, 8) + "01";
  let purchasesMonth = 0;

  const recentInvoices: SupplierInvoice[] = [];
  const recentCount = new Map<number, number>();

  for (const f of invoiceRows) {
    const entry = of(f.supplier_id);
    const amount = Number(f.amount);
    entry.invoice_count += 1;
    entry.invoiced_total += amount;
    if (f.issue_date >= monthStart) purchasesMonth += amount;
    if (f.status === "pending") entry.pending_amount += amount;
    if (f.status === "overdue") {
      entry.overdue_count += 1;
      entry.overdue_amount += amount;
    }
    if (!entry.last_invoice_date || f.issue_date > entry.last_invoice_date) {
      entry.last_invoice_date = f.issue_date;
    }

    const shown = recentCount.get(f.supplier_id) ?? 0;
    if (shown < RECENT_INVOICES_PER_SUPPLIER) {
      recentCount.set(f.supplier_id, shown + 1);
      recentInvoices.push({ ...f, amount });
    }
  }

  const grandTotal = [...acc.values()].reduce(
    (sum, entry) => sum + entry.invoiced_total,
    0
  );

  const suppliers: SupplierRow[] = (suppliersRes.data ?? []).map((s) => {
    const entry = acc.get(s.id) ?? empty();
    return {
      ...s,
      ...entry,
      share: grandTotal > 0 ? entry.invoiced_total / grandTotal : 0,
      rating: latestRating.get(s.id) ?? null,
    };
  });

  const ratings = suppliers.flatMap((s) => (s.rating === null ? [] : [s.rating]));

  return {
    suppliers,
    products,
    orders,
    invoices: recentInvoices,
    receipts,
    evaluations,
    totals: {
      purchases_month: purchasesMonth,
      open_orders: orders.filter(isOpen).length,
      average_rating:
        ratings.length > 0 ? ratings.reduce((sum, n) => sum + n, 0) / ratings.length : null,
      invoiced: grandTotal,
      pending: suppliers.reduce((sum, s) => sum + s.pending_amount, 0),
      overdue: suppliers.reduce((sum, s) => sum + s.overdue_amount, 0),
      overdue_count: suppliers.reduce((sum, s) => sum + s.overdue_count, 0),
    },
  };
}
