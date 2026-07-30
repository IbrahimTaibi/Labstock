"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type ProductState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ProductInput = {
  name: string;
  reference: string | null;
  category_id: number;
  supplier_id: number;
  unit_price: number;
  min_stock: number;
};

function revalidate() {
  revalidatePath("/products");
  /* Le catalogue alimente les lots, commandes, sorties et le tableau de bord. */
  revalidatePath("/goods");
  revalidatePath("/suppliers");
  revalidatePath("/");
}

export async function saveProduct(
  id: number | null,
  input: ProductInput
): Promise<ProductState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const name = input.name.trim();
  if (!name)
    return { status: "error", message: "La désignation est requise." };
  if (!Number.isInteger(input.category_id))
    return { status: "error", message: "Sélectionnez une catégorie." };
  if (!Number.isInteger(input.supplier_id))
    return { status: "error", message: "Sélectionnez un fournisseur." };
  if (!Number.isFinite(input.unit_price) || input.unit_price < 0)
    return {
      status: "error",
      message: "Le prix unitaire doit être positif ou nul.",
    };
  if (!Number.isInteger(input.min_stock) || input.min_stock < 0)
    return {
      status: "error",
      message: "Le seuil minimum doit être un entier positif ou nul.",
    };

  const reference = input.reference?.trim() || null;
  const fields = {
    name,
    reference,
    category_id: input.category_id,
    supplier_id: input.supplier_id,
    unit_price: input.unit_price,
    min_stock: input.min_stock,
  };

  const supabase = await createClient();
  const { error } = id
    ? await supabase.from("products").update(fields).eq("id", id)
    : await supabase.from("products").insert(fields);

  if (error) {
    if (error.code === "23505")
      return {
        status: "error",
        message: `La référence « ${reference} » est déjà utilisée.`,
      };
    return { status: "error", message: error.message };
  }

  revalidate();
  return {
    status: "success",
    message: id ? `« ${name} » mis à jour.` : `Produit « ${name} » créé.`,
  };
}

export async function deleteProduct(id: number): Promise<ProductState> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const supabase = await createClient();
  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    if (error.code === "23503")
      return {
        status: "error",
        message:
          "Suppression impossible : ce produit a des lots, mouvements, commandes ou analyses rattachés.",
      };
    return { status: "error", message: error.message };
  }

  revalidate();
  return { status: "success", message: "Produit supprimé." };
}
