"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Plus, TriangleAlert } from "lucide-react";
import type { SupplierState } from "@/app/(app)/suppliers/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import { cn, formatAmount, formatInt, formatPercent } from "@/lib/utils";
import type { SuppliersWorkspaceData } from "@/lib/types";
import { SupplierDetailTabs } from "./SupplierDetailTabs";
import { SupplierProfileForm } from "./SupplierProfileForm";

type Feedback = { message: string; ok: boolean } | null;

export function SuppliersWorkspace({ data }: { data: SuppliersWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);

  /* Sélection dérivée : si le fournisseur disparaît côté serveur, la fiche
     et le détail se vident d'eux-mêmes, sans état à resynchroniser. */
  const selected = data.suppliers.find((s) => s.id === selectedId) ?? null;

  function run(action: () => Promise<SupplierState>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {feedback ? (
        <div
          role="status"
          className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
          style={{ color: feedback.ok ? "var(--good)" : "var(--critical)" }}
        >
          {feedback.ok ? (
            <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden />
          ) : (
            <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
          )}
          {feedback.message}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
        {/* Liste des fournisseurs */}
        <section className="card min-w-0 p-4">
          <header className="mb-3 flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              <Building2 size={14} strokeWidth={2.2} aria-hidden />
              Fournisseurs
              <span className="font-normal normal-case tracking-normal text-[var(--text-muted)]">
                ({formatInt(data.suppliers.length)})
              </span>
            </h2>
            {selected ? (
              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--series-1)] hover:underline"
              >
                <Plus size={12} strokeWidth={2.4} aria-hidden />
                Nouveau fournisseur
              </button>
            ) : null}
          </header>

          <DataTable>
            <thead>
              <tr>
                <Th>Fournisseur</Th>
                <Th>Contact</Th>
                <Th align="right">Produits</Th>
                <Th align="right">Cmd. en cours</Th>
                <Th align="right">Total facturé</Th>
                <Th align="right">Part</Th>
                <Th align="right">En retard</Th>
              </tr>
            </thead>
            <tbody>
              {data.suppliers.map((supplier) => {
                const active = supplier.id === selectedId;
                return (
                  <tr
                    key={supplier.id}
                    onClick={() =>
                      setSelectedId(active ? null : supplier.id)
                    }
                    aria-selected={active}
                    className={cn(
                      "cursor-pointer transition-colors",
                      active ? "bg-[var(--page)]" : "hover:bg-[var(--page)]"
                    )}
                  >
                    <Td nowrap>
                      <span className="font-medium">{supplier.name}</span>
                    </Td>
                    <Td nowrap>
                      {supplier.contact_name ?? (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>
                    <Td align="right">{formatInt(supplier.products)}</Td>
                    <Td align="right">{formatInt(supplier.open_orders)}</Td>
                    <Td align="right">{formatAmount(supplier.invoiced_total)}</Td>
                    <Td align="right">
                      {formatPercent(supplier.share * 100, 0)}
                    </Td>
                    <Td align="right">
                      {supplier.overdue_count > 0 ? (
                        <span
                          className="font-semibold"
                          style={{ color: "var(--critical)" }}
                        >
                          {formatAmount(supplier.overdue_amount)}
                        </span>
                      ) : (
                        <span className="text-[var(--text-muted)]">—</span>
                      )}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="text-[var(--text-secondary)]">
                <Td className="font-semibold">Total</Td>
                <Td>{null}</Td>
                <Td align="right" className="font-semibold">
                  {formatInt(
                    data.suppliers.reduce((sum, s) => sum + s.products, 0)
                  )}
                </Td>
                <Td align="right" className="font-semibold">
                  {formatInt(
                    data.suppliers.reduce((sum, s) => sum + s.open_orders, 0)
                  )}
                </Td>
                <Td align="right" className="font-semibold">
                  {formatAmount(data.totals.invoiced)}
                </Td>
                <Td align="right">{null}</Td>
                <Td align="right" className="font-semibold">
                  {data.totals.overdue > 0 ? (
                    <span style={{ color: "var(--critical)" }}>
                      {formatAmount(data.totals.overdue)}
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            </tfoot>
          </DataTable>

          {selected === null ? (
            <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
              Sélectionnez un fournisseur pour ouvrir sa fiche, passer une
              commande ou gérer ses factures.
            </p>
          ) : null}
        </section>

        {/* key : changer de fournisseur remonte le formulaire, donc repart
            d'un état neuf sans resynchroniser champ par champ. */}
        <SupplierProfileForm
          key={selected?.id ?? "nouveau"}
          supplier={selected}
          pending={pending}
          onRun={run}
          onCancel={() => setSelectedId(null)}
        />
      </div>

      {selected ? (
        <SupplierDetailTabs
          supplier={selected}
          products={data.products.filter((p) => p.supplier_id === selected.id)}
          orders={data.orders.filter((o) => o.supplier_id === selected.id)}
          invoices={data.invoices.filter((f) => f.supplier_id === selected.id)}
          pending={pending}
          onRun={run}
        />
      ) : null}
    </div>
  );
}
