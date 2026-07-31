"use server";

import { getCurrentUser } from "@/lib/auth";
import { csvFilename, csvNumber, toCsv } from "@/lib/csv";
import { getInvoicesWorkspace } from "@/lib/invoices";
import { getLots } from "@/lib/lots";
import { getProductsWorkspace } from "@/lib/products";
import { getSuppliersWorkspace } from "@/lib/suppliers";

export type ExportKind = "products" | "invoices" | "suppliers" | "lots";

export type ExportResult =
  | { status: "success"; filename: string; content: string }
  | { status: "error"; message: string };

const STOCK_STATE = {
  ok: "Disponible",
  low: "Sous le seuil",
  out: "Rupture",
} as const;

const INVOICE_STATUS = {
  paid: "Payée",
  pending: "En attente",
  overdue: "En retard",
} as const;

/**
 * Le CSV est construit à la demande, côté serveur : le jeu de données
 * complet n'a pas à voyager avec chaque rendu de page, et le RLS le cadre
 * au laboratoire de l'appelant.
 */
export async function exportCsv(kind: ExportKind): Promise<ExportResult> {
  const user = await getCurrentUser();
  if (!user)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  try {
    switch (kind) {
      case "products": {
        const { products } = await getProductsWorkspace();
        return {
          status: "success",
          filename: csvFilename("produits"),
          content: toCsv([
            [
              "Référence",
              "Désignation",
              "Catégorie",
              "Fournisseur",
              "Stock",
              "Seuil minimum",
              "Prix unitaire",
              "Valeur du stock",
              "État",
            ],
            ...products.map((p) => [
              p.display_reference,
              p.name,
              p.category,
              p.supplier,
              p.stock_qty,
              p.min_stock,
              csvNumber(p.unit_price),
              csvNumber(p.stock_value),
              STOCK_STATE[p.state],
            ]),
          ]),
        };
      }

      case "invoices": {
        const { invoices } = await getInvoicesWorkspace();
        return {
          status: "success",
          filename: csvFilename("factures"),
          content: toCsv([
            [
              "Numéro",
              "Fournisseur",
              "Émission",
              "Échéance",
              "Règlement",
              "Montant",
              "Statut",
              "Jours de retard",
            ],
            ...invoices.map((f) => [
              f.number,
              f.supplier,
              f.issue_date,
              f.due_date,
              f.payment_date ?? "",
              csvNumber(f.amount),
              INVOICE_STATUS[f.status],
              f.days_late || "",
            ]),
          ]),
        };
      }

      case "suppliers": {
        const { suppliers } = await getSuppliersWorkspace();
        return {
          status: "success",
          filename: csvFilename("fournisseurs"),
          content: toCsv([
            [
              "Fournisseur",
              "Contact",
              "E-mail",
              "Téléphone",
              "Adresse",
              "Produits",
              "Valeur du stock",
              "Commandes en cours",
              "Factures",
              "Total facturé",
              "Encours",
              "En retard",
              "Dernière facture",
            ],
            ...suppliers.map((s) => [
              s.name,
              s.contact_name ?? "",
              s.email ?? "",
              s.phone ?? "",
              s.address ?? "",
              s.products,
              csvNumber(s.stock_value),
              s.open_orders,
              s.invoice_count,
              csvNumber(s.invoiced_total),
              csvNumber(s.pending_amount),
              csvNumber(s.overdue_amount),
              s.last_invoice_date ?? "",
            ]),
          ]),
        };
      }

      case "lots": {
        const lots = await getLots();
        return {
          status: "success",
          filename: csvFilename("lots"),
          content: toCsv([
            [
              "Numéro de lot",
              "Produit",
              "Catégorie",
              "Fournisseur",
              "Péremption",
              "Jours restants",
              "Quantité initiale",
              "Quantité restante",
              "Prix unitaire",
              "Rang FEFO",
              "Périmé",
              "Conditionnement",
              "Fabricant",
            ],
            ...lots.map((l) => [
              l.lot_number,
              l.product_name,
              l.category,
              l.supplier,
              l.expiry_date,
              l.days_left,
              l.initial_qty,
              l.current_qty,
              csvNumber(l.unit_price),
              l.fefo_rank ?? "",
              l.is_expired ? "Oui" : "Non",
              l.packaging ?? "",
              l.manufacturer ?? "",
            ]),
          ]),
        };
      }
    }
  } catch (error) {
    return {
      status: "error",
      message:
        error instanceof Error ? error.message : "Export impossible.",
    };
  }
}
