"use client";

import { useMemo, useState, useTransition } from "react";
import { CheckCircle2, RotateCcw, ShieldCheck, TriangleAlert } from "lucide-react";
import { issueStock } from "@/app/(app)/issues/actions";
import type { IssueMode, IssueWorkspaceData } from "@/lib/types";
import { formatInt } from "@/lib/utils";
import { AnalysesTable } from "./AnalysesTable";
import { ConsumablesTable } from "./ConsumablesTable";
import { IssueSummary } from "./IssueSummary";
import { SourceAndMode } from "./SourceAndMode";

type Feedback = { message: string; ok: boolean } | null;

/* Référence stable : un littéral `{}` recréé à chaque rendu invaliderait le
   useMemo des totaux en permanence. */
const NO_OVERRIDES: Record<number, number> = {};

export function IssuesWorkspace({ data }: { data: IssueWorkspaceData }) {
  const [mode, setMode] = useState<IssueMode>("automatic");
  const [overrides, setOverrides] = useState<Record<number, number>>({});
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [pending, start] = useTransition();

  const quantities = mode === "manual" ? overrides : NO_OVERRIDES;

  const totals = useMemo(() => {
    const effective = (productId: number, fallback: number) =>
      quantities[productId] ?? fallback;

    const totalQuantity = data.consumables.reduce(
      (sum, row) => sum + effective(row.product_id, row.required_quantity),
      0
    );
    const ready =
      data.analyses.length > 0 &&
      data.consumables.length > 0 &&
      data.consumables.every(
        (row) =>
          effective(row.product_id, row.required_quantity) <= row.stock_available
      );

    return {
      totalAnalyses: data.analyses.length,
      totalSamples: data.analyses.reduce((sum, row) => sum + row.sample_count, 0),
      totalReferences: data.consumables.length,
      totalQuantity,
      ready,
    };
  }, [data, quantities]);

  function handleIssue() {
    setFeedback(null);
    start(async () => {
      const payload =
        mode === "manual"
          ? data.consumables.map((row) => ({
              product_id: row.product_id,
              quantity: overrides[row.product_id] ?? row.required_quantity,
            }))
          : [];

      const result = await issueStock(mode, payload);
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") setOverrides({});
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3">
        <SourceAndMode
          mode={mode}
          onModeChange={setMode}
          lastSync={data.lastSync}
          onMessage={(message, ok) => setFeedback({ message, ok })}
        />

        <AnalysesTable analyses={data.analyses} />

        <ConsumablesTable
          consumables={data.consumables}
          mode={mode}
          quantities={quantities}
          onQuantityChange={(productId, quantity) =>
            setOverrides((current) => ({ ...current, [productId]: quantity }))
          }
        />

        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            4. Validation de la sortie
          </h2>

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Trait label="Calcul des consommables" value="Coefficients par analyse" />
            <Trait
              label="Déduction du stock"
              value={mode === "automatic" ? "Immédiate" : "Après validation"}
            />
            <Trait label="Lots consommés" value="FEFO, en cascade" />
            <Trait label="Traçabilité" value="Mouvement + historique" />
          </div>

          {feedback ? (
            <p
              role="status"
              className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{
                color: feedback.ok ? "var(--good)" : "var(--critical)",
                background: `color-mix(in srgb, ${
                  feedback.ok ? "var(--good)" : "var(--critical)"
                } 10%, transparent)`,
              }}
            >
              {feedback.ok ? (
                <CheckCircle2 size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
              ) : (
                <TriangleAlert size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
              )}
              {feedback.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            {mode === "manual" ? (
              <button
                type="button"
                onClick={() => setOverrides({})}
                className="card flex items-center gap-2 px-3.5 py-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
              >
                <RotateCcw size={13} aria-hidden />
                Réinitialiser les quantités
              </button>
            ) : null}

            <button
              type="button"
              onClick={handleIssue}
              disabled={pending || !totals.ready}
              title={
                totals.ready
                  ? undefined
                  : "Importez des analyses et assurez-vous que le stock suffit."
              }
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              <ShieldCheck size={13} aria-hidden />
              {pending
                ? "Déduction…"
                : mode === "automatic"
                  ? `Déduire ${formatInt(totals.totalQuantity)} unités`
                  : `Valider et déduire ${formatInt(totals.totalQuantity)} unités`}
            </button>
          </div>

          <p className="mt-2 text-right text-[9px] leading-relaxed text-[var(--text-muted)]">
            La déduction reste déclenchée par l&apos;opérateur, y compris en mode
            automatique : elle modifie le stock et doit rester un acte explicite.
          </p>
        </section>
      </div>

      <IssueSummary
        mode={mode}
        totals={totals}
        coefficients={data.coefficients}
        history={data.history}
      />
    </div>
  );
}

function Trait({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-[var(--border)] px-2.5 py-2">
      <CheckCircle2
        size={13}
        strokeWidth={2.4}
        className="shrink-0"
        style={{ color: "var(--good)" }}
        aria-hidden
      />
      <span className="min-w-0 text-[10px] text-[var(--text-muted)]">
        {label} :{" "}
        <span className="font-medium text-[var(--text-primary)]">{value}</span>
      </span>
    </div>
  );
}
