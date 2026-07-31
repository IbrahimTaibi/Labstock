import { createClient } from "./supabase/server";
import type {
  InvoiceDocument,
  InvoiceRow,
  InvoicesWorkspaceData,
} from "./types";

/**
 * Facture unique avec son fournisseur et ses lignes, pour l'impression.
 * Le RLS cadre la lecture au laboratoire : une facture appartenant à un
 * autre laboratoire est simplement introuvable.
 */
export async function getInvoiceDocument(
  id: number
): Promise<InvoiceDocument | null> {
  const supabase = await createClient();

  const [invoiceRes, linesRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "number, amount, status, issue_date, due_date, payment_date, suppliers(name, contact_name, email, phone, address)"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("id, description, quantity, unit_price")
      .eq("invoice_id", id)
      .order("id"),
  ]);

  if (invoiceRes.error)
    throw new Error(`Chargement de la facture : ${invoiceRes.error.message}`);
  if (linesRes.error)
    throw new Error(`Chargement des lignes : ${linesRes.error.message}`);
  if (!invoiceRes.data) return null;

  const row = invoiceRes.data;
  type SupplierJoin = InvoiceDocument["supplier"];
  const joined = row.suppliers as SupplierJoin | SupplierJoin[] | null;
  const supplier = (Array.isArray(joined) ? joined[0] : joined) ?? {
    name: "—",
    contact_name: null,
    email: null,
    phone: null,
    address: null,
  };

  return {
    number: row.number,
    amount: Number(row.amount),
    status: row.status,
    issue_date: row.issue_date,
    due_date: row.due_date,
    payment_date: row.payment_date,
    supplier,
    lines: (linesRes.data ?? []).map((line) => ({
      ...line,
      unit_price: Number(line.unit_price),
    })),
  };
}

/**
 * Toutes les factures du laboratoire avec leur fournisseur, plus les totaux
 * par statut. Le volume reste raisonnable (quelques milliers de lignes) :
 * le filtrage et la pagination se font côté client, instantanément.
 */
export async function getInvoicesWorkspace(): Promise<InvoicesWorkspaceData> {
  const supabase = await createClient();

  const [invoicesRes, suppliersRes, productsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select(
        "id, number, supplier_id, amount, status, issue_date, due_date, payment_date, suppliers(name)"
      )
      .order("issue_date", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("products")
      .select("id, name, supplier_id, unit_price")
      .order("name"),
  ]);

  if (invoicesRes.error)
    throw new Error(`Chargement des factures : ${invoicesRes.error.message}`);
  if (suppliersRes.error)
    throw new Error(
      `Chargement des fournisseurs : ${suppliersRes.error.message}`
    );
  if (productsRes.error)
    throw new Error(`Chargement des produits : ${productsRes.error.message}`);

  const today = new Date().toISOString().slice(0, 10);
  const daysBetween = (from: string, to: string) =>
    Math.round(
      (new Date(to).getTime() - new Date(from).getTime()) / 86_400_000
    );

  type SupplierJoin = { name: string } | { name: string }[] | null;
  const supplierName = (value: SupplierJoin) =>
    (Array.isArray(value) ? value[0]?.name : value?.name) ?? "—";

  const invoices: InvoiceRow[] = (invoicesRes.data ?? []).map((f) => ({
    id: f.id,
    number: f.number,
    supplier_id: f.supplier_id,
    supplier: supplierName(f.suppliers as SupplierJoin),
    amount: Number(f.amount),
    status: f.status,
    issue_date: f.issue_date,
    due_date: f.due_date,
    payment_date: f.payment_date,
    days_late:
      f.status !== "paid" && f.due_date < today
        ? daysBetween(f.due_date, today)
        : 0,
  }));

  const totals = {
    invoiced: 0,
    paid_count: 0,
    paid_amount: 0,
    pending_count: 0,
    pending_amount: 0,
    overdue_count: 0,
    overdue_amount: 0,
  };
  for (const f of invoices) {
    totals.invoiced += f.amount;
    if (f.status === "paid") {
      totals.paid_count += 1;
      totals.paid_amount += f.amount;
    } else if (f.status === "pending") {
      totals.pending_count += 1;
      totals.pending_amount += f.amount;
    } else {
      totals.overdue_count += 1;
      totals.overdue_amount += f.amount;
    }
  }

  return {
    invoices,
    suppliers: suppliersRes.data ?? [],
    products: (productsRes.data ?? []).map((p) => ({
      ...p,
      unit_price: Number(p.unit_price),
    })),
    totals,
  };
}
