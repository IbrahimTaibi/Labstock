"use server";

import { getArticleDetail } from "@/lib/analytics";
import { getCurrentUser } from "@/lib/auth";
import type { ArticleDetail } from "@/lib/types";

export type ArticleDetailState =
  | { status: "success"; detail: ArticleDetail }
  | { status: "error"; message: string };

/**
 * Lots et mouvements d'un article, chargés à l'ouverture de la fiche.
 * Les charger à la demande évite de transporter les lots de 856 articles
 * dans le rendu initial de la page.
 */
export async function loadArticleDetail(
  productId: number
): Promise<ArticleDetailState> {
  const user = await getCurrentUser();
  if (!user) {
    return { status: "error", message: "Session expirée. Reconnectez-vous." };
  }

  if (!Number.isInteger(productId)) {
    return { status: "error", message: "Article invalide." };
  }

  try {
    return { status: "success", detail: await getArticleDetail(productId) };
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Chargement impossible.",
    };
  }
}
