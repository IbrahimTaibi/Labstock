"use client";

import { useState } from "react";
import { Loader2, PencilLine, Star, X } from "lucide-react";
import { saveEvaluation } from "@/app/(app)/suppliers/actions";
import type { SupplierState } from "@/app/(app)/suppliers/actions";
import { cn, formatInt } from "@/lib/utils";
import type { SupplierEvaluation, SupplierReceipt } from "@/lib/types";

export type PerformancePeriod = "month" | "quarter" | "year";

const PERIODS: { value: PerformancePeriod; label: string; months: number }[] = [
  { value: "month", label: "Ce mois", months: 1 },
  { value: "quarter", label: "3 derniers mois", months: 3 },
  { value: "year", label: "12 derniers mois", months: 12 },
];

const CRITERIA = [
  { key: "quality", label: "Qualité produits", color: "var(--good)" },
  { key: "delays", label: "Respect délais", color: "var(--warning)" },
  { key: "documents", label: "Conformité docs", color: "var(--good)" },
  { key: "service", label: "Service client", color: "var(--series-1)" },
  { key: "pricing", label: "Tarification", color: "var(--series-1)" },
] as const;

type CriterionKey = (typeof CRITERIA)[number]["key"];

const SCORES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

/** Retard toléré avant de compter une livraison en retard. */
const LATE_TOLERANCE_DAYS = 2;

function format1(n: number) {
  return n.toFixed(1).replace(".", ",");
}

export function ratingLabel(score: number) {
  if (score >= 4.5) return "Très satisfait";
  if (score >= 3.5) return "Satisfait";
  if (score >= 2.5) return "Moyen";
  return "Insuffisant";
}

/** Cinq étoiles remplies au dixième près. */
export function Stars({ value, size = 12 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-px" aria-label={`${format1(value)} sur 5`}>
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span key={i} className="relative inline-block" style={{ width: size, height: size }}>
            <Star size={size} strokeWidth={1.8} className="absolute inset-0 text-[var(--border)]" aria-hidden />
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <Star
                size={size}
                strokeWidth={1.8}
                style={{ color: "var(--warning)", fill: "var(--warning)" }}
                aria-hidden
              />
            </span>
          </span>
        );
      })}
    </span>
  );
}

/* Jauge demi-cercle : rouge → orange → vert, repère sur la note. */
function Gauge({ score }: { score: number | null }) {
  const cx = 90;
  const cy = 86;
  const r = 70;
  const point = (value: number) => {
    const angle = Math.PI * (1 - (value - 1) / 4);
    return [cx + r * Math.cos(angle), cy - r * Math.sin(angle)];
  };
  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from);
    const [x2, y2] = point(to);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };
  const marker = score === null ? null : point(Math.max(1, Math.min(5, score)));

  return (
    <svg viewBox="0 0 180 100" className="w-full max-w-[200px]" aria-hidden>
      <path d={arc(1, 2.6)} fill="none" stroke="var(--critical)" strokeWidth={14} />
      <path d={arc(2.6, 3.8)} fill="none" stroke="var(--warning)" strokeWidth={14} />
      <path d={arc(3.8, 5)} fill="none" stroke="var(--good)" strokeWidth={14} />
      {marker ? (
        <circle cx={marker[0]} cy={marker[1]} r={8} fill="var(--surface)" stroke="var(--text-primary)" strokeWidth={3} />
      ) : null}
    </svg>
  );
}

function monthIso(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function EvaluationForm({
  supplierId,
  existing,
  onDone,
  onResult,
}: {
  supplierId: number;
  existing: SupplierEvaluation[];
  onDone: () => void;
  onResult: (result: SupplierState) => void;
}) {
  const [month, setMonth] = useState(monthIso(new Date()));
  const current = existing.find((e) => e.period.slice(0, 7) === month);
  const [scores, setScores] = useState<Record<CriterionKey, number>>(() => ({
    quality: current?.quality ?? 4,
    delays: current?.delays ?? 4,
    documents: current?.documents ?? 4,
    service: current?.service ?? 4,
    pricing: current?.pricing ?? 4,
  }));
  const [comment, setComment] = useState(current?.comment ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const result = await saveEvaluation({ supplier_id: supplierId, month, comment, ...scores });
    setSaving(false);
    onResult(result);
    if (result.status === "success") onDone();
  }

  return (
    <form onSubmit={submit} className="mt-3 flex flex-col gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold text-[var(--text-primary)]">Évaluer le fournisseur</span>
        <button type="button" onClick={onDone} className="rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--surface)]">
          <X size={13} aria-hidden />
          <span className="sr-only">Fermer</span>
        </button>
      </div>
      <label className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
        Mois évalué
        <input
          type="month"
          value={month}
          max={monthIso(new Date())}
          onChange={(e) => setMonth(e.target.value)}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] outline-none focus:border-[var(--series-1)]"
        />
      </label>
      {CRITERIA.map((c) => (
        <label key={c.key} className="flex items-center justify-between gap-2 text-[11px] text-[var(--text-secondary)]">
          {c.label}
          <select
            value={scores[c.key]}
            onChange={(e) => setScores((s) => ({ ...s, [c.key]: Number(e.target.value) }))}
            className="tnum h-8 w-20 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] outline-none focus:border-[var(--series-1)]"
          >
            {SCORES.map((n) => (
              <option key={n} value={n}>
                {format1(n)}
              </option>
            ))}
          </select>
        </label>
      ))}
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        placeholder="Commentaire (facultatif)"
        rows={2}
        className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[11px] outline-none focus:border-[var(--series-1)]"
      />
      <button
        type="submit"
        disabled={saving}
        className="flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
        style={{ background: "var(--series-1)" }}
      >
        {saving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : null}
        Enregistrer l&apos;évaluation
      </button>
    </form>
  );
}

