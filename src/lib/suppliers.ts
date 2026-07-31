import { createClient } from "./supabase/server";
import type {
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
      .order("issue_date", { ascending: false })
      .range(offset, offset + PAGE - 1);
    if (page.error)
      throw new Error(`Chargement des factures : ${page.error.message}`);
    invoiceRows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE) break;
  }

  const [suppliersRes, productsRes, ordersRes, orderLinesRes] =
    await Promise.all([
      supabase
        .from("suppliers")
        .select("id, name, contact_name, email, phone, address, notes")
        .order("name"),
      supabase
        .from("products")
        .select(
          "id, supplier_id, name, reference, stock_qty, min_stock, unit_price, categories(name)"
        )
        .order("name"),
      supabase
        .from("purchase_orders")
        .select("id, supplier_id, number, ordered_at, status")
        .order("ordered_at", { ascending: false }),
      supabase
        .from("purchase_order_lines")
        .select("order_id, quantity_ordered, unit_price"),
    ]);

  for (const res of [suppliersRes, productsRes, ordersRes, orderLinesRes]) {
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

  const orders: SupplierOrder[] = (ordersRes.data ?? []).map((o) => ({
    id: o.id,
    supplier_id: o.supplier_id,
    number: o.number,
    ordered_at: o.ordered_at,
    status: o.status,
    lines: orderTotals.get(o.id)?.lines ?? 0,
    total: orderTotals.get(o.id)?.total ?? 0,
  }));

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

  for (const o of orders) {
    if (o.status !== "received") of(o.supplier_id).open_orders += 1;
  }

  const recentInvoices: SupplierInvoice[] = [];
  const recentCount = new Map<number, number>();

  for (const f of invoiceRows) {
    const entry = of(f.supplier_id);
    const amount = Number(f.amount);
    entry.invoice_count += 1;
    entry.invoiced_total += amount;
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
    };
  });

  return {
    suppliers,
    products,
    orders,
    invoices: recentInvoices,
    totals: {
      invoiced: grandTotal,
      pending: suppliers.reduce((sum, s) => sum + s.pending_amount, 0),
      overdue: suppliers.reduce((sum, s) => sum + s.overdue_amount, 0),
      overdue_count: suppliers.reduce((sum, s) => sum + s.overdue_count, 0),
    },
  };
}
