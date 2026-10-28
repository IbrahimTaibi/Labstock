"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { SubcontractorInvoiceLine } from "@/lib/types";

function revalidateAll() {
  revalidatePath("/subcontracting");
  revalidatePath("/debts");
  revalidatePath("/");
}

/* -------------------------------------------------------- Sous-traitants */

export type CreateSubcontractorState =
  | { status: "success"; message: string; subcontractor: { id: number; name: string } }
  | { status: "error"; message: string };

export async function createSubcontractor(name: string): Promise<CreateSubcontractorState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const trimmed = name.trim();
  if (!trimmed) return { status: "error", message: "Le nom du sous-traitant est requis." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("subcontractors")
    .insert({ name: trimmed })
    .select("id, name")
    .single();

  if (error) {
    if (error.code === "23505")
      return { status: "error", message: `« ${trimmed} » existe déjà.` };
    return { status: "error", message: error.message };
  }

  revalidatePath("/subcontracting");
  return {
    status: "success",
    message: `Sous-traitant « ${data.name} » ajouté.`,
    subcontractor: data,
  };
}

/* ---------------------------------------------------------- Factures */

export type SubcontractorInvoiceInput = {
  invoice_id: number | null;
  header: {
    subcontractor_id: number;
    subcontractor_number: string;
    issue_date: string;
    description: string;
    default_vat_rate: number;
    stamp_duty: number;
  };
  lines: SubcontractorInvoiceLine[];
};

export type SaveSubcontractorInvoiceState =
  | { status: "success"; message: string; invoice_id: number; number: string }
  | { status: "error"; message: string };

export async function saveSubcontractorInvoice(
  input: SubcontractorInvoiceInput
): Promise<SaveSubcontractorInvoiceState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const { header, lines } = input;
  if (!Number.isInteger(header.subcontractor_id))
    return { status: "error", message: "Sélectionnez le laboratoire sous-traitant." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(header.issue_date))
    return { status: "error", message: "Date de facture invalide." };
  if (!header.description.trim())
    return { status: "error", message: "La description de la prestation est obligatoire." };
  if (!Number.isFinite(header.stamp_duty) || header.stamp_duty < 0)
    return { status: "error", message: "Timbre fiscal invalide." };
  if (lines.length === 0)
    return { status: "error", message: "Ajoutez au moins une ligne de prestation." };
  for (const line of lines) {
    if (!line.designation.trim())
      return { status: "error", message: "Chaque ligne doit avoir une désignation." };
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      return { status: "error", message: "Chaque ligne doit avoir une quantité entière positive." };
    if (!Number.isFinite(line.unit_price) || line.unit_price < 0)
      return { status: "error", message: "Chaque ligne doit avoir un prix unitaire valide." };
    if (!Number.isFinite(line.discount_pct) || line.discount_pct < 0 || line.discount_pct > 100)
      return { status: "error", message: "La remise doit être comprise entre 0 et 100 %." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("save_subcontractor_invoice", {
    p_invoice_id: input.invoice_id,
    p_header: { ...header, description: header.description.trim() },
    p_lines: lines.map((l) => ({ ...l, designation: l.designation.trim() })),
  });

  if (error) return { status: "error", message: error.message };

  revalidateAll();
  const result = data as { invoice_id: number; number: string; lines: number };
  return {
    status: "success",
    invoice_id: result.invoice_id,
    number: result.number,
    message:
      input.invoice_id === null
        ? `Facture ${result.number} enregistrée (${result.lines} ligne(s)).`
        : `Facture ${result.number} mise à jour.`,
  };
}

export type DeleteSubcontractorInvoiceState = {
  status: "success" | "error";
  message: string;
};

/* Supprimer la facture emporterait ses règlements en cascade, y compris les
   règlements annulés que l'on garde pour la traçabilité : l'historique des
   paiements disparaîtrait sans trace. Une facture qui en a un ne se
   supprime donc pas. */
export async function deleteSubcontractorInvoice(
  invoiceId: number
): Promise<DeleteSubcontractorInvoiceState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { count, error: countError } = await supabase
    .from("supplier_payments")
    .select("id", { count: "exact", head: true })
    .eq("subcontractor_invoice_id", invoiceId);
  if (countError) return { status: "error", message: countError.message };
  if ((count ?? 0) > 0)
    return {
      status: "error",
      message:
        "Cette facture a des règlements dans son historique : elle ne peut pas être supprimée.",
    };

  const { data, error } = await supabase
    .from("subcontractor_invoices")
    .delete()
    .eq("id", invoiceId)
    .select("number")
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data) return { status: "error", message: "Facture introuvable." };

  revalidateAll();
  return { status: "success", message: `Facture ${data.number} supprimée.` };
}
