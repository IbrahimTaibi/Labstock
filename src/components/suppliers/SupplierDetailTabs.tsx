"use client";

import { useState } from "react";
import {
  CheckCircle2,
  FileText,
  Package,
  Plus,
  ShoppingCart,
  Trash2,
  Truck,
} from "lucide-react";
import { createInvoice, createOrder, markInvoicePaid } from "@/app/(app)/suppliers/actions";
import type { SupplierState } from "@/app/(app)/suppliers/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import { InvoiceBadge } from "@/components/invoices/InvoiceBadge";
import { DeliveryBadge } from "@/components/receipts/DeliveryBadge";
import { StockStatusBadge } from "@/components/StockStatusBadge";
import { cn, formatAmount, formatDate, formatInt } from "@/lib/utils";
import type {
  SupplierInvoice,
  SupplierOrder,
  SupplierProduct,
  SupplierRow,
} from "@/lib/types";

const INPUT_CLASS =
  "h-8 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

type Tab = "products" | "orders" | "invoices";
type OrderDraftLine = { product_id: number | ""; quantity: string };

/** Détail d'un fournisseur : ses produits, ses commandes, ses factures. */
export function SupplierDetailTabs({
  supplier,
  products,
  orders,
  invoices,
  pending,
  onRun,
}: {
  supplier: SupplierRow;
  products: SupplierProduct[];
  orders: SupplierOrder[];
  invoices: SupplierInvoice[];
  pending: boolean;
  onRun: (action: () => Promise<SupplierState>) => void;
}) {
  const [tab, setTab] = useState<Tab>("products");
  const [orderLines, setOrderLines] = useState<OrderDraftLine[]>([]);
  const [invoiceDraft, setInvoiceDraft] = useState({
    amount: "",
    issue_date: new Date().toISOString().slice(0, 10),
    due_date: "",
  });
  const [showInvoiceForm, setShowInvoiceForm] = useState(false);

  const tabs: { id: Tab; label: string; icon: typeof Package; count: number }[] =
    [
      { id: "products", label: "Produits", icon: Package, count: products.length },
      { id: "orders", label: "Commandes", icon: Truck, count: orders.length },
      {
        id: "invoices",
        label: "Factures",
        icon: FileText,
        count: supplier.invoice_count,
      },
    ];

  function submitOrder() {
    const lines = orderLines
      .filter((l) => l.product_id !== "")
      .map((l) => ({
        product_id: l.product_id as number,
        quantity: Number.parseInt(l.quantity, 10),
      }));
    if (lines.some((l) => !Number.isInteger(l.quantity) || l.quantity <= 0)) {
      return;
    }
    onRun(() => createOrder(supplier.id, lines));
    setOrderLines([]);
  }

  function submitInvoice(event: React.FormEvent) {
    event.preventDefault();
    /* Saisie rapide au montant global : une ligne libre. Le détail par
       produit se compose depuis la page Factures. */
    onRun(() =>
      createInvoice(supplier.id, {
        issue_date: invoiceDraft.issue_date,
        due_date: invoiceDraft.due_date,
        lines: [
          {
            product_id: null,
            description: "Fournitures de laboratoire",
            quantity: 1,
            unit_price: Number.parseFloat(
              invoiceDraft.amount.replace(",", ".")
            ),
          },
        ],
      })
    );
    setShowInvoiceForm(false);
    setInvoiceDraft({
      amount: "",
      issue_date: new Date().toISOString().slice(0, 10),
      due_date: "",
    });
  }

  const orderDraftValid =
    orderLines.length > 0 &&
    orderLines.every((l) => {
      if (l.product_id === "") return false;
      const qty = Number.parseInt(l.quantity, 10);
      return Number.isInteger(qty) && qty > 0;
    });

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-1 border-b border-[var(--border)] pb-2">
        {tabs.map(({ id, label, icon: Icon, count }) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={cn(
              "flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors",
              tab === id
                ? "text-white"
                : "text-[var(--text-secondary)] hover:bg-[var(--page)]"
            )}
            style={tab === id ? { background: "var(--series-1)" } : undefined}
          >
            <Icon size={13} strokeWidth={2.2} aria-hidden />
            {label}
            <span
              className={cn(
                "tnum rounded px-1 text-[9px] font-semibold",
                tab === id ? "bg-white/20" : "ring-1 ring-[var(--border)]"
              )}
            >
              {formatInt(count)}
            </span>
          </button>
        ))}
      </div>

      {tab === "products" ? (
        products.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
            Aucun produit référencé chez ce fournisseur.
          </p>
        ) : (
          <DataTable>
            <thead>
              <tr>
                <Th>Produit</Th>
                <Th>Référence</Th>
                <Th>Catégorie</Th>
                <Th align="right">Stock</Th>
                <Th align="right">Seuil min.</Th>
                <Th align="right">Prix unitaire</Th>
                <Th align="right">Valeur</Th>
                <Th>État</Th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <Td nowrap>
                    <span className="font-medium">{p.name}</span>
                  </Td>
                  <Td nowrap>{p.reference ?? "—"}</Td>
                  <Td nowrap>{p.category}</Td>
                  <Td align="right">{formatInt(p.stock_qty)}</Td>
                  <Td align="right">{formatInt(p.min_stock)}</Td>
                  <Td align="right">{formatAmount(p.unit_price)}</Td>
                  <Td align="right">{formatAmount(p.stock_qty * p.unit_price)}</Td>
                  <Td nowrap>
                    {p.stock_qty === 0 ? (
                      <StockStatusBadge status="out_of_stock" />
                    ) : p.stock_qty <= p.min_stock ? (
                      <StockStatusBadge status="low" />
                    ) : (
                      <span className="text-[var(--text-muted)]">—</span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )
      ) : null}

      {tab === "orders" ? (
        <div className="flex flex-col gap-3">
          {/* Nouvelle commande */}
          <div className="rounded-lg border border-[var(--border)] bg-[var(--page)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Nouvelle commande
              </span>
              <button
                type="button"
                onClick={() =>
                  setOrderLines((lines) => [
                    ...lines,
                    { product_id: "", quantity: "1" },
                  ])
                }
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--series-1)] hover:underline"
              >
                <Plus size={12} strokeWidth={2.4} aria-hidden />
                Ajouter une ligne
              </button>
            </div>

            {orderLines.length === 0 ? (
              <p className="text-[10px] text-[var(--text-muted)]">
                Ajoutez des lignes pour composer une commande ; elle sera ensuite
                à réceptionner depuis la page Réceptions.
              </p>
            ) : (
              <div className="flex flex-col gap-1.5">
                {orderLines.map((line, index) => {
                  const chosen = new Set(
                    orderLines
                      .filter((_, i) => i !== index)
                      .map((l) => l.product_id)
                  );
                  return (
                    <div key={index} className="flex items-center gap-2">
                      <select
                        value={line.product_id}
                        onChange={(event) =>
                          setOrderLines((lines) =>
                            lines.map((l, i) =>
                              i === index
                                ? {
                                    ...l,
                                    product_id:
                                      event.target.value === ""
                                        ? ""
                                        : Number(event.target.value),
                                  }
                                : l
                            )
                          )
                        }
                        className={cn(INPUT_CLASS, "min-w-0 flex-1")}
                      >
                        <option value="">— Produit —</option>
                        {products
                          .filter((p) => !chosen.has(p.id))
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.name} ({formatAmount(p.unit_price)})
                            </option>
                          ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(event) =>
                          setOrderLines((lines) =>
                            lines.map((l, i) =>
                              i === index
                                ? { ...l, quantity: event.target.value }
                                : l
                            )
                          )
                        }
                        className={cn(INPUT_CLASS, "tnum w-20 text-right")}
                        aria-label="Quantité"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setOrderLines((lines) =>
                            lines.filter((_, i) => i !== index)
                          )
                        }
                        className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--critical)]"
                      >
                        <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                        <span className="sr-only">Retirer la ligne</span>
                      </button>
                    </div>
                  );
                })}
                <button
                  type="button"
                  disabled={pending || !orderDraftValid}
                  onClick={submitOrder}
                  className="mt-1 flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--series-1)" }}
                >
                  <ShoppingCart size={13} strokeWidth={2.4} aria-hidden />
                  Passer la commande
                </button>
              </div>
            )}
          </div>

          {orders.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-[var(--text-muted)]">
              Aucune commande pour ce fournisseur.
            </p>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Commande</Th>
                  <Th>Passée le</Th>
                  <Th align="right">Lignes</Th>
                  <Th align="right">Montant</Th>
                  <Th>Livraison</Th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <Td nowrap>
                      <span className="font-medium">{o.number}</span>
                    </Td>
                    <Td nowrap>{formatDate(o.ordered_at)}</Td>
                    <Td align="right">{formatInt(o.lines)}</Td>
                    <Td align="right">{formatAmount(o.total)}</Td>
                    <Td nowrap>
                      <DeliveryBadge status={o.status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </div>
      ) : null}

      {tab === "invoices" ? (
        <div className="flex flex-col gap-3">
          {showInvoiceForm ? (
            <form
              onSubmit={submitInvoice}
              className="flex flex-wrap items-end gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] p-3"
            >
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Montant (DT) *
                </span>
                <input
                  type="text"
                  inputMode="decimal"
                  value={invoiceDraft.amount}
                  onChange={(e) =>
                    setInvoiceDraft((d) => ({ ...d, amount: e.target.value }))
                  }
                  placeholder="0,00"
                  className={cn(INPUT_CLASS, "tnum w-28 text-right")}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Émise le *
                </span>
                <input
                  type="date"
                  value={invoiceDraft.issue_date}
                  onChange={(e) =>
                    setInvoiceDraft((d) => ({ ...d, issue_date: e.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </label>
              <label className="flex flex-col gap-1">
                <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Échéance *
                </span>
                <input
                  type="date"
                  value={invoiceDraft.due_date}
                  onChange={(e) =>
                    setInvoiceDraft((d) => ({ ...d, due_date: e.target.value }))
                  }
                  className={INPUT_CLASS}
                />
              </label>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={
                    pending ||
                    invoiceDraft.amount.trim() === "" ||
                    invoiceDraft.due_date === ""
                  }
                  className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--series-1)" }}
                >
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Enregistrer
                </button>
                <button
                  type="button"
                  onClick={() => setShowInvoiceForm(false)}
                  className="flex h-8 items-center rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                >
                  Annuler
                </button>
              </div>
            </form>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setShowInvoiceForm(true)}
                className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--series-1)] hover:underline"
              >
                <Plus size={13} strokeWidth={2.4} aria-hidden />
                Nouvelle facture
              </button>
            </div>
          )}

          {invoices.length === 0 ? (
            <p className="py-2 text-center text-[11px] text-[var(--text-muted)]">
              Aucune facture pour ce fournisseur.
            </p>
          ) : (
            <>
              <DataTable>
                <thead>
                  <tr>
                    <Th>Facture</Th>
                    <Th>Émise le</Th>
                    <Th>Échéance</Th>
                    <Th align="right">Montant</Th>
                    <Th>Statut</Th>
                    <Th align="right">Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((f) => (
                    <tr key={f.id}>
                      <Td nowrap>
                        <span className="font-medium">{f.number}</span>
                      </Td>
                      <Td nowrap>{formatDate(f.issue_date)}</Td>
                      <Td nowrap>{formatDate(f.due_date)}</Td>
                      <Td align="right">{formatAmount(f.amount)}</Td>
                      <Td nowrap>
                        <InvoiceBadge status={f.status} />
                      </Td>
                      <Td align="right" nowrap>
                        {f.status !== "paid" ? (
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => onRun(() => markInvoicePaid(f.id))}
                            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--series-1)] hover:underline disabled:opacity-50"
                          >
                            <CheckCircle2 size={12} strokeWidth={2.2} aria-hidden />
                            Marquer payée
                          </button>
                        ) : f.payment_date ? (
                          <span className="text-[10px] text-[var(--text-muted)]">
                            le {formatDate(f.payment_date)}
                          </span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
              {supplier.invoice_count > invoices.length ? (
                <p className="text-center text-[10px] text-[var(--text-muted)]">
                  {formatInt(invoices.length)} factures récentes affichées sur{" "}
                  {formatInt(supplier.invoice_count)} au total.
                </p>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </section>
  );
}