/**
 * Performance du fournisseur sélectionné sur la période : note globale
 * (moyenne des évaluations), détail par critère, et bilan des livraisons
 * tiré des réceptions.
 */
export function SupplierPerformance({
  supplierId,
  supplierName,
  evaluations,
  receipts,
  onResult,
}: {
  supplierId: number | null;
  supplierName: string | null;
  evaluations: SupplierEvaluation[];
  receipts: SupplierReceipt[];
  onResult: (result: SupplierState) => void;
}) {
  const [period, setPeriod] = useState<PerformancePeriod>("month");
  const [editing, setEditing] = useState(false);

  const months = PERIODS.find((p) => p.value === period)?.months ?? 1;
  const start = new Date();
  start.setDate(1);
  start.setMonth(start.getMonth() - (months - 1));
  const startIso = `${monthIso(start)}-01`;

  const own = supplierId === null ? [] : evaluations.filter((e) => e.supplier_id === supplierId);
  const inPeriod = own.filter((e) => e.period >= startIso);
  /* Sans évaluation sur la période, on retombe sur la dernière connue. */
  const basis = inPeriod.length > 0 ? inPeriod : own.slice(0, 1);
  const average = (key: CriterionKey | "score") =>
    basis.length === 0 ? null : basis.reduce((sum, e) => sum + e[key], 0) / basis.length;
  const score = average("score");

  const ownReceipts = supplierId === null ? [] : receipts.filter((r) => r.supplier_id === supplierId);
  const periodReceipts = ownReceipts.filter((r) => r.received_at.slice(0, 10) >= startIso);
  const delivered = periodReceipts.filter((r) => !r.reversed);
  const late = delivered.filter((r) => {
    if (!r.expected_date) return false;
    const limit = new Date(`${r.expected_date}T23:59:59`);
    limit.setDate(limit.getDate() + LATE_TOLERANCE_DAYS);
    return new Date(r.received_at) > limit;
  }).length;
  const cancelled = periodReceipts.length - delivered.length;

  return (
    <section className="card flex flex-col p-4">
      <header className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
          Performance du fournisseur
        </h2>
        <select
          value={period}
          onChange={(e) => setPeriod(e.target.value as PerformancePeriod)}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] font-medium outline-none focus:border-[var(--series-1)]"
        >
          {PERIODS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </header>

      {supplierId === null ? (
        <p className="grid flex-1 place-items-center py-10 text-center text-[11px] text-[var(--text-muted)]">
          Sélectionnez un fournisseur dans la liste pour voir sa performance.
        </p>
      ) : (
        <>
          <p className="mb-2 truncate text-[10px] text-[var(--text-muted)]">
            {supplierName}
            {inPeriod.length === 0 && own.length > 0
              ? ` — dernière évaluation : ${new Date(own[0].period).toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}`
              : ""}
          </p>
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-3">
            <div className="flex flex-col items-center">
              <div className="relative w-full max-w-[200px]">
                <Gauge score={score} />
                <div className="absolute inset-x-0 bottom-0 text-center">
                  <span className="tnum block text-[22px] font-extrabold leading-none text-[var(--text-primary)]">
                    {score === null ? "—" : format1(score)}
                    <span className="text-[13px] font-semibold text-[var(--text-secondary)]"> / 5</span>
                  </span>
                </div>
              </div>
              {score === null ? (
                <span className="mt-1 text-[10px] text-[var(--text-muted)]">Non évalué</span>
              ) : (
                <>
                  <span className="mt-1 text-[11px] font-semibold" style={{ color: "var(--good)" }}>
                    {ratingLabel(score)}
                  </span>
                  <Stars value={score} size={14} />
                </>
              )}
            </div>
            <ul className="flex flex-col gap-1.5">
              {CRITERIA.map((c) => {
                const value = average(c.key);
                return (
                  <li key={c.key} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="flex items-center gap-1.5 text-[var(--text-secondary)]">
                      <span className="h-2 w-2 rounded-full" style={{ background: c.color }} aria-hidden />
                      {c.label}
                    </span>
                    <span className="tnum font-semibold text-[var(--text-primary)]">
                      {value === null ? "—" : format1(value)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="mt-4 grid grid-cols-4 divide-x divide-[var(--border)] rounded-lg border border-[var(--border)] text-center">
            {[
              { label: "Livraisons totales", value: delivered.length, color: "var(--text-primary)" },
              { label: "Livraisons à temps", value: delivered.length - late, color: "var(--good)" },
              { label: "Retards > 48h", value: late, color: "var(--critical)" },
              { label: "Réceptions annulées", value: cancelled, color: "var(--serious)" },
            ].map((item) => (
              <div key={item.label} className="px-1 py-2">
                <span className="block text-[9px] leading-tight" style={{ color: item.color }}>
                  {item.label}
                </span>
                <span className="tnum block text-[18px] font-bold" style={{ color: item.color }}>
                  {formatInt(item.value)}
                </span>
              </div>
            ))}
          </div>

          {editing ? (
            <EvaluationForm
              key={supplierId}
              supplierId={supplierId}
              existing={own}
              onDone={() => setEditing(false)}
              onResult={onResult}
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={cn(
                "mt-3 flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-[11px] font-semibold text-[var(--series-1)] hover:bg-[var(--page)]"
              )}
            >
              <PencilLine size={13} strokeWidth={2.2} aria-hidden />
              Évaluer ce fournisseur
            </button>
          )}
        </>
      )}
    </section>
  );
}
