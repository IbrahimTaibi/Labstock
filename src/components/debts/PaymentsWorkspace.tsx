"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CalendarDays,
  CheckCircle2,
  Clock,
  Eye,
  FileSpreadsheet,
  Info,
  List,
  Loader2,
  Printer,
  Receipt,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Store,
  Wallet,
  X,
} from "lucide-react";
import {
  recordPayment,
  reversePayment,
  suggestPaymentReference,
  type DebtState,
} from "@/app/(app)/debts/actions";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { DebtAgeing, DebtKpis } from "./DebtSummary";
import { cn, formatDate, formatDateTime, formatInt, formatTnd } from "@/lib/utils";
import type { DebtRow, DebtsWorkspaceData, PaymentMethod } from "@/lib/types";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "Virement",
  check: "Chèque",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
};

/* Lignes visibles avant « Voir tout l'historique ». */
const HISTORY_PREVIEW = 5;
const HISTORY_MAX = 50;

const today = () => new Date().toISOString().slice(0, 10);

function parseDecimal(raw: string) {
  return Number.parseFloat(raw.replace(/\s/g, "").replace(",", "."));
}

export function PaymentsWorkspace({
  data,
  initialKey,
}: {
  data: DebtsWorkspaceData;
  initialKey?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<DebtState | null>(null);

  const keyOf = (debt: DebtRow) => `${debt.source}:${debt.invoice_id}`;

  /* Seules les dettes avec un solde peuvent recevoir un règlement : la base
     refuse les autres (§10.6), autant ne pas les proposer. */
  const payable = useMemo(
    () => data.debts.filter((debt) => debt.balance > 0),
    [data.debts]
  );
  const creditors = useMemo(
    () =>
      [...new Set(payable.map((debt) => debt.creditor))].sort((a, b) =>
        a.localeCompare(b, "fr")
      ),
    [payable]
  );

  const [selectedKey, setSelectedKey] = useState<string>(() =>
    initialKey && payable.some((debt) => keyOf(debt) === initialKey)
      ? initialKey
      : ""
  );
  const selected = payable.find((debt) => keyOf(debt) === selectedKey) ?? null;
  /* Le fournisseur filtre la liste des factures ; choisir une facture le
     fixe en retour. */
  const [creditorFilter, setCreditorFilter] = useState<string>(
    () => selected?.creditor ?? ""
  );
  const invoiceOptions =
    creditorFilter === ""
      ? payable
      : payable.filter((debt) => debt.creditor === creditorFilter);

  const [form, setForm] = useState({
    method: "transfer" as PaymentMethod,
    amount: "",
    reference: "",
    paid_at: today(),
    note: "",
  });

  const [showAll, setShowAll] = useState(false);
  const [search, setSearch] = useState("");
  /* Règlement ouvert dans l'historique (œil) ou tout juste enregistré :
     c'est lui que « Imprimer reçu paiement » imprime. */
  const [paymentId, setPaymentId] = useState<number | null>(null);
  const [confirmReversal, setConfirmReversal] = useState(false);
  const [reversalReason, setReversalReason] = useState("");

  function reset() {
    setForm({
      method: "transfer",
      amount: "",
      reference: "",
      paid_at: today(),
      note: "",
    });
    setFeedback(null);
  }

  function selectInvoice(key: string) {
    setSelectedKey(key);
    const debt = payable.find((d) => keyOf(d) === key);
    if (debt) setCreditorFilter(debt.creditor);
    reset();
  }

  /* §7.1 — le panneau se recalcule à la frappe, avant toute validation. */
  const typed = parseDecimal(form.amount);
  const newPayment = Number.isFinite(typed) && typed > 0 ? typed : 0;
  const newBalance = selected ? selected.balance - newPayment : 0;
  const exceeds = selected ? newPayment > selected.balance + 0.0005 : false;

  const statusAfter = !selected
    ? null
    : newBalance <= 0.0005
      ? { label: "Payé intégralement", color: "var(--good)" }
      : newPayment > 0 || selected.amount_paid > 0
        ? { label: "Partiellement payé", color: "var(--good)" }
        : { label: "Non payé", color: "var(--text-muted)" };

  function suggestReference() {
    start(async () => {
      const { reference } = await suggestPaymentReference(
        form.method,
        form.paid_at
      );
      if (reference) setForm((previous) => ({ ...previous, reference }));
    });
  }

  function submit() {
    if (!selected) return;
    setFeedback(null);
    start(async () => {
      const result = await recordPayment({
        source: selected.source,
        invoiceId: selected.invoice_id,
        amount: newPayment,
        method: form.method,
        reference: form.reference || null,
        paidAt: form.paid_at,
        note: form.note || null,
      });
      if (result.status === "success") {
        reset();
        if (result.paymentId) setPaymentId(result.paymentId);
        router.refresh();
      }
      setFeedback(result);
    });
  }

  function submitReversal(id: number) {
    setFeedback(null);
    start(async () => {
      const result = await reversePayment(id, reversalReason || null);
      setFeedback(result);
      if (result.status === "success") {
        setConfirmReversal(false);
        setReversalReason("");
        router.refresh();
      }
    });
  }

  const history = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data.payments;
    return data.payments.filter(
      (payment) =>
        payment.invoice_number.toLowerCase().includes(needle) ||
        payment.creditor.toLowerCase().includes(needle) ||
        (payment.reference ?? "").toLowerCase().includes(needle)
    );
  }, [data.payments, search]);
  const visible = history.slice(0, showAll ? HISTORY_MAX : HISTORY_PREVIEW);
  const opened = data.payments.find((p) => p.payment_id === paymentId) ?? null;

  const sectionTitle =
    "mb-3 text-[12px] font-bold uppercase tracking-wide text-[var(--text-primary)]";
  const footerButton =
    "card flex h-11 flex-1 items-center justify-center gap-2 px-4 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--page)] disabled:cursor-not-allowed disabled:opacity-50";

  return (
    <>
      <DebtKpis totals={data.totals} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {feedback ? (
            <div
              role="status"
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
              style={{
                color:
                  feedback.status === "success" ? "var(--good)" : "var(--critical)",
              }}
            >
              <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden />
              {feedback.message}
              {feedback.status === "success" && feedback.paymentId ? (
                <a
                  href={`/debts/payments/${feedback.paymentId}/receipt`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold text-[var(--series-1)] hover:underline"
                >
                  Imprimer le reçu
                </a>
              ) : null}
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

          {/* --------------------------------------------- 1. Sélection */}
          <section className="card p-4 md:p-5">
            <h2 className={sectionTitle}>1. Sélection de la facture</h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_220px] lg:items-end">
              <Labeled label="Numéro de facture" required>
                <InvoicePicker
                  options={invoiceOptions}
                  selected={selected}
                  onSelect={(debt) => selectInvoice(debt ? keyOf(debt) : "")}
                />
              </Labeled>

              <Labeled label="Date facture">
                <div className="tnum flex h-10 items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 text-[12px] font-semibold text-[var(--text-primary)]">
                  {selected ? formatDate(selected.issue_date) : "—"}
                  <CalendarDays
                    size={15}
                    strokeWidth={2}
                    className="text-[var(--text-secondary)]"
                    aria-hidden
                  />
                </div>
              </Labeled>

              <Labeled label="Fournisseur">
                <select
                  value={creditorFilter}
                  onChange={(event) => {
                    setCreditorFilter(event.target.value);
                    if (selected && selected.creditor !== event.target.value) {
                      setSelectedKey("");
                      reset();
                    }
                  }}
                  className={cn(INPUT_CLASS, "font-semibold")}
                >
                  <option value="">Tous les fournisseurs</option>
                  {creditors.map((creditor) => (
                    <option key={creditor} value={creditor}>
                      {creditor}
                    </option>
                  ))}
                </select>
              </Labeled>

              <div
                className="flex flex-col justify-center rounded-lg px-4 py-2.5 text-[var(--surface)] sm:col-span-2 lg:col-span-1"
                style={{ background: "var(--text-primary)" }}
              >
                <span className="text-[10px] font-semibold opacity-85">
                  Solde actuel de la facture
                </span>
                <span className="tnum text-[20px] font-extrabold leading-tight">
                  {formatTnd(selected?.balance ?? 0)}{" "}
                  <span className="text-[11px] font-semibold">TND</span>
                </span>
              </div>
            </div>

            {payable.length === 0 ? (
              <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                Aucune facture en attente de règlement.
              </p>
            ) : null}
          </section>

          {/* ---------------------------------- 2. Informations paiement */}
          <section className="card p-4 md:p-5">
            <h2 className={sectionTitle}>2. Informations de paiement</h2>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Labeled label="Mode de paiement" required>
                <select
                  value={form.method}
                  disabled={!selected}
                  onChange={(event) =>
                    setForm({ ...form, method: event.target.value as PaymentMethod })
                  }
                  className={INPUT_CLASS}
                >
                  {(Object.keys(METHOD_LABEL) as PaymentMethod[]).map((method) => (
                    <option key={method} value={method}>
                      {METHOD_LABEL[method]}
                    </option>
                  ))}
                </select>
              </Labeled>

              <Labeled label="Montant payé (TND)" required>
                <input
                  inputMode="decimal"
                  value={form.amount}
                  disabled={!selected}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  onBlur={() => {
                    if (newPayment > 0) setForm((f) => ({ ...f, amount: formatTnd(newPayment) }));
                  }}
                  placeholder="0,000"
                  aria-invalid={exceeds}
                  className={cn(
                    INPUT_CLASS,
                    "tnum font-semibold",
                    exceeds && "border-[var(--critical)]"
                  )}
                />
              </Labeled>

              <Labeled label="Référence de paiement">
                <div className="relative">
                  <input
                    value={form.reference}
                    disabled={!selected}
                    onChange={(event) => setForm({ ...form, reference: event.target.value })}
                    placeholder="VIR-2026-0626-001"
                    className={cn(INPUT_CLASS, "tnum pr-10 font-semibold")}
                  />
                  <button
                    type="button"
                    onClick={suggestReference}
                    disabled={!selected || pending}
                    title="Proposer une référence"
                    aria-label="Proposer une référence"
                    className="absolute right-1.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-[var(--series-1)] hover:bg-[var(--page)] disabled:opacity-40"
                  >
                    <Sparkles size={14} strokeWidth={2.2} aria-hidden />
                  </button>
                </div>
              </Labeled>

              <Labeled label="Date de règlement">
                <input
                  type="date"
                  value={form.paid_at}
                  disabled={!selected}
                  onChange={(event) => setForm({ ...form, paid_at: event.target.value })}
                  className={cn(INPUT_CLASS, "tnum font-semibold")}
                />
              </Labeled>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <Stat
                icon={<Store size={18} strokeWidth={2} aria-hidden />}
                label="Fournisseur"
                value={selected?.creditor ?? "—"}
                color="var(--series-1)"
              />
              <Stat
                icon={<Wallet size={18} strokeWidth={2} aria-hidden />}
                label="Solde avant règlement"
                value={selected ? `${formatTnd(selected.balance)} TND` : "—"}
                color="var(--series-1)"
              />
              <Stat
                icon={<Clock size={18} strokeWidth={2} aria-hidden />}
                label="Retard (jours)"
                value={
                  !selected || selected.days_late === null
                    ? "—"
                    : selected.days_late > 0
                      ? `${formatInt(selected.days_late)} jour${selected.days_late > 1 ? "s" : ""}`
                      : "Non échue"
                }
                color={
                  selected?.days_late && selected.days_late > 0
                    ? "var(--critical)"
                    : "var(--good)"
                }
                tinted={Boolean(selected?.days_late && selected.days_late > 0)}
              />
            </div>
          </section>

          {/* ------------------------- 3. Informations complémentaires */}
          <section className="card p-4 md:p-5">
            <h2 className={sectionTitle}>3. Informations complémentaires</h2>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className="flex flex-col gap-3">
                <p className="flex items-start gap-2 text-[11px] leading-relaxed text-[var(--text-secondary)]">
                  <Info
                    size={15}
                    strokeWidth={2.2}
                    className="mt-0.5 shrink-0"
                    style={{ color: "var(--series-1)" }}
                    aria-hidden
                  />
                  <span>
                    Le montant réglé sera automatiquement enregistré dans
                    l&apos;historique des règlements.
                    <br />
                    Le solde de la facture sera mis à jour après validation du
                    paiement.
                  </span>
                </p>
                <textarea
                  value={form.note}
                  disabled={!selected}
                  onChange={(event) => setForm({ ...form, note: event.target.value })}
                  rows={2}
                  placeholder="Note (facultative)"
                  className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
                />
              </div>

              <div className="flex flex-col justify-end gap-2">
                {exceeds && selected ? (
                  <p
                    role="alert"
                    className="rounded-lg px-3 py-2 text-[11px] font-medium"
                    style={{
                      background: "color-mix(in srgb, var(--critical) 12%, transparent)",
                      color: "var(--critical)",
                    }}
                  >
                    Le montant dépasse le solde restant dû de {formatTnd(selected.balance)} TND.
                  </p>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={!selected || pending || newPayment <= 0 || exceeds}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                    style={{ background: "var(--series-1)" }}
                  >
                    {pending ? (
                      <Loader2 size={15} className="animate-spin" aria-hidden />
                    ) : (
                      <Save size={15} strokeWidth={2.2} aria-hidden />
                    )}
                    Ajouter le règlement
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-[var(--border)] px-4 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)]"
                  >
                    <RotateCcw size={15} strokeWidth={2.2} aria-hidden />
                    Réinitialiser
                  </button>
                </div>
              </div>
            </div>
          </section>

          {/* ------------------------------------------ 4. Historique */}
          <section className="card p-4 md:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className={cn(sectionTitle, "mb-0")}>
                4. Historique des règlements
              </h2>
              {showAll ? (
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-hidden
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Facture, fournisseur, référence…"
                    aria-label="Rechercher un règlement"
                    className={cn(INPUT_CLASS, "h-8 w-[220px] pl-8 text-[11px]")}
                  />
                </div>
              ) : null}
            </div>

            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-[11px]">
                <thead style={{ background: "var(--text-primary)" }}>
                  <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                    <th className="rounded-l-lg px-3 py-2.5">Date règlement</th>
                    <th className="px-2 py-2.5">N° Facture</th>
                    <th className="px-2 py-2.5">Fournisseur</th>
                    <th className="px-2 py-2.5">Mode de paiement</th>
                    <th className="px-2 py-2.5">Référence paiement</th>
                    <th className="px-2 py-2.5 text-right">Montant payé (TND)</th>
                    <th className="w-10 rounded-r-lg px-2 py-2.5">
                      <span className="sr-only">Détail</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                        {search ? "Aucun règlement ne correspond." : "Aucun règlement enregistré."}
                      </td>
                    </tr>
                  ) : (
                    visible.map((payment) => {
                      const reversed = payment.reversed_at !== null;
                      const isOpen = payment.payment_id === paymentId;
                      return (
                        <tr
                          key={payment.payment_id}
                          className={cn(
                            "border-b border-[var(--border)]",
                            isOpen && "bg-[var(--page)]",
                            reversed && "opacity-55"
                          )}
                        >
                          <td className="tnum px-3 py-2.5">{formatDate(payment.paid_at)}</td>
                          <td className="tnum px-2 py-2.5">{payment.invoice_number}</td>
                          <td className="max-w-[170px] truncate px-2 py-2.5">{payment.creditor}</td>
                          <td className="px-2 py-2.5">
                            {METHOD_LABEL[payment.method]}
                            {reversed ? (
                              <span
                                className="ml-1.5 rounded px-1 py-0.5 text-[9px] font-semibold uppercase"
                                style={{
                                  color: "var(--critical)",
                                  background: "color-mix(in srgb, var(--critical) 12%, transparent)",
                                }}
                              >
                                Annulé
                              </span>
                            ) : null}
                          </td>
                          <td className="tnum px-2 py-2.5 text-[var(--text-secondary)]">
                            {payment.reference ?? "—"}
                          </td>
                          <td
                            className={cn(
                              "tnum px-2 py-2.5 text-right font-semibold",
                              reversed && "line-through"
                            )}
                          >
                            {formatTnd(payment.amount)} TND
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setPaymentId(isOpen ? null : payment.payment_id);
                                setConfirmReversal(false);
                                setReversalReason("");
                              }}
                              title="Voir le règlement"
                              aria-label="Voir le règlement"
                              aria-pressed={isOpen}
                              className="inline-grid h-7 w-7 place-items-center rounded-full hover:bg-[var(--page)]"
                              style={{
                                color: "var(--series-1)",
                                background: isOpen
                                  ? "color-mix(in srgb, var(--series-1) 14%, transparent)"
                                  : undefined,
                              }}
                            >
                              <Eye size={14} strokeWidth={2.2} aria-hidden />
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {opened ? (
              <div className="mt-3 rounded-lg border border-[var(--border)] p-3 text-[11px]">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
                    <Detail label="Facture" value={opened.invoice_number} />
                    <Detail label="Montant" value={`${formatTnd(opened.amount)} TND`} />
                    <Detail label="Saisi par" value={opened.created_by ?? "—"} />
                    <Detail label="Note" value={opened.note ?? "—"} />
                  </dl>
                  <div className="flex flex-wrap items-center gap-2">
                    <a
                      href={`/debts/payments/${opened.payment_id}/receipt`}
                      target="_blank"
                      rel="noreferrer"
                      className="flex h-8 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)]"
                    >
                      <Receipt size={13} strokeWidth={2.2} aria-hidden />
                      Reçu
                    </a>
                    {opened.reversed_at === null && !confirmReversal ? (
                      <button
                        type="button"
                        onClick={() => setConfirmReversal(true)}
                        className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-[var(--critical)] hover:bg-[var(--page)]"
                      >
                        <Ban size={13} strokeWidth={2.2} aria-hidden />
                        Annuler ce règlement
                      </button>
                    ) : null}
                  </div>
                </div>

                {opened.reversed_at !== null ? (
                  <p className="mt-2 text-[10px] text-[var(--text-muted)]">
                    Annulé le {formatDateTime(opened.reversed_at)} par{" "}
                    {opened.reversed_by ?? "—"}
                    {opened.reversal_reason ? ` — ${opened.reversal_reason}` : ""}
                  </p>
                ) : null}

                {confirmReversal && opened.reversed_at === null ? (
                  <div
                    className="mt-3 rounded-lg p-3"
                    style={{ background: "color-mix(in srgb, var(--critical) 8%, transparent)" }}
                  >
                    <p className="mb-2 text-[11px] text-[var(--text-primary)]">
                      Annuler ce règlement ? La ligne est conservée et horodatée :
                      rien n&apos;est effacé.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        value={reversalReason}
                        onChange={(event) => setReversalReason(event.target.value)}
                        placeholder="Motif (facultatif)"
                        className={cn(INPUT_CLASS, "h-8 max-w-[260px] text-[11px]")}
                      />
                      <button
                        type="button"
                        onClick={() => submitReversal(opened.payment_id)}
                        disabled={pending}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-60"
                        style={{ background: "var(--critical)" }}
                      >
                        {pending ? (
                          <Loader2 size={13} className="animate-spin" aria-hidden />
                        ) : (
                          <Ban size={13} strokeWidth={2.2} aria-hidden />
                        )}
                        Confirmer l&apos;annulation
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReversal(false)}
                        className="inline-flex h-8 items-center rounded-lg px-3 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
                      >
                        Renoncer
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>
            ) : null}

            {history.length > HISTORY_PREVIEW || showAll ? (
              <button
                type="button"
                onClick={() => {
                  setShowAll((v) => !v);
                  setSearch("");
                }}
                className="mx-auto mt-3 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--series-1)] hover:underline"
              >
                <List size={14} strokeWidth={2.2} aria-hidden />
                {showAll ? "Réduire l'historique" : "Voir tout l'historique"}
              </button>
            ) : null}
            {showAll && history.length > HISTORY_MAX ? (
              <p className="pt-2 text-center text-[10px] text-[var(--text-muted)]">
                {HISTORY_MAX} règlements les plus récents sur {formatInt(history.length)}.
                Affinez la recherche pour voir les autres.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-3">
          {/* -------------------------- 7.1 Résumé du paiement sélectionné */}
          <section className="card p-4">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              Résumé du paiement sélectionné
            </h2>

            <dl className="space-y-2 text-[11px]">
              <Line
                label="Montant de la facture (TTC)"
                value={`${formatTnd(selected?.amount_due ?? 0)} TND`}
              />
              <Line
                label="Total déjà payé"
                value={`${formatTnd(selected?.amount_paid ?? 0)} TND`}
              />
              <Line
                label="Nouveau paiement"
                value={`${formatTnd(newPayment)} TND`}
                color="var(--series-1)"
              />
              <div className="mt-1 border-t border-[var(--border)] pt-2.5">
                <Line
                  label="Nouveau solde après paiement"
                  value={`${formatTnd(selected ? Math.max(newBalance, 0) : 0)} TND`}
                  strong
                />
              </div>
            </dl>

            {statusAfter ? (
              <div
                className="mt-3 flex items-center gap-2.5 rounded-lg px-3 py-2.5"
                style={{ background: `color-mix(in srgb, ${statusAfter.color} 10%, transparent)` }}
              >
                <span
                  className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                  style={{ background: statusAfter.color }}
                >
                  <CheckCircle2 size={14} strokeWidth={2.6} aria-hidden />
                </span>
                <span className="text-[10px] leading-tight text-[var(--text-secondary)]">
                  Statut après paiement
                  <span
                    className="block text-[12px] font-bold"
                    style={{ color: statusAfter.color }}
                  >
                    {statusAfter.label}
                  </span>
                </span>
              </div>
            ) : (
              <p className="mt-3 text-center text-[10px] text-[var(--text-muted)]">
                Aucune facture sélectionnée.
              </p>
            )}
          </section>

          <DebtAgeing ageing={data.ageing} totals={data.totals} />

          {/* -------------------------------- 7.3 Rappel des délais ISO */}
          <section className="card p-4">
            <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              Rappel des délais{" "}
              <span className="font-semibold normal-case text-[var(--text-muted)]">
                (selon ISO 15189)
              </span>
            </h2>
            <div className="flex items-start gap-2.5">
              <ShieldCheck
                size={22}
                strokeWidth={2}
                className="shrink-0"
                style={{ color: "var(--series-1)" }}
                aria-hidden
              />
              <p className="text-[10px] leading-relaxed text-[var(--text-secondary)]">
                <strong className="text-[var(--text-primary)]">
                  Les paiements et suivis financiers doivent être tracés et
                  conservés.
                </strong>{" "}
                LABSTOCK assure la traçabilité complète des règlements : un
                règlement s&apos;annule par contre-passation, jamais par
                suppression. Conforme aux exigences ISO 15189:2022.
              </p>
            </div>
          </section>
        </aside>
      </div>

      {/* Barre d'actions */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <ExportCsvButton
          kind="payments"
          label="Exporter (Excel)"
          icon={
            <FileSpreadsheet
              size={16}
              strokeWidth={2.2}
              style={{ color: "var(--good)" }}
              aria-hidden
            />
          }
          className={footerButton}
        />
        <a
          href="/debts/payments/print"
          target="_blank"
          rel="noreferrer"
          className={footerButton}
        >
          <Printer size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Imprimer historique
        </a>
        <button
          type="button"
          disabled={paymentId === null}
          onClick={() => window.open(`/debts/payments/${paymentId}/receipt`, "_blank")}
          title={
            paymentId === null
              ? "Ouvrez un règlement de l'historique (œil) ou enregistrez-en un"
              : undefined
          }
          className={footerButton}
        >
          <Receipt size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Imprimer reçu paiement
        </button>
        <Link href="/debts" className={footerButton}>
          <ArrowLeft size={16} strokeWidth={2.2} style={{ color: "var(--critical)" }} aria-hidden />
          Retour
        </Link>
      </div>
    </>
  );
}

/* Au-delà, on demande d'affiner : une liste de 300 lignes ne se parcourt pas. */
const PICKER_LIMIT = 50;

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Choix de la facture à régler, avec recherche : n° interne, n° imprimé par
 * le fournisseur ou nom du fournisseur. Les factures en retard passent en
 * tête, puisque ce sont elles qu'on vient le plus souvent régler.
 */
function InvoicePicker({
  options,
  selected,
  onSelect,
}: {
  options: DebtRow[];
  selected: DebtRow | null;
  onSelect: (debt: DebtRow | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean);
    return options
      .filter((debt) => {
        const haystack = normalize(
          `${debt.number} ${debt.external_number ?? ""} ${debt.creditor}`
        );
        return words.every((word) => haystack.includes(word));
      })
      .sort((a, b) => (b.days_late ?? -1) - (a.days_late ?? -1));
  }, [options, query]);
  const shown = matches.slice(0, PICKER_LIMIT);

  function choose(debt: DebtRow) {
    onSelect(debt);
    setOpen(false);
    setQuery("");
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setOpen(true);
      setActive((i) => Math.min(i + 1, shown.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (event.key === "Enter" && open && shown[active]) {
      event.preventDefault();
      choose(shown[active]);
    } else if (event.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  }

  return (
    <div className="relative">
      <Search
        size={14}
        strokeWidth={2.2}
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
        aria-hidden
      />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="invoice-picker-list"
        aria-autocomplete="list"
        aria-activedescendant={open && shown[active] ? `invoice-option-${active}` : undefined}
        value={open ? query : selected ? `${selected.number} · ${selected.creditor}` : ""}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => {
          setOpen(true);
          setActive(0);
        }}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onKeyDown={onKeyDown}
        placeholder={
          selected ? `${selected.number} · ${selected.creditor}` : "Rechercher n° ou fournisseur…"
        }
        className={cn(INPUT_CLASS, "tnum truncate pl-9 font-semibold", selected && "pr-9")}
      />
      {selected ? (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onSelect(null)}
          title="Effacer la sélection"
          className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--page)]"
        >
          <X size={13} strokeWidth={2.2} aria-hidden />
          <span className="sr-only">Effacer la sélection</span>
        </button>
      ) : null}

      {open ? (
        <ul
          id="invoice-picker-list"
          role="listbox"
          /* Garder le focus dans le champ : sans cela, le blur fermerait la
             liste avant que le clic sur une option ne soit pris en compte. */
          onMouseDown={(event) => event.preventDefault()}
          className="card absolute left-0 top-full z-30 mt-1 max-h-[320px] w-[min(440px,90vw)] overflow-y-auto p-1 shadow-lg"
        >
          {shown.length === 0 ? (
            <li className="px-3 py-4 text-center text-[11px] text-[var(--text-muted)]">
              {options.length === 0
                ? "Aucune facture en attente de règlement."
                : "Aucune facture ne correspond."}
            </li>
          ) : (
            shown.map((debt, index) => {
              const late = debt.days_late !== null && debt.days_late > 0;
              const isSelected = selected?.invoice_id === debt.invoice_id &&
                selected.source === debt.source;
              return (
                <li
                  key={`${debt.source}:${debt.invoice_id}`}
                  id={`invoice-option-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => choose(debt)}
                  onMouseEnter={() => setActive(index)}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-[11px]",
                    index === active && "bg-[var(--page)]"
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="tnum block font-semibold text-[var(--text-primary)]">
                      {debt.number}
                      {debt.external_number ? (
                        <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                          ({debt.external_number})
                        </span>
                      ) : null}
                      {isSelected ? (
                        <CheckCircle2
                          size={12}
                          strokeWidth={2.4}
                          className="ml-1.5 inline align-[-2px]"
                          style={{ color: "var(--good)" }}
                          aria-hidden
                        />
                      ) : null}
                    </span>
                    <span className="block truncate text-[10px] text-[var(--text-secondary)]">
                      {debt.creditor}
                      {debt.source === "subcontractor" ? " · sous-traitance" : ""}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tnum block font-bold text-[var(--text-primary)]">
                      {formatTnd(debt.balance)} TND
                    </span>
                    <span
                      className="block text-[10px]"
                      style={{ color: late ? "var(--critical)" : "var(--text-muted)" }}
                    >
                      {late
                        ? `${formatInt(debt.days_late!)} j de retard`
                        : debt.due_date
                          ? `Échéance ${formatDate(debt.due_date)}`
                          : "Sans échéance"}
                    </span>
                  </span>
                </li>
              );
            })
          )}
          {matches.length > PICKER_LIMIT ? (
            <li className="px-3 py-2 text-center text-[10px] text-[var(--text-muted)]">
              {formatInt(matches.length - PICKER_LIMIT)} autres résultats — affinez la recherche.
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}

function Labeled({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function Stat({
  icon,
  label,
  value,
  color,
  tinted,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  tinted?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-[var(--border)] px-3 py-2.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] text-[var(--text-secondary)]">{label}</span>
        <span
          className="tnum block truncate text-[13px] font-bold"
          style={{ color: tinted ? color : "var(--text-primary)" }}
        >
          {value}
        </span>
      </span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">{label}</dt>
      <dd className="truncate font-medium text-[var(--text-primary)]">{value}</dd>
    </div>
  );
}

function Line({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className={cn("text-[var(--text-secondary)]", strong && "font-semibold text-[var(--text-primary)]")}>
        {label}
      </dt>
      <dd
        className={cn("tnum shrink-0 font-semibold", strong && "text-[15px] font-extrabold")}
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </dd>
    </div>
  );
}
