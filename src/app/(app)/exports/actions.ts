"use server";

import { getCurrentUser } from "@/lib/auth";
import { csvFilename, csvNumber, toCsv } from "@/lib/csv";
import { getDebtsWorkspace } from "@/lib/debts";
import { getInvoicesWorkspace } from "@/lib/invoices";
import { lotConformity } from "@/lib/lot-conformity";
import { getLots } from "@/lib/lots";
import { getProductsWorkspace } from "@/lib/products";
import { getRequestsWorkspace } from "@/lib/purchase-requests";
import { getSuppliersWorkspace } from "@/lib/suppliers";

export type ExportKind =
  | "products"
  | "invoices"
  | "suppliers"
  | "lots"
  | "debts"
  | "payments"
  | "requests";

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

/* Libellés des tranches d'ancienneté (§7.1). Dupliqués ici plutôt
   qu'importés de DebtBadge : ce module est un Server Action, et ce composant
   est client. */
const DEBT_STATUS = {
  paid: "Payée",
  not_due: "Non échue",
  no_due_date: "Sans échéance",
  late_1_30: "Échue [1;30]",
  late_31_60: "Échue [31;60]",
  late_61_90: "Échue [61;90]",
  late_90_plus: "Échue > 90 jours",
} as const;

const PAYMENT_METHOD = {
  transfer: "Virement",
  check: "Chèque",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
} as const;

const REQUEST_STATUS = {
  pending: "En attente",
  approved: "Validée",
  converted: "Convertie en BC",
  rejected: "Refusée",
} as const;

const REQUEST_PRIORITY = {
  critical: "Critique",
  urgent: "Urgente",
  normal: "Normale",
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

      case "debts": {
        const { debts } = await getDebtsWorkspace();
        return {
          status: "success",
          filename: csvFilename("dettes-fournisseurs"),
          content: toCsv([
            [
              "Numéro",
              "Type",
              "Fournisseur",
              "Date facture",
              "Catégorie",
              "Délai (j)",
              "Échéance",
              "À payer",
              "Payé",
              "Solde",
              "Retard (j)",
              "Statut",
            ],
            ...debts.map((d) => [
              d.number,
              d.source === "supplier" ? "Marchandises" : "Sous-traitance",
              d.creditor,
              d.issue_date,
              d.expense_category ?? "",
              d.payment_terms_days ?? "",
              d.due_date ?? "",
              csvNumber(d.amount_due),
              csvNumber(d.amount_paid),
              csvNumber(d.balance),
              d.days_late ?? "",
              DEBT_STATUS[d.status],
            ]),
          ]),
        };
      }

      case "payments": {
        const { payments } = await getDebtsWorkspace();
        return {
          status: "success",
          filename: csvFilename("reglements"),
          content: toCsv([
            [
              "Date règlement",
              "N° Facture",
              "Fournisseur",
              "Mode",
              "Référence",
              "Montant",
              "Annulé le",
              "Annulé par",
              "Motif d'annulation",
            ],
            ...payments.map((p) => [
              p.paid_at,
              p.invoice_number,
              p.creditor,
              PAYMENT_METHOD[p.method],
              p.reference ?? "",
              csvNumber(p.amount),
              p.reversed_at ?? "",
              p.reversed_by ?? "",
              p.reversal_reason ?? "",
            ]),
          ]),
        };
      }

      case "requests": {
        const { requests } = await getRequestsWorkspace();
        return {
          status: "success",
          filename: csvFilename("demandes-achat"),
          content: toCsv([
            [
              "Date DA",
              "N° DA",
              "Référence",
              "Désignation",
              "Fournisseur",
              "Qté demandée",
              "Qté validée",
              "Priorité",
              "Statut",
              "Demandeur",
              "Validé par",
              "Bon de commande",
            ],
            ...requests.map((r) => [
              r.requested_at,
              r.number,
              r.reference ?? "",
              r.designation,
              r.supplier ?? "",
              r.quantity_requested,
              r.quantity_approved ?? "",
              REQUEST_PRIORITY[r.priority],
              REQUEST_STATUS[r.status],
              r.requester,
              r.validated_by ?? "",
              r.purchase_order_number ?? "",
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
              "Référence interne",
              "Catégorie",
              "Fournisseur",
              "Péremption",
              "Jours restants",
              "Quantité initiale",
              "Quantité restante",
              "Prix HT",
              "Prix unitaire",
              "Rang FEFO",
              "Statut FEFO",
              "Périmé",
              "Conformité",
              "Motifs de non-conformité",
              "Conditionnement",
              "Fabricant",
            ],
            ...lots.map((l) => {
              const { conforme, reasons } = lotConformity(l);
              return [
                l.lot_number,
                l.product_name,
                l.internal_ref ?? "",
                l.category,
                l.supplier,
                l.expiry_date,
                l.days_left,
                l.initial_qty,
                l.current_qty,
                l.price_ht === null ? "" : csvNumber(l.price_ht),
                csvNumber(l.unit_price),
                l.fefo_rank ?? "",
                l.fefo_rank === 1 ? "Actif" : "Inactif",
                l.is_expired ? "Oui" : "Non",
                conforme ? "Conforme" : "Non conforme",
                reasons.join(" ; "),
                l.packaging ?? "",
                l.manufacturer ?? "",
              ];
            }),
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
