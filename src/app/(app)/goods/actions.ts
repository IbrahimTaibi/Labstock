"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type SaveLotState = {
  status: "idle" | "success" | "error";
  message: string;
};

function text(formData: FormData, key: string) {
  const value = formData.get(key);
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed === "" ? null : trimmed;
}

function integer(formData: FormData, key: string) {
  const value = text(formData, key);
  return value === null ? null : Number.parseInt(value, 10);
}

function decimal(formData: FormData, key: string) {
  const value = text(formData, key);
  return value === null ? null : Number.parseFloat(value.replace(",", "."));
}

export async function saveLot(
  _prev: SaveLotState,
  formData: FormData
): Promise<SaveLotState> {
  /* Une Server Action n'est pas une route : le proxy peut ne pas la couvrir
     après un déplacement de fichier. L'authentification est donc revérifiée
     ici, systématiquement. */
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  }

  const id = integer(formData, "id");
  const productId = integer(formData, "product_id");
  const lotNumber = text(formData, "lot_number");
  const expiryDate = text(formData, "expiry_date");
  const initialQty = integer(formData, "initial_qty");

  if (!productId) {
    return { status: "error", message: "Sélectionnez une désignation." };
  }
  if (!lotNumber) {
    return { status: "error", message: "Le numéro de lot est obligatoire." };
  }
  if (!expiryDate) {
    return { status: "error", message: "La date de péremption est obligatoire." };
  }
  if (initialQty === null || Number.isNaN(initialQty) || initialQty < 0) {
    return {
      status: "error",
      message: "Le stock initial doit être un entier positif.",
    };
  }

  const fields = {
    product_id: productId,
    lot_number: lotNumber,
    internal_ref: text(formData, "internal_ref"),
    manufacturer_ref: text(formData, "manufacturer_ref"),
    manufacturer: text(formData, "manufacturer"),
    packaging: text(formData, "packaging"),
    expiry_date: expiryDate,
    initial_qty: initialQty,
    price_ht: decimal(formData, "price_ht"),
    unit_price: decimal(formData, "unit_price"),
    comment: text(formData, "comment"),
  };

  const supabase = await createClient();

  const { error } = id
    ? await supabase
        .from("lots")
        .update({
          ...fields,
          updated_at: new Date().toISOString(),
          updated_by: user.fullName,
        })
        .eq("id", id)
    : await supabase
        .from("lots")
        .insert({
          ...fields,
          current_qty: initialQty,
          created_by: user.fullName,
        });

  if (error) {
    const duplicate = error.code === "23505";
    return {
      status: "error",
      message: duplicate
        ? `Le lot « ${lotNumber} » existe déjà.`
        : `Enregistrement impossible : ${error.message}`,
    };
  }

  revalidate();
  return {
    status: "success",
    message: id
      ? `Lot « ${lotNumber} » mis à jour.`
      : `Lot « ${lotNumber} » créé.`,
  };
}

function revalidate() {
  revalidatePath("/goods");
  /* Le stock des lots irrigue les sorties, l'inventaire et le tableau de bord. */
  revalidatePath("/issues");
  revalidatePath("/inventory");
  revalidatePath("/products");
  revalidatePath("/");
}

/**
 * Supprime définitivement un lot. Le rang FEFO des autres lots du même
 * produit se recalcule de lui-même : il est porté par `lots_view`, pas
 * stocké. Les lots déjà engagés dans un comptage d'inventaire sont
 * protégés par la contrainte `on delete restrict` — la traçabilité
 * réglementaire passe avant le ménage.
 */
export async function deleteLot(id: number): Promise<SaveLotState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("lots").delete().eq("id", id);

  if (error) {
    if (error.code === "23503") {
      return {
        status: "error",
        message:
          "Suppression impossible : ce lot figure dans un comptage d'inventaire et doit rester traçable.",
      };
    }
    return { status: "error", message: `Suppression impossible : ${error.message}` };
  }

  revalidate();
  return { status: "success", message: "Lot supprimé." };
}
