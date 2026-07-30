"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ClipboardList,
  History,
  Info,
  Lock,
  PlayCircle,
  Scale,
  TriangleAlert,
} from "lucide-react";
import {
  closeSession,
  openSession,
  saveCount,
} from "@/app/(app)/inventory/actions";
import { summarizeCount } from "@/lib/inventory-summary";
import type { InventoryScope, InventoryWorkspaceData } from "@/lib/types";
import { formatAmount, formatDateTime, formatInt } from "@/lib/utils";
import { CountTable } from "./CountTable";

type Feedback = { message: string; ok: boolean } | null;

export function InventoryWorkspace({ data }: { data: InventoryWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [scope, setScope] = useState<InventoryScope>("category");
  const [categoryId, setCategoryId] = useState<string>("");
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [confirmClose, setConfirmClose] = useState(false);

  const session = data.openSession;
  const totals = summarizeCount(data.lines);

  function run(action: () => Promise<{ status: string; message: string }>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    });
  }

  function commitCount(lineId: number, raw: string) {
    const trimmed = raw.trim();
    if (trimmed === "") return;
    const value = Number.parseInt(trimmed, 10);
    if (!Number.isInteger(value) || value < 0) {
      setFeedback({
        message: "La quantité comptée doit être un entier positif ou nul.",
        ok: false,
      });
      return;
    }

    const line = data.lines.find((row) => row.id === lineId);
    if (line && line.counted_qty === value) return;

    start(async () => {
      const result = await saveCount(lineId, value);
      if (result.status === "error") {
        setFeedback({ message: result.message, ok: false });
      } else {
        setDrafts((current) => {
          const next = { ...current };
          delete next[lineId];
          return next;
        });
        router.refresh();
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_310px]">
      <div className="flex min-w-0 flex-col gap-3">
        {/* Ouverture / état de la session */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            1. Session de comptage
          </h2>

          {session ? (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2.5">
              <span className="flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]">
                <PlayCircle
                  size={15}
                  strokeWidth={2.2}
                  style={{ color: "var(--good)" }}
                  aria-hidden
                />
                {session.reference}
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                Périmètre :{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {session.scope === "full" ? "Tout le stock" : "Une catégorie"}
                </span>
              </span>
              <span className="text-[10px] text-[var(--text-muted)]">
                Ouvert par{" "}
                <span className="font-medium text-[var(--text-primary)]">
                  {session.opened_by}
                </span>{" "}
                le{" "}
                <span className="tnum font-medium text-[var(--text-primary)]">
                  {formatDateTime(session.opened_at)}
                </span>
              </span>
              <span className="ml-auto text-[10px] text-[var(--text-muted)]">
                Avancement :{" "}
                <span className="tnum font-semibold text-[var(--text-primary)]">
                  {formatInt(totals.counted)} / {formatInt(totals.total)}
                </span>
              </span>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,220px)_auto] sm:items-end">
              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                  Périmètre du comptage
                </span>
                <select
                  value={scope}
                  onChange={(event) => setScope(event.target.value as InventoryScope)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--series-1)]"
                >
                  <option value="category">Une catégorie</option>
                  <option value="full">Tout le stock</option>
                </select>
              </label>

              <label className="block">
                <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                  Catégorie
                </span>
                <select
                  value={categoryId}
                  disabled={scope === "full"}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--series-1)] disabled:bg-[var(--page)] disabled:text-[var(--text-muted)]"
                >
                  <option value="">Sélectionner…</option>
                  {data.categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                disabled={pending || (scope === "category" && !categoryId)}
                onClick={() =>
                  run(() =>
                    openSession(
                      scope,
                      scope === "category" ? Number(categoryId) : null
                    )
                  )
                }
                className="flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                style={{ background: "var(--series-1)" }}
              >
                <PlayCircle size={14} aria-hidden />
                {pending ? "Ouverture…" : "Ouvrir un comptage"}
              </button>
            </div>
          )}

          <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
            <Info
              size={13}
              strokeWidth={2.2}
              className="mt-px shrink-0"
              style={{ color: "var(--series-1)" }}
              aria-hidden
            />
            <span>
              À l&apos;ouverture, la quantité attendue de chaque lot est figée. Les
              écarts se mesurent donc contre cette photographie, et non contre un
              stock qui continuerait de bouger pendant le comptage.
            </span>
          </p>

          {feedback ? (
            <p
              role="status"
              className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{
                color: feedback.ok ? "var(--good)" : "var(--critical)",
                background: `color-mix(in srgb, ${
                  feedback.ok ? "var(--good)" : "var(--critical)"
                } 10%, transparent)`,
              }}
            >
              {feedback.ok ? (
                <CheckCircle2
                  size={13}
                  strokeWidth={2.4}
                  className="mt-px shrink-0"
                  aria-hidden
                />
              ) : (
                <TriangleAlert
                  size={13}
                  strokeWidth={2.4}
                  className="mt-px shrink-0"
                  aria-hidden
                />
              )}
              {feedback.message}
            </p>
          ) : null}
        </section>

        {session ? (
          <>
            <CountTable
              lines={data.lines}
              drafts={drafts}
              disabled={pending}
              onDraftChange={(lineId, value) =>
                setDrafts((current) => ({ ...current, [lineId]: value }))
              }
              onCommit={commitCount}
            />

            <section className="card p-4">
              <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                2. Clôture et régularisation
              </h2>

              <p className="mb-3 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                La clôture aligne chaque lot compté sur la quantité vue et écrit un
                mouvement de régularisation.{" "}
                {totals.remaining > 0 ? (
                  <span style={{ color: "var(--serious)" }}>
                    {formatInt(totals.remaining)} ligne
                    {totals.remaining > 1 ? "s" : ""} non comptée
                    {totals.remaining > 1 ? "s" : ""} — elle
                    {totals.remaining > 1 ? "s" : ""} resteront inchangée
                    {totals.remaining > 1 ? "s" : ""}, un lot non vu n&apos;étant pas
                    un lot absent.
                  </span>
                ) : (
                  "Toutes les lignes ont été comptées."
                )}
              </p>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {confirmClose ? (
                  <>
                    <span className="mr-auto text-[11px] font-medium text-[var(--text-primary)]">
                      Clôturer définitivement {session.reference} ?
                    </span>
                    <button
                      type="button"
                      onClick={() => setConfirmClose(false)}
                      className="card px-3.5 py-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
                    >
                      Annuler
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setConfirmClose(false);
                        run(() => closeSession(session.id));
                      }}
                      className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      style={{ background: "var(--critical)" }}
                    >
                      <Lock size={13} aria-hidden />
                      {pending ? "Clôture…" : "Confirmer la clôture"}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={pending || totals.counted === 0}
                    onClick={() => setConfirmClose(true)}
                    title={
                      totals.counted === 0
                        ? "Comptez au moins une ligne."
                        : undefined
                    }
                    className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "var(--series-1)" }}
                  >
                    <Lock size={13} aria-hidden />
                    Clôturer le comptage
                  </button>
                )}
              </div>
            </section>
          </>
        ) : null}
      </div>

      {/* Colonne latérale */}
      <div className="flex flex-col gap-3">
        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Scale size={13} aria-hidden />
            Écarts constatés
          </h2>

          {session ? (
            <>
              <Row label="Lots à compter">{formatInt(totals.total)}</Row>
              <Row label="Comptés">{formatInt(totals.counted)}</Row>
              <Row label="Reste">{formatInt(totals.remaining)}</Row>
              <Row label="Lignes avec écart">
                <span
                  style={{
                    color: totals.discrepancies ? "var(--serious)" : "var(--good)",
                  }}
                >
                  {formatInt(totals.discrepancies)}
                </span>
              </Row>
              <Row label="Manquants (valeur)">
                <span style={{ color: "var(--critical)" }}>
                  {totals.shrinkage < 0
                    ? `− ${formatAmount(Math.abs(totals.shrinkage))} DT`
                    : "—"}
                </span>
              </Row>
              <Row label="Surplus (valeur)">
                <span style={{ color: "var(--serious)" }}>
                  {totals.surplus > 0
                    ? `+ ${formatAmount(totals.surplus)} DT`
                    : "—"}
                </span>
              </Row>
              <Row label="Écart net">
                <span
                  style={{
                    color:
                      totals.varianceValue < 0
                        ? "var(--critical)"
                        : totals.varianceValue > 0
                          ? "var(--serious)"
                          : "var(--good)",
                  }}
                >
                  {totals.varianceValue === 0
                    ? "0 DT"
                    : `${totals.varianceValue > 0 ? "+" : "−"} ${formatAmount(
                        Math.abs(totals.varianceValue)
                      )} DT`}
                </span>
              </Row>
            </>
          ) : (
            <p className="py-3 text-center text-[10px] leading-relaxed text-[var(--text-muted)]">
              Ouvrez un comptage pour mesurer
              <br />
              l&apos;écart avec le stock théorique.
            </p>
          )}
        </aside>

        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <ClipboardList size={13} aria-hidden />
            Pourquoi des écarts ?
          </h2>
          <ul className="space-y-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">
            <li>• Casse, renversement, péremption jetée sans saisie</li>
            <li>• Contrôles qualité et calibrations, hors analyses patients</li>
            <li>• Analyses refaites, réactif amorcé deux fois</li>
            <li>• Erreurs de saisie à la réception</li>
          </ul>
          <p className="mt-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
            Les sorties calculées depuis les analyses ne couvrent que la
            consommation théorique : ce comptage est ce qui la ramène au réel.
          </p>
        </aside>

        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <History size={13} aria-hidden />
            Comptages clôturés
          </h2>
          {data.history.length === 0 ? (
            <p className="py-3 text-center text-[10px] text-[var(--text-muted)]">
              Aucun comptage clôturé.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.history.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-[var(--border)] pb-1.5 text-[10px] last:border-0 last:pb-0"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {entry.reference}
                    </span>
                    <span
                      className="tnum font-medium"
                      style={{
                        color:
                          entry.variance_units < 0
                            ? "var(--critical)"
                            : entry.variance_units > 0
                              ? "var(--serious)"
                              : "var(--good)",
                      }}
                    >
                      {entry.variance_units > 0 ? "+" : ""}
                      {formatInt(entry.variance_units)} u.
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[var(--text-muted)]">
                    <span>{formatInt(entry.counted_lines)} lignes</span>
                    <span className="tnum">
                      {entry.closed_at ? formatDateTime(entry.closed_at) : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[7px] text-[11px] last:border-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="tnum min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}
