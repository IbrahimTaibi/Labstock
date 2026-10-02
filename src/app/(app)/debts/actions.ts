"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { DebtSource, PaymentMethod } from "@/lib/types";

export type DebtState = {
  status: "idle" | "success" | "error";
  message: string;
};

function revalidate() {
  revalidatePath("/debts");
  revalidatePath("/debts/payments");
  /* Le solde d'une facture change son statut sur l'écran Factures. */
  revalidatePath("/invoices");
}

/* Les messages d'erreur de la base sont rédigés pour l'utilisateur
   (dépassement du solde, facture soldée…) : on les laisse passer tels quels
   plutôt que de les remplacer par un message générique moins utile. */
function readableError(message: string) {
  return message.replace(/^.*?:\s*(?=[A-ZÀ-Ü])/, "");
}

/**
 * Enregistre un règlement (§4). Le plafonnement au solde restant dû est
 * vérifié par la base : le contrôle côté écran évite l'aller-retour, il ne
 * le remplace pas.
 */
export async function recordPayment(input: {
  source: DebtSource;
  invoiceId: number;
  amount: number;
  method: PaymentMethod;
  reference: string | null;
  paidAt: string;
  note: string | null;
}): Promise<DebtState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  if (user.labId === null)
    return {
      status: "error",
      message: "Aucun laboratoire attribué à ce compte.",
    };

  if (!Number.isFinite(input.amount) || input.amount <= 0)
    return {
      status: "error",
      message: "Le montant du règlement doit être supérieur à zéro.",
    };
  if (!input.paidAt)
    return { status: "error", message: "La date de règlement est requise." };

  const reference = input.reference?.trim() || null;
  const note = input.note?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("supplier_payments").insert({
    lab_id: user.labId,
    invoice_id: input.source === "supplier" ? input.invoiceId : null,
    subcontractor_invoice_id:
      input.source === "subcontractor" ? input.invoiceId : null,
    amount: input.amount,
    method: input.method,
    reference,
    paid_at: input.paidAt,
    note,
    created_by: user.fullName,
  });

  if (error)
    return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Règlement enregistré." };
}

/**
 * Annule un règlement (§10.3). La ligne est conservée et horodatée : la
 * suppression n'existe pas sur cette table, par exigence de traçabilité.
 */
export async function reversePayment(
  paymentId: number,
  reason: string | null
): Promise<DebtState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reverse_supplier_payment", {
    p_payment_id: paymentId,
    p_operator: user.fullName,
    p_reason: reason?.trim() || null,
  });

  if (error)
    return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Règlement annulé." };
}

/** Référence proposée selon le mode de règlement (§10.2). */
export async function suggestPaymentReference(
  method: PaymentMethod,
  paidAt: string
): Promise<{ reference: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("next_payment_reference", {
    p_method: method,
    p_paid_at: paidAt,
  });
  return { reference: error ? null : (data as string) };
}

/**
 * Échéancier d'une facture (§5.1) : catégorie de dépense, délai convenu et
 * date d'échéance. Les factures sous-traitant et marchandises ne vivent pas
 * dans la même table, d'où l'aiguillage.
 */
export async function saveDebtTerms(input: {
  source: DebtSource;
  invoiceId: number;
  expenseCategory: string | null;
  paymentTermsDays: number | null;
  dueDate: string | null;
}): Promise<DebtState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  if (
    input.paymentTermsDays !== null &&
    (!Number.isInteger(input.paymentTermsDays) || input.paymentTermsDays < 0)
  )
    return {
      status: "error",
      message: "Le délai de paiement doit être un nombre de jours positif.",
    };

  const table =
    input.source === "supplier" ? "invoices" : "subcontractor_invoices";

  /* `invoices.due_date` est obligatoire en base : on ne peut pas l'effacer,
     seulement la déplacer. Les factures sous-traitant l'acceptent nulle. */
  const fields: Record<string, unknown> = {
    expense_category: input.expenseCategory?.trim() || null,
    payment_terms_days: input.paymentTermsDays,
  };
  if (input.dueDate) fields.due_date = input.dueDate;
  else if (input.source === "subcontractor") fields.due_date = null;

  const supabase = await createClient();
  const { error } = await supabase
    .from(table)
    .update(fields)
    .eq("id", input.invoiceId);

  if (error)
    return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Échéancier enregistré." };
}
