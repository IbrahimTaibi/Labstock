"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SupplierState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type SupplierProfileInput = {
  name: string;
  contact_name: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

function revalidate() {
  revalidatePath("/suppliers");
  /* Les commandes créées ici alimentent la page Réceptions. */
  revalidatePath("/receipts");
}

export async function saveSupplier(
  id: number | null,
  profile: SupplierProfileInput
): Promise<SupplierState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const name = profile.name.trim();
  if (!name)
    return { status: "error", message: "Le nom du fournisseur est requis." };

  const clean = (value: string | null) => {
    const trimmed = value?.trim() ?? "";
    return trimmed === "" ? null : trimmed;
  };

  const fields = {
    name,
    contact_name: clean(profile.contact_name),
    email: clean(profile.email),
    phone: clean(profile.phone),
    address: clean(profile.address),
    notes: clean(profile.notes),
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("suppliers").update(fields).eq("id", id)
    : await supabase.from("suppliers").insert(fields);

  if (error) {
    if (error.code === "23505")
      return {
        status: "error",
        message: `Le fournisseur « ${name} » existe déjà.`,
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/suppliers");
  return {
    status: "success",
    message: id
      ? `Fiche « ${name} » mise à jour.`
      : `Fournisseur « ${name} » créé.`,
  };
}

export async function deleteSupplier(id: number): Promise<SupplierState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").delete().eq("id", id);

  if (error) {
    if (error.code === "23503")
      return {
        status: "error",
        message:
          "Suppression impossible : ce fournisseur a des produits, commandes ou factures rattachés.",
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/suppliers");
  return { status: "success", message: "Fournisseur supprimé." };
}

export async function createOrder(
  supplierId: number,
  lines: { product_id: number; quantity: number }[]
): Promise<SupplierState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  if (lines.length === 0)
    return {
      status: "error",
      message: "Ajoutez au moins une ligne à la commande.",
    };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_purchase_order", {
    p_supplier_id: supplierId,
    p_lines: lines,
  });

  if (error) return { status: "error", message: error.message };

  revalidate();
  const result = data as { number: string; lines: number };
  return {
    status: "success",
    message: `Commande ${result.number} créée (${result.lines} ligne(s)). À réceptionner depuis la page Réceptions.`,
  };
}

export type InvoiceLineInput = {
  /** null = ligne libre (frais de port, prestation…). */
  product_id: number | null;
  description: string | null;
  quantity: number;
  unit_price: number;
};

export async function createInvoice(
  supplierId: number,
  input: {
    issue_date: string;
    due_date: string;
    lines: InvoiceLineInput[];
  }
): Promise<SupplierState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  if (!input.issue_date || !input.due_date)
    return {
      status: "error",
      message: "Les dates d'émission et d'échéance sont requises.",
    };
  if (input.lines.length === 0)
    return {
      status: "error",
      message: "Ajoutez au moins une ligne à la facture.",
    };
  for (const line of input.lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      return {
        status: "error",
        message: "Chaque ligne doit avoir une quantité entière positive.",
      };
    if (!Number.isFinite(line.unit_price) || line.unit_price < 0)
      return {
        status: "error",
        message: "Chaque ligne doit avoir un prix unitaire valide.",
      };
    if (line.product_id === null && !line.description?.trim())
      return {
        status: "error",
        message: "Une ligne libre doit avoir une description.",
      };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invoice", {
    p_supplier_id: supplierId,
    p_issue_date: input.issue_date,
    p_due_date: input.due_date,
    p_lines: input.lines,
  });

  if (error) return { status: "error", message: error.message };

  revalidatePath("/suppliers");
  revalidatePath("/invoices");
  revalidatePath("/");
  const result = data as { number: string; lines: number };
  return {
    status: "success",
    message: `Facture ${result.number} enregistrée (${result.lines} ligne(s)).`,
  };
}

export async function deleteInvoice(
  invoiceId: number
): Promise<SupplierState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .delete()
    .eq("id", invoiceId);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/suppliers");
  revalidatePath("/invoices");
  revalidatePath("/");
  return { status: "success", message: "Facture supprimée." };
}

export type InvoiceLineRow = {
  id: number;
  product_id: number | null;
  description: string;
  quantity: number;
  unit_price: number;
};

/** Lignes d'une facture, chargées à la demande depuis le détail. */
export async function loadInvoiceLines(
  invoiceId: number
): Promise<
  | { status: "success"; lines: InvoiceLineRow[] }
  | { status: "error"; message: string }
> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invoice_lines")
    .select("id, product_id, description, quantity, unit_price")
    .eq("invoice_id", invoiceId)
    .order("id");

  if (error) return { status: "error", message: error.message };

  return {
    status: "success",
    lines: (data ?? []).map((l) => ({ ...l, unit_price: Number(l.unit_price) })),
  };
}

export async function markInvoicePaid(
  invoiceId: number
): Promise<SupplierState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("invoices")
    .update({
      status: "paid",
      payment_date: new Date().toISOString().slice(0, 10),
    })
    .eq("id", invoiceId);

  if (error) return { status: "error", message: error.message };

  revalidatePath("/suppliers");
  revalidatePath("/invoices");
  revalidatePath("/");
  return { status: "success", message: "Facture marquée payée." };
}
