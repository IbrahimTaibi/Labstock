"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  CircleCheck,
  CircleX,
  ClipboardList,
  Clock,
  FileSpreadsheet,
  FileText,
  Info,
  Loader2,
  Lock,
  Pencil,
  PlusCircle,
  Printer,
  Save,
  Search,
  ShieldCheck,
  Star,
  Trash2,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  deleteEvaluation,
  saveEvaluation,
  type EvaluationState,
} from "@/app/(app)/satisfaction/actions";
import { Donut } from "@/components/Donut";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { Pagination } from "@/components/Pagination";
import {
  DELAY_CAUSE_OPTIONS,
  QUALITY_OPTIONS,
  REMARK_OPTIONS,
  autoScore,
  delayBetween,
  evaluationStats,
  suggestedRemark,
} from "@/lib/satisfaction-stats";
import { cn, formatDate, formatInt, formatPercent } from "@/lib/utils";
import type { DeliveryEvaluation, SatisfactionData } from "@/lib/types";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:opacity-60";

const today = () => new Date().toISOString().slice(0, 10);

function formatScore(n: number) {
  return n.toFixed(1).replace(".", ",");
}

type Form = {
  orderId: number | "";
  expected: string;
  delivered: string;
  conforming: boolean;
  quality: string;
  /** Nulle tant qu'on n'y a pas touché : la remarque suit alors le retard. */
  remark: string | null;
  cause: string;
  comment: string;
  /** Nulle tant qu'on n'y a pas touché : la note suit alors le score. */
  rating: number | null;
};

const emptyForm = (): Form => ({
  orderId: "",
  expected: "",
  delivered: today(),
  conforming: true,
  quality: QUALITY_OPTIONS[0],
  remark: null,
  cause: "",
  comment: "",
  rating: null,
});

function formFromEvaluation(e: DeliveryEvaluation): Form {
  return {
    orderId: e.order_id,
    expected: e.expected_date,
    delivered: e.delivered_date,
    conforming: e.conforming,
    quality: e.quality,
    remark: e.remark,
    cause: e.delay_cause ?? "",
    comment: e.comment ?? "",
    rating: e.rating,
  };
}

