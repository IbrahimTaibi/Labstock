"use client";

import { CheckCircle2, PackageCheck, TriangleAlert } from "lucide-react";
import { Td, Th } from "@/components/DataTable";
import type { IssueMode, PendingConsumable } from "@/lib/types";
import { formatDate, formatInt } from "@/lib/utils";

export function ConsumablesTable({
  consumables,
  mode,
  quantities,
  onQuantityChange,
}: {
  consumables: PendingConsumable[];
  mode: IssueMode;
  /** Quantités effectives, éditables en mode manuel. */
  quantities: Record<number, number>;
  onQuantityChange: (productId: number, quantity: number) => void;
}) {
  const editable = mode === "manual";

  const effective = (row: PendingConsumable) =>
    quantities[row.product_id] ?? row.required_quantity;

  const totalQuantity = consumables.reduce((sum, row) => sum + effective(row), 0);
  const totalStock = consumables.reduce((sum, row) => sum + row.stock_available, 0);
  const shortages = consumables.filter((row) => effective(row) > row.stock_available);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          3. Consommables à déduire du stock
        </h2>
        <span className="rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
          Références : {formatInt(consumables.length)}
        </span>
        <span className="rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
          Quantité nécessaire : {formatInt(totalQuantity)}
        </span>
        <span className="rounded px-2 py-1 text-[10px] text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
          Stock disponible : {formatInt(totalStock)}
        </span>
      </div>

      {consumables.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
          Aucun consommable à déduire.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[940px] border-collapse text-[11px]">
              <thead>
                <tr>
                  <Th>Consommable</Th>
                  <Th>Référence</Th>
                  <Th>Lot (FEFO)</Th>
                  <Th>Péremption</Th>
                  <Th align="right">Coef./test</Th>
                  <Th align="right">Échant.</Th>
                  <Th align="right">Qté nécessaire</Th>
                  <Th align="right">Stock dispo.</Th>
                  <Th align="right">Stock restant</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {consumables.map((row) => {
                  const quantity = effective(row);
                  const remaining = row.stock_available - quantity;
                  const ok = remaining >= 0;

                  return (
                    <tr key={row.product_id}>
                      <Td>
                        <span className="block max-w-[190px] truncate font-medium">
                          {row.product_name}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {row.category}
                        </span>
                      </Td>
                      <Td nowrap>{row.reference ?? "—"}</Td>
                      <Td nowrap>{row.lot_number ?? "—"}</Td>
                      <Td nowrap>
                        {row.expiry_date ? formatDate(row.expiry_date) : "—"}
                      </Td>
                      <Td align="right">
                        {row.coefficient === null ? (
                          <span
                            title="Coefficients différents selon l'analyse"
                            className="text-[var(--text-muted)]"
                          >
                            variable
                          </span>
                        ) : (
                          row.coefficient.toString().replace(".", ",")
                        )}
                      </Td>
                      <Td align="right">{formatInt(row.covered_samples)}</Td>
                      <Td align="right">
                        {editable ? (
                          <input
                            type="number"
                            min={0}
                            step={1}
                            value={quantity}
                            onChange={(event) =>
                              onQuantityChange(
                                row.product_id,
                                Math.max(0, Math.floor(Number(event.target.value) || 0))
                              )
                            }
                            aria-label={`Quantité pour ${row.product_name}`}
                            className="tnum w-[68px] rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-right text-[11px] outline-none focus:border-[var(--series-1)]"
                          />
                        ) : (
                          <span className="font-semibold">{formatInt(quantity)}</span>
                        )}
                      </Td>
                      <Td align="right">{formatInt(row.stock_available)}</Td>
                      <Td align="right">
                        <span style={{ color: ok ? undefined : "var(--critical)" }}>
                          {formatInt(remaining)}
                        </span>
                      </Td>
                      <Td>
                        {ok ? (
                          <span
                            className="inline-flex items-center gap-1 whitespace-nowrap font-semibold"
                            style={{ color: "var(--good)" }}
                          >
                            <CheckCircle2 size={11} strokeWidth={2.6} aria-hidden />
                            OK
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1 whitespace-nowrap font-semibold"
                            style={{ color: "var(--critical)" }}
                          >
                            <TriangleAlert size={11} strokeWidth={2.6} aria-hidden />
                            Insuffisant
                          </span>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div
            className="mt-3 flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-[10px] font-medium"
            style={{
              color: shortages.length ? "var(--critical)" : "var(--good)",
              background: `color-mix(in srgb, ${
                shortages.length ? "var(--critical)" : "var(--good)"
              } 10%, transparent)`,
            }}
          >
            {shortages.length ? (
              <>
                <TriangleAlert size={13} strokeWidth={2.4} aria-hidden />
                Stock insuffisant pour {shortages.length} référence
                {shortages.length > 1 ? "s" : ""} : la sortie sera refusée tant que
                les quantités dépassent le stock.
              </>
            ) : (
              <>
                <PackageCheck size={13} strokeWidth={2.4} aria-hidden />
                Toutes les quantités sont disponibles et suffisantes pour effectuer
                la déduction.
              </>
            )}
          </div>
        </>
      )}
    </section>
  );
}
