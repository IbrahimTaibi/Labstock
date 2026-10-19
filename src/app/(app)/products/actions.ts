"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ARTICLE_PREFIX, nextArticleReference } from "@/lib/utils";

export type ProductState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type ProductInput = {
  name: string;
  /** Vide à la création : générée (ARTICLE-NNNN). */
  reference: string | null;
  manufacturer_ref: string | null;
  packaging: string;
  category_id: number;
  supplier_id: number;
  unit_price: number;
  vat_rate: number;
  /** Date de création, AAAA-MM-JJ. */
  created_on: string;
};

const VAT_RATES = [0, 7, 13, 19];

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
  const packaging = input.packaging.trim();
  if (!packaging)
    return { status: "error", message: "Le conditionnement est requis." };
  if (!VAT_RATES.includes(input.vat_rate))
    return { status: "error", message: "Taux de TVA invalide." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.created_on))
    return { status: "error", message: "Date de création invalide." };

  const supabase = await createClient();
  let reference = input.reference?.trim() || null;
  const fields = {
    name,
    manufacturer_ref: input.manufacturer_ref?.trim() || null,
    packaging,
    category_id: input.category_id,
    supplier_id: input.supplier_id,
    unit_price: input.unit_price,
    vat_rate: input.vat_rate,
    /* Midi UTC : la date reste la même quel que soit le fuseau d'affichage. */
    created_at: `${input.created_on}T12:00:00Z`,
  };

  let error: { code?: string; message: string } | null = null;
  if (id) {
    ({ error } = await supabase
      .from("products")
      .update({ ...fields, ...(reference ? { reference } : {}) })
      .eq("id", id));
  } else if (reference) {
    ({ error } = await supabase.from("products").insert({ ...fields, reference }));
  } else {
    /* Référence automatique : la plus haute ARTICLE-NNNN + 1. Deux créations
       simultanées peuvent viser le même numéro ; l'unicité en base tranche
       et on retente avec le suivant. */
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const { data: refs } = await supabase
        .from("products")
        .select("reference")
        .like("reference", `${ARTICLE_PREFIX}%`);
      reference = nextArticleReference((refs ?? []).map((r) => r.reference));
      ({ error } = await supabase.from("products").insert({ ...fields, reference }));
      if (error?.code !== "23505") break;
    }
  }

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
    message: id
      ? `« ${name} » mis à jour.`
      : `Article ${reference} « ${name} » créé.`,
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
