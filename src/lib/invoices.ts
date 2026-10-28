import { createClient } from "./supabase/server";
import { nextArticleReference } from "./utils";
import type {
  InvoiceDocument,
  InvoiceEntryData,
  InvoiceEntryDraft,
  InvoiceRow,
  InvoicesWorkspaceData,
} from "./types";

export const INVOICE_BUCKET = "supplier-invoices";

/**
 * Référentiel de l'écran de saisie (fournisseurs, articles, commandes) et,
 * le cas échéant, le brouillon à reprendre.
 */
export async function getInvoiceEntryData(
  draftId: number | null
): Promise<InvoiceEntryData> {
  const supabase = await createClient();

  const [suppliersRes, productsRes, ordersRes] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("products")
      .select(
        "id, reference, manufacturer_ref, name, supplier_id, category_id, unit_price, vat_rate"
      )
      .order("reference"),
    supabase
      .from("purchase_orders")
      .select("id, number, supplier_id, ordered_at")
      .order("ordered_at", { ascending: false }),
  ]);

  if (suppliersRes.error)
    throw new Error(`Chargement des fournisseurs : ${suppliersRes.error.message}`);
  if (productsRes.error)
    throw new Error(`Chargement des articles : ${productsRes.error.message}`);
  if (ordersRes.error)
    throw new Error(`Chargement des commandes : ${ordersRes.error.message}`);

  const products = (productsRes.data ?? []).map((p) => ({
    ...p,
    unit_price: Number(p.unit_price),
    vat_rate: Number(p.vat_rate ?? 0),
  }));

  let draft: InvoiceEntryDraft | null = null;
  if (draftId !== null) {
    const { data, error } = await supabase
      .from("invoices")
      .select(
        "id, number, supplier_id, supplier_number, issue_date, order_id, payment_terms_days, stamp_duty, ocr_confidence, document_path, document_name, document_size, invoice_lines(product_id, manufacturer_ref, description, quantity, unit_price, discount_pct, vat_rate, match_status, id)"
      )
      .eq("id", draftId)
      .eq("status", "draft")
      .maybeSingle();
    if (error) throw new Error(`Chargement du brouillon : ${error.message}`);

    if (data) {
      let documentUrl: string | null = null;
      if (data.document_path) {
        const signed = await supabase.storage
          .from(INVOICE_BUCKET)
          .createSignedUrl(data.document_path, 3600);
        documentUrl = signed.data?.signedUrl ?? null;
      }
      type LineJoin = InvoiceEntryDraft["lines"][number] & { id: number };
      const lines = ((data.invoice_lines ?? []) as LineJoin[])
        .slice()
        .sort((a, b) => a.id - b.id);

      draft = {
        id: data.id,
        number: data.number,
        supplier_id: data.supplier_id,
        supplier_number: data.supplier_number,
        issue_date: data.issue_date,
        order_id: data.order_id,
        payment_terms_days: data.payment_terms_days,
        stamp_duty: Number(data.stamp_duty),
        ocr_confidence:
          data.ocr_confidence === null ? null : Number(data.ocr_confidence),
        document_name: data.document_name,
        document_size: data.document_size,
        document_url: documentUrl,
        document_type: data.document_name?.toLowerCase().endsWith(".pdf")
          ? "application/pdf"
          : data.document_name
            ? "image/*"
            : null,
        lines: lines.map((l) => ({
          product_id: l.product_id,
          manufacturer_ref: l.manufacturer_ref,
          description: l.description,
          quantity: l.quantity,
          unit_price: Number(l.unit_price),
          discount_pct: Number(l.discount_pct),
          vat_rate: Number(l.vat_rate),
          match_status: l.match_status,
        })),
      };
    }
  }

  return {
    suppliers: suppliersRes.data ?? [],
    products,
    orders: ordersRes.data ?? [],
    draft,
    next_reference: nextArticleReference(products.map((p) => p.reference)),
  };
}

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

  /* PostgREST plafonne une réponse à 1 000 lignes : sans pagination, les
     totaux de l'écran ne porteraient que sur une partie des factures et
     seraient donc faux. */
  const PAGE = 1000;
  const invoiceRows: NonNullable<
    Awaited<ReturnType<typeof fetchInvoicePage>>["data"]
  > = [];

  function fetchInvoicePage(from: number) {
    return supabase
      .from("invoices")
      .select(
        "id, number, supplier_id, amount, status, issue_date, due_date, payment_date, suppliers(name)"
      )
      /* Les brouillons ne sont pas encore des factures : liste à part. */
      .neq("status", "draft")
      .order("issue_date", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
  }

  for (let offset = 0; ; offset += PAGE) {
    const page = await fetchInvoicePage(offset);
    if (page.error)
      throw new Error(`Chargement des factures : ${page.error.message}`);
    invoiceRows.push(...(page.data ?? []));
    if ((page.data?.length ?? 0) < PAGE) break;
  }

  const [suppliersRes, productsRes, draftsRes] = await Promise.all([
    supabase.from("suppliers").select("id, name").order("name"),
    supabase
      .from("products")
      .select("id, name, supplier_id, unit_price")
      .order("name"),
    supabase
      .from("invoices")
      .select("id, number, supplier_number, issue_date, suppliers(name), invoice_lines(count)")
      .eq("status", "draft")
      .order("id", { ascending: false }),
  ]);
  if (draftsRes.error)
    throw new Error(`Chargement des brouillons : ${draftsRes.error.message}`);

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

  const invoices: InvoiceRow[] = invoiceRows.map((f) => ({
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
    drafts: (draftsRes.data ?? []).map((d) => {
      const count = d.invoice_lines as { count: number }[] | null;
      return {
        id: d.id,
        number: d.number,
        supplier: supplierName(d.suppliers as SupplierJoin),
        supplier_number: d.supplier_number,
        issue_date: d.issue_date,
        lines: count?.[0]?.count ?? 0,
      };
    }),
    suppliers: suppliersRes.data ?? [],
    products: (productsRes.data ?? []).map((p) => ({
      ...p,
      unit_price: Number(p.unit_price),
    })),
    totals,
  };
}
