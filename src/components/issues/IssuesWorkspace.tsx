"use client";

import { useMemo, useState, useTransition } from "react";
import {
  CheckCircle2,
  Printer,
  RotateCcw,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
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
          sources={data.sources}
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
            4. Mode de sortie et action
          </h2>

          <div className="mb-3 grid grid-cols-1 gap-2 lg:grid-cols-2">
            <ModeCard
              title="Mode automatique"
              active={mode === "automatic"}
              summary="Les consommables sont calculés depuis les coefficients et déduits en une seule opération."
              traits={[
                ["Calcul des consommables", "Automatique"],
                ["Déduction du stock", "Immédiate"],
                ["Enregistrement historique", "Automatique"],
                ["Traçabilité", "Mouvement + lots FEFO"],
              ]}
              footer="Aucun ajustement manuel des quantités n'est possible dans ce mode."
            />

            <ModeCard
              title="Mode manuel"
              active={mode === "manual"}
              summary="Vérifiez les consommables et les quantités : tout reste modifiable avant validation."
              traits={[
                ["Sélection des articles", "Manuelle"],
                ["Déduction du stock", "Après validation"],
                ["Enregistrement historique", "Après validation"],
                ["Traçabilité", "Mouvement + lots FEFO"],
              ]}
              actions={
                mode === "manual" ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setOverrides({})}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
                    >
                      <RotateCcw size={12} aria-hidden />
                      Réinitialiser les quantités
                    </button>
                    <a
                      href="/issues/preview"
                      target="_blank"
                      rel="noopener"
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-[10px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
                    >
                      <Printer size={12} aria-hidden />
                      Aperçu avant impression
                    </a>
                  </div>
                ) : null
              }
            />
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

          {/* §6.3 — la maquette annonce une déduction sans validation. Ce
              n'est pas ce que fait l'application, et l'écart doit être dit
              plutôt que masqué : modifier le stock reste un acte signé. */}
          <p
            className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[10px] leading-relaxed"
            style={{
              color: "var(--serious)",
              background: "color-mix(in srgb, var(--serious) 10%, transparent)",
            }}
          >
            <TriangleAlert
              size={13}
              strokeWidth={2.4}
              className="mt-px shrink-0"
              aria-hidden
            />
            <span>
              Le mode automatique porte sur le <strong>calcul</strong> des
              quantités, pas sur le déclenchement : la déduction et
              l&apos;écriture de l&apos;historique restent lancées par
              l&apos;opérateur, dont le nom est enregistré. Un stock qui
              baisserait sans qu&apos;un humain l&apos;ait décidé serait
              intraçable au sens ISO 15189.
            </span>
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

/**
 * Carte de mode (§6). Les deux sont toujours affichées : celle du mode
 * retenu est active, l'autre reste lisible en retrait pour que l'opérateur
 * voie ce qu'il n'a pas choisi.
 */
function ModeCard({
  title,
  active,
  summary,
  traits,
  actions,
  footer,
}: {
  title: string;
  active: boolean;
  summary: string;
  traits: [string, string][];
  actions?: React.ReactNode;
  footer?: string;
}) {
  return (
    <article
      className="rounded-lg border p-3 transition-colors"
      style={
        active
          ? {
              borderColor: "var(--series-1)",
              background: "color-mix(in srgb, var(--series-1) 5%, transparent)",
            }
          : { borderColor: "var(--border)", opacity: 0.62 }
      }
    >
      <div className="mb-2 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold text-[var(--text-primary)]">
          {title}
        </h3>
        <span
          className="ml-auto rounded px-1.5 py-0.5 text-[9px] font-semibold"
          style={{
            color: active ? "var(--good)" : "var(--text-muted)",
            background: `color-mix(in srgb, ${
              active ? "var(--good)" : "var(--text-muted)"
            } 14%, transparent)`,
          }}
        >
          {active ? "Actif" : "En attente"}
        </span>
      </div>

      <p className="mb-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
        {summary}
      </p>

      <ul className="space-y-1">
        {traits.map(([label, value]) => (
          <li key={label} className="flex items-start gap-1.5 text-[10px]">
            <CheckCircle2
              size={11}
              strokeWidth={2.6}
              className="mt-px shrink-0"
              style={{ color: active ? "var(--good)" : "var(--text-muted)" }}
              aria-hidden
            />
            <span className="min-w-0 text-[var(--text-muted)]">
              {label} :{" "}
              <span className="font-medium text-[var(--text-primary)]">{value}</span>
            </span>
          </li>
        ))}
      </ul>

      {actions}

      {footer && active ? (
        <p className="mt-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
          {footer}
        </p>
      ) : null}
    </article>
  );
}
