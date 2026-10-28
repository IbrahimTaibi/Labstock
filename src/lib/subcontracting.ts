import { createClient } from "./supabase/server";
import type { SubcontractorInvoice, SubcontractorInvoiceData } from "./types";

/**
 * Référentiel de l'écran « Facture sous-traitant » (sous-traitants,
 * factures pour la recherche) et, le cas échéant, la facture ouverte.
 */
export async function getSubcontractorInvoiceData(
  invoiceId: number | null
): Promise<SubcontractorInvoiceData> {
  const supabase = await createClient();

  const [subcontractorsRes, invoicesRes, totalsRes, numberRes] = await Promise.all([
    supabase.from("subcontractors").select("id, name").order("name"),
    supabase
      .from("subcontractor_invoices")
      .select("id, number, description, issue_date, subcontractors(name)")
      .order("issue_date", { ascending: false })
      .order("id", { ascending: false }),
    supabase.from("subcontractor_invoice_totals_view").select("invoice_id, total_ttc"),
    supabase.rpc("next_subcontractor_invoice_number"),
  ]);

  if (subcontractorsRes.error)
    throw new Error(`Chargement des sous-traitants : ${subcontractorsRes.error.message}`);
  if (invoicesRes.error)
    throw new Error(`Chargement des factures : ${invoicesRes.error.message}`);
  if (totalsRes.error) throw new Error(`Chargement des totaux : ${totalsRes.error.message}`);
  if (numberRes.error) throw new Error(`Numérotation : ${numberRes.error.message}`);

  const ttc = new Map(
    (totalsRes.data ?? []).map((t) => [t.invoice_id as number, Number(t.total_ttc)])
  );

  const invoices = (invoicesRes.data ?? []).map((i) => {
    const sub = i.subcontractors as { name: string } | { name: string }[] | null;
    return {
      id: i.id,
      number: i.number,
      subcontractor: (Array.isArray(sub) ? sub[0]?.name : sub?.name) ?? "—",
      description: i.description,
      issue_date: i.issue_date,
      total_ttc: ttc.get(i.id) ?? 0,
    };
  });

  let invoice: SubcontractorInvoice | null = null;
  if (invoiceId !== null) {
    const [invoiceRes, debtRes] = await Promise.all([
      supabase
        .from("subcontractor_invoices")
        .select(
          "id, number, subcontractor_number, subcontractor_id, issue_date, entry_date, description, default_vat_rate, stamp_duty, subcontractor_invoice_lines(id, kind, designation, quantity, unit_price, discount_pct, vat_rate)"
        )
        .eq("id", invoiceId)
        .maybeSingle(),
      supabase
        .from("supplier_debts_view")
        .select("amount_paid")
        .eq("source", "subcontractor")
        .eq("invoice_id", invoiceId)
        .maybeSingle(),
    ]);
    if (invoiceRes.error) throw new Error(`Chargement de la facture : ${invoiceRes.error.message}`);
    if (debtRes.error) throw new Error(`Chargement des règlements : ${debtRes.error.message}`);

    const data = invoiceRes.data;
    if (data) {
      invoice = {
        id: data.id,
        number: data.number,
        subcontractor_number: data.subcontractor_number,
        subcontractor_id: data.subcontractor_id,
        issue_date: data.issue_date,
        entry_date: data.entry_date,
        description: data.description,
        default_vat_rate: Number(data.default_vat_rate),
        stamp_duty: Number(data.stamp_duty),
        amount_paid: Number(debtRes.data?.amount_paid ?? 0),
        lines: [...(data.subcontractor_invoice_lines ?? [])]
          .sort((a, b) => a.id - b.id)
          .map((l) => ({
            kind: l.kind === "frais" ? "frais" : "prestation",
            designation: l.designation,
            quantity: l.quantity,
            unit_price: Number(l.unit_price),
            discount_pct: Number(l.discount_pct),
            vat_rate: Number(l.vat_rate),
          })),
      };
    }
  }

  return {
    subcontractors: subcontractorsRes.data ?? [],
    invoices,
    invoice,
    next_number: String(numberRes.data ?? ""),
  };
}