export function SatisfactionWorkspace({ data }: { data: SatisfactionData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<EvaluationState | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Form>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const orderById = useMemo(() => new Map(data.orders.map((o) => [o.id, o])), [data.orders]);
  const order = form.orderId === "" ? null : orderById.get(form.orderId) ?? null;

  const datesOk = /^\d{4}-\d{2}-\d{2}$/.test(form.expected) && /^\d{4}-\d{2}-\d{2}$/.test(form.delivered);
  const delay = datesOk ? delayBetween(form.expected, form.delivered) : 0;
  const score = autoScore(delay, form.conforming);
  const rating = form.rating ?? score;
  const remark = form.remark ?? suggestedRemark(delay, form.conforming);
  const canSave = !pending && order !== null && datesOk && form.quality !== "";

  /* À évaluer d'abord : c'est le travail qui reste à faire. */
  const orderOptions = useMemo(
    () => [
      ...data.orders.filter((o) => o.evaluation_id === null),
      ...data.orders.filter((o) => o.evaluation_id !== null),
    ],
    [data.orders]
  );

  /* §3 — indicateurs sur le fournisseur du B.C. ouvert, à défaut sur tous. */
  const [scope, setScope] = useState<"all" | "supplier">("all");
  const scoped =
    scope === "supplier" && order
      ? data.evaluations.filter((e) => e.supplier_id === order.supplier_id)
      : data.evaluations;
  const global = evaluationStats(data.evaluations);
  const stats = evaluationStats(scoped);

  const history = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data.evaluations;
    return data.evaluations.filter((e) =>
      [e.order_number, e.supplier, e.quality, e.remark, e.evaluated_by ?? ""].some((v) =>
        v.toLowerCase().includes(needle)
      )
    );
  }, [data.evaluations, search]);
  const pageCount = Math.max(1, Math.ceil(history.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = history.slice(current * pageSize, current * pageSize + pageSize);

  function openEvaluation(evaluation: DeliveryEvaluation) {
    setEditingId(evaluation.id);
    setForm(formFromEvaluation(evaluation));
    setConfirmDelete(false);
    setFeedback(null);
  }

  function chooseOrder(value: string) {
    if (value === "") {
      setForm(emptyForm());
      setEditingId(null);
      return;
    }
    const picked = orderById.get(Number(value));
    if (!picked) return;
    /* Un B.C. déjà évalué s'ouvre sur son évaluation plutôt que d'en
       commencer une seconde que la base refuserait. */
    const existing = data.evaluations.find((e) => e.order_id === picked.id);
    if (existing) {
      openEvaluation(existing);
      return;
    }
    setEditingId(null);
    setForm({
      ...emptyForm(),
      orderId: picked.id,
      expected: picked.expected_date ?? picked.order_date,
      delivered: picked.delivered_date ?? today(),
    });
  }

  function startNew() {
    setEditingId(null);
    setForm(emptyForm());
    setConfirmDelete(false);
    setFeedback(null);
  }

  function save() {
    if (!order) return;
    setFeedback(null);
    start(async () => {
      const result = await saveEvaluation({
        id: editingId,
        orderId: order.id,
        expectedDate: form.expected,
        deliveredDate: form.delivered,
        conforming: form.conforming,
        quality: form.quality,
        remark,
        delayCause: delay > 0 ? form.cause || null : null,
        rating,
        comment: form.comment || null,
      });
      setFeedback(result);
      if (result.status === "success") {
        if (result.evaluationId) setEditingId(result.evaluationId);
        router.refresh();
      }
    });
  }

  function remove() {
    if (editingId === null) return;
    setFeedback(null);
    start(async () => {
      const result = await deleteEvaluation(editingId);
      setFeedback(result);
      setConfirmDelete(false);
      if (result.status === "success") {
        startNew();
        setFeedback(result);
        router.refresh();
      }
    });
  }

  const sectionTitle = "text-[12px] font-bold uppercase tracking-wide text-[var(--text-primary)]";
  const barButton =
    "flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
  const total = data.orders.length;

  return (
    <>
      {/* ------------------------------------------------ Cartes */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Nombre total de B.C."
          value={formatInt(total)}
          note="Bons de commande"
          color="var(--series-1)"
          icon={<ClipboardList size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="B.C. évalués"
          value={formatInt(global.count)}
          note={`${formatPercent(total === 0 ? 0 : (global.count / total) * 100)} des B.C.`}
          color="var(--series-1)"
          icon={<CheckCircle2 size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Conformes"
          value={formatInt(global.conforming)}
          note={`${formatPercent(global.conformityRate * 100)} des évaluations`}
          color="var(--good)"
          icon={<CircleCheck size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Non conformes"
          value={formatInt(global.nonConforming)}
          note={`${formatPercent(global.count === 0 ? 0 : (1 - global.conformityRate) * 100)} des évaluations`}
          color="var(--critical)"
          icon={<CircleX size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Note moyenne globale"
          value={`${formatScore(global.avgRating)} / 5`}
          note="Performance fournisseurs"
          color="var(--series-1)"
          icon={<Star size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Délai moyen global"
          value={`${formatScore(global.avgDelay)} jours`}
          note="Retard moyen des livraisons"
          color="var(--series-2)"
          icon={<Clock size={18} strokeWidth={2.2} aria-hidden />}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-3">
          {feedback ? (
            <div
              role="status"
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
              style={{ color: feedback.status === "success" ? "var(--good)" : "var(--critical)" }}
            >
              {feedback.status === "success" ? (
                <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden />
              ) : (
                <XCircle size={14} strokeWidth={2.2} aria-hidden />
              )}
              {feedback.message}
              <button
                type="button"
                onClick={() => setFeedback(null)}
                className="ml-auto rounded p-0.5 text-[var(--text-muted)] hover:bg-[var(--page)]"
              >
                <X size={12} strokeWidth={2.2} aria-hidden />
                <span className="sr-only">Fermer</span>
              </button>
            </div>
          ) : null}

          {/* ------------------------------- 1. Bon de commande */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionTitle}>1. Information du bon de commande</h2>
              {editingId !== null ? (
                <span
                  className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                  style={{
                    color: "var(--series-1)",
                    background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
                  }}
                >
                  Évaluation existante — modification
                </span>
              ) : null}
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="N° Bon de commande" required>
                <select
                  value={form.orderId}
                  onChange={(event) => chooseOrder(event.target.value)}
                  className={cn(INPUT_CLASS, "tnum font-semibold")}
                >
                  <option value="">— Choisir —</option>
                  {orderOptions.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.number} · {o.supplier}
                      {o.evaluation_id !== null
                        ? " ✓ évalué"
                        : o.delivered_date === null
                          ? " (non réceptionné)"
                          : ""}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Fournisseur">
                <ReadOnly value={order?.supplier ?? "—"} />
              </Field>
              <Field label="Date de lancement">
                <ReadOnly value={order ? formatDate(order.order_date) : "—"} icon />
              </Field>
              <Field label="Retard (jours)">
                <ReadOnly
                  value={order && datesOk ? formatInt(delay) : "—"}
                  color={delay > 0 ? "var(--critical)" : undefined}
                />
              </Field>
              <Field label="Date de livraison prévue" required>
                <input
                  type="date"
                  value={form.expected}
                  disabled={!order}
                  onChange={(event) => setForm({ ...form, expected: event.target.value })}
                  className={cn(INPUT_CLASS, "tnum font-semibold")}
                />
              </Field>
              <Field label="Date de livraison réelle" required>
                <input
                  type="date"
                  value={form.delivered}
                  disabled={!order}
                  onChange={(event) => setForm({ ...form, delivered: event.target.value })}
                  className={cn(INPUT_CLASS, "tnum font-semibold")}
                />
              </Field>
              <Field label="Évaluation">
                <div className="flex h-10 items-center">
                  <Stars value={order ? rating : 0} />
                </div>
              </Field>
              <Field label="Score">
                <ReadOnly value={order ? `${formatScore(rating)} / 5` : "—"} />
              </Field>
            </div>
            {order && order.delivered_date === null && editingId === null ? (
              <p className="mt-2 flex items-center gap-1.5 text-[10px]" style={{ color: "var(--warning)" }}>
                <TriangleAlert size={12} strokeWidth={2.4} aria-hidden />
                Aucune réception enregistrée pour ce B.C. : saisissez la date de livraison réelle.
              </p>
            ) : null}
          </section>

          {/* ------------------------------- 2. Historique */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionTitle}>2. Historique des évaluations</h2>
              <div className="relative">
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Rechercher dans l'historique…"
                  aria-label="Rechercher une évaluation"
                  className={cn(INPUT_CLASS, "h-9 w-[240px] pr-8 text-[11px]")}
                />
                <Search
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
              </div>
            </div>

            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[1080px] border-collapse text-[11px]">
                <thead style={{ background: "var(--text-primary)" }}>
                  <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                    <th className="rounded-l-lg px-2 py-2.5">Date de lancement</th>
                    <th className="px-2 py-2.5">N° BC</th>
                    <th className="px-2 py-2.5">Fournisseur</th>
                    <th className="px-2 py-2.5">Date prévue</th>
                    <th className="px-2 py-2.5">Date réelle</th>
                    <th className="px-2 py-2.5 text-right">Retard (j)</th>
                    <th className="px-2 py-2.5">Conforme</th>
                    <th className="px-2 py-2.5">Qualité</th>
                    <th className="px-2 py-2.5">Évaluation</th>
                    <th className="px-2 py-2.5 text-right">Score</th>
                    <th className="px-2 py-2.5">Évalué par</th>
                    <th className="rounded-r-lg px-2 py-2.5">Remarque</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={12} className="py-8 text-center text-[var(--text-muted)]">
                        {data.evaluations.length === 0
                          ? "Aucune évaluation enregistrée : choisissez un B.C. ci-dessus pour commencer."
                          : "Aucune évaluation ne correspond."}
                      </td>
                    </tr>
                  ) : (
                    rows.map((e) => (
                      <tr
                        key={e.id}
                        onClick={() => openEvaluation(e)}
                        aria-selected={e.id === editingId}
                        className={cn(
                          "cursor-pointer border-b border-[var(--border)] hover:bg-[var(--page)]",
                          e.id === editingId &&
                            "bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)]"
                        )}
                      >
                        <td className="tnum px-2 py-2.5">{formatDate(e.order_date)}</td>
                        <td className="tnum whitespace-nowrap px-2 py-2.5 font-semibold">{e.order_number}</td>
                        <td className="max-w-[140px] truncate px-2 py-2.5">{e.supplier}</td>
                        <td className="tnum px-2 py-2.5">{formatDate(e.expected_date)}</td>
                        <td className="tnum px-2 py-2.5">{formatDate(e.delivered_date)}</td>
                        <td
                          className="tnum px-2 py-2.5 text-right font-semibold"
                          style={{ color: e.delay_days > 0 ? "var(--critical)" : undefined }}
                        >
                          {formatInt(e.delay_days)}
                        </td>
                        <td
                          className="px-2 py-2.5 font-semibold"
                          style={{ color: e.conforming ? "var(--good)" : "var(--critical)" }}
                        >
                          {e.conforming ? "Oui" : "Non"}
                        </td>
                        <td className="max-w-[140px] truncate px-2 py-2.5">{e.quality}</td>
                        <td className="px-2 py-2.5">
                          <Stars value={e.rating} size={12} />
                        </td>
                        <td className="tnum px-2 py-2.5 text-right font-semibold">
                          {formatScore(e.rating)}
                        </td>
                        <td className="max-w-[110px] truncate px-2 py-2.5">{e.evaluated_by ?? "—"}</td>
                        <td className="max-w-[150px] truncate px-2 py-2.5 text-[var(--text-secondary)]">
                          {e.remark}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={current}
              pageCount={pageCount}
              pageSize={pageSize}
              total={history.length}
              onPage={setPage}
              onPageSize={(size) => {
                setPageSize(size);
                setPage(0);
              }}
            />
          </section>

          {/* ------------------------------- 6. Détail */}
          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>6. Détail de l&apos;évaluation sélectionnée</h2>
            {!order ? (
              <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
                Choisissez un bon de commande, ou cliquez une évaluation de l&apos;historique.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Conforme" required>
                  <select
                    value={form.conforming ? "yes" : "no"}
                    onChange={(event) => setForm({ ...form, conforming: event.target.value === "yes" })}
                    className={cn(INPUT_CLASS, "font-semibold")}
                    style={{ color: form.conforming ? "var(--good)" : "var(--critical)" }}
                  >
                    <option value="yes">Oui</option>
                    <option value="no">Non</option>
                  </select>
                </Field>
                <Field label="Qualité" required>
                  <select
                    value={form.quality}
                    onChange={(event) => setForm({ ...form, quality: event.target.value })}
                    className={INPUT_CLASS}
                  >
                    {withCurrent(QUALITY_OPTIONS, form.quality).map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Remarque" required>
                  <select
                    value={remark}
                    onChange={(event) => setForm({ ...form, remark: event.target.value })}
                    className={INPUT_CLASS}
                  >
                    {withCurrent(REMARK_OPTIONS, remark).map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Cause du retard">
                  <select
                    value={delay > 0 ? form.cause : ""}
                    disabled={delay <= 0}
                    onChange={(event) => setForm({ ...form, cause: event.target.value })}
                    className={INPUT_CLASS}
                  >
                    <option value="">{delay > 0 ? "— Non précisée —" : "Aucun retard"}</option>
                    {withCurrent(DELAY_CAUSE_OPTIONS, form.cause).map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Commentaire" className="sm:col-span-2">
                  <textarea
                    value={form.comment}
                    onChange={(event) => setForm({ ...form, comment: event.target.value })}
                    rows={2}
                    placeholder="Livraison reçue avec 1 jour de retard. Produits conformes et en bon état."
                    className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
                  />
                </Field>
                <Field label="Évaluation (note de 1 à 5)">
                  <div className="flex h-10 items-center gap-2">
                    <Stars
                      value={rating}
                      size={22}
                      onChange={(value) => setForm({ ...form, rating: value })}
                    />
                    {form.rating !== null && form.rating !== score ? (
                      <button
                        type="button"
                        onClick={() => setForm({ ...form, rating: null })}
                        className="text-[10px] font-semibold text-[var(--series-1)] hover:underline"
                      >
                        Reprendre le score
                      </button>
                    ) : null}
                  </div>
                </Field>
                <Field label="Score automatique">
                  <div className="flex h-10 items-center justify-between rounded-lg bg-[var(--page)] px-3">
                    <span className="tnum text-[14px] font-bold text-[var(--text-primary)]">
                      {formatScore(score)} / 5
                    </span>
                    <span
                      className="text-[10px] text-[var(--text-muted)]"
                      title="5, moins 1 à 3 points selon le retard (1–2 j, 3–5 j, > 5 j), moins 2 si non conforme"
                    >
                      <Info size={13} strokeWidth={2.2} aria-hidden />
                    </span>
                  </div>
                </Field>
                <Field label="Évalué par" className="lg:col-span-4">
                  <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                    {editingId !== null
                      ? data.evaluations.find((e) => e.id === editingId)?.evaluated_by ?? "—"
                      : data.operator || "—"}
                  </span>
                </Field>
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------ Panneau droit */}
        <aside className="space-y-3">
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
                3. Indicateurs de performance
              </h2>
              <select
                value={scope}
                onChange={(event) => setScope(event.target.value as "all" | "supplier")}
                aria-label="Périmètre des indicateurs"
                className="h-7 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-[10px] text-[var(--text-primary)]"
              >
                <option value="all">Tous les fournisseurs</option>
                <option value="supplier" disabled={!order}>
                  {order ? order.supplier : "Fournisseur du B.C."}
                </option>
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <Indicator label="B.C. à l'heure" value={formatInt(stats.onTime)} color="var(--good)" />
              <Indicator label="B.C. en retard" value={formatInt(stats.late)} color="var(--series-2)" />
              <Indicator label="Non conformes" value={formatInt(stats.nonConforming)} color="var(--critical)" />
              <Indicator label="Note moyenne" value={`${formatScore(stats.avgRating)}/5`} color="var(--warning)" />
              <Indicator label="Délai moyen (j)" value={formatScore(stats.avgDelay)} color="var(--series-1)" />
              <Indicator
                label="Taux de conformité"
                value={formatPercent(stats.conformityRate * 100)}
                color="var(--good)"
              />
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              4. Répartition des conformités
            </h2>
            <div className="flex items-center gap-3 [&>div]:mx-0 [&>div]:mb-0 [&>div]:shrink-0 [&>ul]:min-w-0 [&>ul]:flex-1">
              <Donut
                size={104}
                centerLabel="Évaluations"
                slices={[
                  { key: "ok", label: "Conformes", count: stats.conforming, color: "var(--good)" },
                  { key: "ko", label: "Non conformes", count: stats.nonConforming, color: "var(--critical)" },
                ].filter((slice) => slice.count > 0)}
              />
            </div>
          </section>

          <section className="card p-4">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              5. Répartition des retards{" "}
              <span className="font-semibold normal-case text-[var(--text-muted)]">(en jours)</span>
            </h2>
            <DelayBars buckets={stats.buckets} />
          </section>
        </aside>
      </div>

      {/* ---------------------------------------------- Barre d'actions */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <button
          type="button"
          disabled={editingId !== null || !canSave}
          onClick={save}
          title={editingId !== null ? "Évaluation existante : utilisez « Modifier »" : undefined}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-1)" }}
        >
          {pending && editingId === null ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Save size={16} strokeWidth={2.2} aria-hidden />
          )}
          Enregistrer l&apos;évaluation
        </button>
        <button
          type="button"
          onClick={startNew}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--good)" }}
        >
          <PlusCircle size={16} strokeWidth={2.2} aria-hidden />
          Ajouter / Nouvelle évaluation
        </button>
        <button
          type="button"
          disabled={editingId === null || !canSave}
          onClick={save}
          title={editingId === null ? "Ouvrez une évaluation de l'historique" : undefined}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-2)" }}
        >
          {pending && editingId !== null && !confirmDelete ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Pencil size={16} strokeWidth={2.2} aria-hidden />
          )}
          Modifier l&apos;évaluation
        </button>
        <button
          type="button"
          disabled={editingId === null || pending}
          onClick={() => (confirmDelete ? remove() : setConfirmDelete(true))}
          onBlur={() => setConfirmDelete(false)}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--critical)" }}
        >
          <Trash2 size={16} strokeWidth={2.2} aria-hidden />
          {confirmDelete ? "Confirmer ?" : "Supprimer l'évaluation"}
        </button>
        <a
          href="/satisfaction/print"
          target="_blank"
          rel="noreferrer"
          className={cn(barButton, "card text-[var(--text-primary)] hover:bg-[var(--page)] hover:opacity-100")}
        >
          <Printer size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Imprimer rapport
        </a>
        <ExportCsvButton
          kind="evaluations"
          label="Exporter (Excel)"
          icon={<FileSpreadsheet size={16} strokeWidth={2.2} style={{ color: "var(--good)" }} aria-hidden />}
          className={cn(barButton, "card text-[var(--text-primary)] hover:bg-[var(--page)] hover:opacity-100")}
        />
      </div>

      {/* --------------------------------------------- Bandeau qualité */}
      <div className="card mt-3 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Assurance
          icon={<ShieldCheck size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Conforme ISO 15189:2022"
          text="Suivi qualité des fournisseurs selon les exigences ISO 15189:2022."
        />
        <Assurance
          icon={<CheckCircle2 size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Traçabilité assurée"
          text="Chaque évaluation garde son auteur et les dates constatées."
        />
        <Assurance
          icon={<Lock size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Données sécurisées"
          text="Accès contrôlé selon les droits de chaque utilisateur."
        />
        <Assurance
          icon={<TriangleAlert size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-2)"
          title="Écarts signalés"
          text="Retards et non-conformités ressortent dans l'historique et les indicateurs."
        />
        <Assurance
          icon={<FileText size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Documents liés"
          text="Rapport imprimable en PDF et export Excel."
        />
      </div>
    </>
  );
}

/* Une valeur enregistrée hors de la liste (libellé retiré depuis) reste
   sélectionnable : sans cela, rouvrir l'évaluation l'effacerait. */
function withCurrent(options: string[], value: string) {
  return value && !options.includes(value) ? [value, ...options] : options;
}

function Stars({
  value,
  size = 16,
  onChange,
}: {
  value: number;
  size?: number;
  onChange?: (value: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? value;
  return (
    <span
      className="inline-flex items-center gap-0.5"
      role={onChange ? "radiogroup" : "img"}
      aria-label={onChange ? "Note de 1 à 5" : `${value} sur 5`}
      onMouseLeave={() => setHover(null)}
    >
      {[1, 2, 3, 4, 5].map((n) => {
        const star = (
          <Star
            size={size}
            strokeWidth={1.8}
            fill={n <= shown ? "var(--warning)" : "transparent"}
            style={{ color: n <= shown ? "var(--warning)" : "var(--text-muted)" }}
            aria-hidden
          />
        );
        return onChange ? (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} sur 5`}
            onMouseEnter={() => setHover(n)}
            onClick={() => onChange(n)}
            className="rounded p-0.5 hover:scale-110"
          >
            {star}
          </button>
        ) : (
          <span key={n}>{star}</span>
        );
      })}
    </span>
  );
}

function DelayBars({
  buckets,
}: {
  buckets: { key: string; label: string; color: string; count: number }[];
}) {
  const max = Math.max(1, ...buckets.map((b) => b.count));
  return (
    <div className="flex h-[150px] items-end gap-3 border-b border-[var(--border)] px-1">
      {buckets.map((bucket) => (
        <div key={bucket.key} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
          <span className="tnum text-[11px] font-bold text-[var(--text-primary)]">
            {formatInt(bucket.count)}
          </span>
          <div
            className="w-full max-w-[42px] rounded-t-md"
            style={{
              height: `${(bucket.count / max) * 100}%`,
              minHeight: bucket.count > 0 ? 4 : 0,
              background: bucket.color,
            }}
            title={`${bucket.label} : ${bucket.count}`}
          />
        </div>
      ))}
      <span className="sr-only">
        {buckets.map((b) => `${b.label} : ${b.count}`).join(", ")}
      </span>
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  color,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="card flex items-center gap-3 p-3.5">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-bold" style={{ color }}>
          {label}
        </div>
        <div className="tnum truncate text-[20px] font-bold leading-tight text-[var(--text-primary)]">
          {value}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">{note}</div>
      </div>
    </article>
  );
}

function Indicator({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="rounded-lg border border-[var(--border)] px-2 py-2 text-center">
      <div className="text-[9px] font-semibold leading-tight text-[var(--text-secondary)]">{label}</div>
      <div className="tnum mt-1 text-[16px] font-bold" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function ReadOnly({ value, icon, color }: { value: string; icon?: boolean; color?: string }) {
  return (
    <div
      className="tnum flex h-10 items-center justify-between rounded-lg bg-[var(--page)] px-3 text-[12px] font-semibold"
      style={{ color: color ?? "var(--text-primary)" }}
    >
      <span className="truncate">{value}</span>
      {icon ? (
        <CalendarDays size={14} strokeWidth={2} className="shrink-0 text-[var(--text-secondary)]" aria-hidden />
      ) : null}
    </div>
  );
}

function Assurance({
  icon,
  color,
  title,
  text,
}: {
  icon: React.ReactNode;
  color: string;
  title: string;
  text: string;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full"
        style={{ color, boxShadow: `inset 0 0 0 1.5px ${color}` }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-[11px] font-bold" style={{ color }}>
          {title}
        </div>
        <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">{text}</p>
      </div>
    </div>
  );
}
