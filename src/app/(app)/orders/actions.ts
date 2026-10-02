"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type OrderState = {
  status: "idle" | "success" | "error";
  message: string;
  orderId?: number;
};

/* TVA proposée par défaut sur une nouvelle ligne : le taux normal tunisien,
   celui de l'exemple du cahier des charges (§6.1). Modifiable ligne à ligne. */
const DEFAULT_VAT = 19;

function revalidate() {
  revalidatePath("/orders");
  /* Valider ou annuler un B.C. change le statut des D.A. concernées, et un
     B.C. validé devient réceptionnable. */
  revalidatePath("/requests");
  revalidatePath("/receipts");
}

/* Les exceptions de la base sont rédigées pour l'utilisateur : on garde leur
   texte plutôt qu'un message générique moins utile. */
function readableError(message: string) {
  return message.replace(/^.*?:\s*(?=[A-ZÀ-Ü])/, "");
}

const SESSION_EXPIRED: OrderState = {
  status: "error",
  message: "Session expirée. Reconnectez-vous.",
};

export type OrderHeader = {
  supplierId: number;
  orderDate: string;
  deliveryDays: number | null;
  paymentMethod: string | null;
  currency: string;
};

/** §9 « Enregistrer le B.C. » — crée le panier, en préparation. */
export async function createOrderDraft(
  header: OrderHeader
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (user.labId === null)
    return { status: "error", message: "Aucun laboratoire attribué." };
  if (!header.supplierId)
    return { status: "error", message: "Le fournisseur est obligatoire." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .insert({
      lab_id: user.labId,
      supplier_id: header.supplierId,
      ordered_at: header.orderDate,
      order_date: header.orderDate,
      delivery_days: header.deliveryDays,
      payment_method: header.paymentMethod,
      currency: header.currency,
      lifecycle: "draft",
    })
    .select("id, number")
    .single();

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return {
    status: "success",
    message: `Bon de commande ${data.number} créé, en préparation.`,
    orderId: data.id,
  };
}

/** En-tête d'un B.C. en préparation. Le changement de fournisseur est
    refusé par la base tant que le panier n'est pas vide (§11.6). */
export async function updateOrderHeader(
  orderId: number,
  header: OrderHeader
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("purchase_orders")
    .update({
      supplier_id: header.supplierId,
      ordered_at: header.orderDate,
      order_date: header.orderDate,
      delivery_days: header.deliveryDays,
      payment_method: header.paymentMethod,
      currency: header.currency,
    })
    .eq("id", orderId)
    .eq("lifecycle", "draft")
    .select("id");

  if (error) return { status: "error", message: readableError(error.message) };
  if (!data || data.length === 0)
    return {
      status: "error",
      message: "Seul un bon de commande en préparation peut être modifié.",
    };

  revalidate();
  return { status: "success", message: "En-tête enregistré." };
}

/**
 * Prix proposé pour une ligne (§11.4) : le dernier prix réellement payé pour
 * cet article lors d'une réception non annulée, à défaut le prix catalogue.
 * Le prix catalogue peut dater ; le dernier prix payé reflète le tarif réel.
 */
async function suggestedPrice(productId: number) {
  const supabase = await createClient();

  const { data: last } = await supabase
    .from("goods_receipt_lines")
    .select("unit_price, goods_receipts!inner(received_at, reversed_at)")
    .eq("product_id", productId)
    .is("goods_receipts.reversed_at", null)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (last) return Number(last.unit_price);

  const { data: product } = await supabase
    .from("products")
    .select("unit_price")
    .eq("id", productId)
    .maybeSingle();

  return Number(product?.unit_price ?? 0);
}

/** §5.2 ➕ — verse une D.A. validée dans le panier. */
export async function addRequestLine(
  orderId: number,
  requestId: number
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (user.labId === null)
    return { status: "error", message: "Aucun laboratoire attribué." };

  const supabase = await createClient();
  const { data: request, error: requestError } = await supabase
    .from("purchase_requests")
    .select("product_id, quantity_requested, quantity_approved")
    .eq("id", requestId)
    .maybeSingle();

  if (requestError)
    return { status: "error", message: readableError(requestError.message) };
  if (!request?.product_id)
    return {
      status: "error",
      message: "Cette demande n'est rattachée à aucun article du catalogue.",
    };

  const { error } = await supabase.from("purchase_order_lines").insert({
    lab_id: user.labId,
    order_id: orderId,
    product_id: request.product_id,
    request_id: requestId,
    quantity_ordered: request.quantity_approved ?? request.quantity_requested,
    unit_price: await suggestedPrice(request.product_id),
    vat_rate: DEFAULT_VAT,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Demande ajoutée au panier." };
}

/**
 * §6.2 « Ajouter manuellement » — ligne sans D.A. La base l'accepte ; elle
 * est signalée à l'écran, faute de traçabilité amont (§10.5).
 */
export async function addManualLine(
  orderId: number,
  productId: number,
  quantity: number
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;
  if (user.labId === null)
    return { status: "error", message: "Aucun laboratoire attribué." };
  if (!Number.isInteger(quantity) || quantity <= 0)
    return { status: "error", message: "Quantité invalide." };

  const supabase = await createClient();
  const { error } = await supabase.from("purchase_order_lines").insert({
    lab_id: user.labId,
    order_id: orderId,
    product_id: productId,
    quantity_ordered: quantity,
    unit_price: await suggestedPrice(productId),
    vat_rate: DEFAULT_VAT,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Ligne ajoutée manuellement." };
}

/** §6.1 — quantité, prix et TVA éditables tant que le B.C. est en préparation. */
export async function updateLine(
  lineId: number,
  fields: { quantity: number; unitPrice: number; vatRate: number }
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  if (!Number.isInteger(fields.quantity) || fields.quantity <= 0)
    return { status: "error", message: "Quantité invalide." };
  if (!Number.isFinite(fields.unitPrice) || fields.unitPrice < 0)
    return { status: "error", message: "Prix unitaire invalide." };
  if (!Number.isFinite(fields.vatRate) || fields.vatRate < 0)
    return { status: "error", message: "Taux de TVA invalide." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_order_lines")
    .update({
      quantity_ordered: fields.quantity,
      unit_price: fields.unitPrice,
      vat_rate: fields.vatRate,
    })
    .eq("id", lineId);

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Ligne mise à jour." };
}

/** 🗑 — retire une ligne ; sa D.A. redevient disponible (§6.1). */
export async function removeLine(lineId: number): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("id", lineId);

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Ligne retirée du panier." };
}

/** §6.2 « Vider le panier ». */
export async function clearCart(orderId: number): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const supabase = await createClient();
  const { error } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("order_id", orderId);

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Panier vidé." };
}

async function transition(
  fn: "validate_purchase_order" | "send_purchase_order",
  orderId: number,
  success: string
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, {
    p_order_id: orderId,
    p_operator: user.fullName,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: success };
}

/** §9 « Valider le B.C. » — fige le panier, convertit les D.A. */
export async function validateOrder(orderId: number) {
  return transition(
    "validate_purchase_order",
    orderId,
    "Bon de commande validé : les demandes associées sont converties."
  );
}

/** §11.2 — marque le B.C. comme transmis au fournisseur. */
export async function sendOrder(orderId: number) {
  return transition(
    "send_purchase_order",
    orderId,
    "Bon de commande marqué comme envoyé."
  );
}

export async function cancelOrder(
  orderId: number,
  reason: string | null
): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("cancel_purchase_order", {
    p_order_id: orderId,
    p_operator: user.fullName,
    p_reason: reason?.trim() || null,
  });

  if (error) return { status: "error", message: readableError(error.message) };

  const released = (data as { released?: number } | null)?.released ?? 0;
  revalidate();
  return {
    status: "success",
    message: `Bon de commande annulé. ${released} demande(s) remise(s) à disposition.`,
  };
}

/**
 * §9 « Supprimer » — réservé au B.C. en préparation : un B.C. validé engage
 * déjà le laboratoire, il s'annule, il ne s'efface pas.
 */
export async function deleteOrder(orderId: number): Promise<OrderState> {
  const user = await getCurrentUser();
  if (!user) return SESSION_EXPIRED;

  const supabase = await createClient();
  const { data: order } = await supabase
    .from("purchase_orders")
    .select("lifecycle")
    .eq("id", orderId)
    .maybeSingle();

  if (order?.lifecycle !== "draft")
    return {
      status: "error",
      message:
        "Seul un bon de commande en préparation peut être supprimé ; annulez-le sinon.",
    };

  const { error: linesError } = await supabase
    .from("purchase_order_lines")
    .delete()
    .eq("order_id", orderId);
  if (linesError)
    return { status: "error", message: readableError(linesError.message) };

  const { error } = await supabase
    .from("purchase_orders")
    .delete()
    .eq("id", orderId)
    .eq("lifecycle", "draft");

  if (error) return { status: "error", message: readableError(error.message) };

  revalidate();
  return { status: "success", message: "Bon de commande supprimé." };
}
