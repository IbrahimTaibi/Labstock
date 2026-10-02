"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  Loader2,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import {
  recordPayment,
  reversePayment,
  suggestPaymentReference,
  type DebtState,
} from "@/app/(app)/debts/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { DebtBadge } from "./DebtBadge";
import { DebtAgeing, DebtKpis } from "./DebtSummary";
import { cn, formatAmount, formatDate, formatDateTime, formatInt } from "@/lib/utils";
import type {
  DebtRow,
  DebtsWorkspaceData,
  PaymentMethod,
} from "@/lib/types";

const INPUT_CLASS =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

const METHOD_LABEL: Record<PaymentMethod, string> = {
  transfer: "Virement",
  check: "Chèque",
  cash: "Espèces",
  card: "Carte",
  other: "Autre",
};

const today = () => new Date().toISOString().slice(0, 10);

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

  const [selectedKey, setSelectedKey] = useState<string>(() =>
    initialKey && payable.some((debt) => keyOf(debt) === initialKey)
      ? initialKey
      : ""
  );
  const selected = payable.find((debt) => keyOf(debt) === selectedKey) ?? null;

  const [form, setForm] = useState({
    method: "transfer" as PaymentMethod,
    amount: "",
    reference: "",
    paid_at: today(),
    note: "",
  });

  const [search, setSearch] = useState("");
  const [confirmReversal, setConfirmReversal] = useState<number | null>(null);
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

  /* §7.1 — le panneau se recalcule à la frappe, avant toute validation. */
  const typed = Number.parseFloat(form.amount.replace(",", "."));
  const newPayment = Number.isFinite(typed) && typed > 0 ? typed : 0;
  const newBalance = selected ? selected.balance - newPayment : 0;
  const exceeds = selected ? newPayment > selected.balance : false;

  const statusAfter = !selected
    ? null
    : newBalance <= 0
      ? { label: "Payé intégralement", color: "var(--good)" }
      : newPayment > 0
        ? { label: "Partiellement payé", color: "var(--warning)" }
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
      setFeedback(result);
      if (result.status === "success") {
        reset();
        router.refresh();
      }
    });
  }

  function submitReversal(paymentId: number) {
    setFeedback(null);
    start(async () => {
      const result = await reversePayment(paymentId, reversalReason || null);
      setFeedback(result);
      if (result.status === "success") {
        setConfirmReversal(null);
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

  return (
    <>
      <DebtKpis totals={data.totals} />

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {/* --------------------------------------------- 1. Sélection */}
          <section className="card p-4">
            <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
              1. Sélection de la facture
            </h2>

            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                  Numéro de facture
                </span>
                <select
                  value={selectedKey}
                  onChange={(event) => {
                    setSelectedKey(event.target.value);
                    reset();
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="">— Choisir une facture à régler —</option>
                  {payable.map((debt) => (
                    <option key={keyOf(debt)} value={keyOf(debt)}>
                      {debt.number} · {debt.creditor} ·{" "}
                      {formatAmount(debt.balance)} TND dus
                    </option>
                  ))}
                </select>
              </label>

              {selected ? (
                <div
                  className="flex min-w-[170px] flex-col justify-center rounded-lg px-3 py-2 text-white"
                  style={{ background: "var(--series-1)" }}
                >
                  <span className="text-[9px] uppercase tracking-wider opacity-80">
                    Solde actuel
                  </span>
                  <span className="tnum text-[17px] font-semibold leading-tight">
                    {formatAmount(selected.balance)} TND
                  </span>
                </div>
              ) : null}
            </div>

            {payable.length === 0 ? (
              <p className="mt-3 text-[11px] text-[var(--text-muted)]">
                Aucune facture en attente de règlement.
              </p>
            ) : null}
          </section>

          {/* ---------------------------------- 2. Informations paiement */}
          <section className="card p-4">
            <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
              2. Informations de paiement
            </h2>

            {!selected ? (
              <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                Sélectionnez une facture pour enregistrer un règlement.
              </p>
            ) : (
              <>
                <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                  <Field label="Fournisseur" value={selected.creditor} />
                  <Field
                    label="Solde avant règlement"
                    value={`${formatAmount(selected.balance)} TND`}
                  />
                  <Field
                    label="Retard"
                    value={
                      selected.days_late === null
                        ? "—"
                        : `${selected.days_late > 0 ? "+" : ""}${formatInt(
                            selected.days_late
                          )} jours`
                    }
                  />
                  <div className="min-w-0">
                    <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                      Statut
                    </span>
                    <DebtBadge status={selected.status} />
                  </div>
                </div>

                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Mode de paiement *
                    </span>
                    <select
                      value={form.method}
                      onChange={(event) =>
                        setForm({
                          ...form,
                          method: event.target.value as PaymentMethod,
                        })
                      }
                      className={INPUT_CLASS}
                    >
                      {(
                        Object.keys(METHOD_LABEL) as PaymentMethod[]
                      ).map((method) => (
                        <option key={method} value={method}>
                          {METHOD_LABEL[method]}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Montant payé (TND) *
                    </span>
                    <input
                      inputMode="decimal"
                      value={form.amount}
                      onChange={(event) =>
                        setForm({ ...form, amount: event.target.value })
                      }
                      placeholder="0,000"
                      aria-invalid={exceeds}
                      className={cn(
                        INPUT_CLASS,
                        exceeds && "border-[var(--critical)]"
                      )}
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Référence de paiement
                    </span>
                    <div className="flex gap-1">
                      <input
                        value={form.reference}
                        onChange={(event) =>
                          setForm({ ...form, reference: event.target.value })
                        }
                        placeholder="VIR-2026-0626-001"
                        className={INPUT_CLASS}
                      />
                      <button
                        type="button"
                        onClick={suggestReference}
                        title="Proposer une référence"
                        aria-label="Proposer une référence"
                        className="card grid h-8 w-8 shrink-0 place-items-center text-[var(--text-secondary)]"
                      >
                        <Sparkles size={13} strokeWidth={2.2} aria-hidden />
                      </button>
                    </div>
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Date de règlement
                    </span>
                    <input
                      type="date"
                      value={form.paid_at}
                      onChange={(event) =>
                        setForm({ ...form, paid_at: event.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </label>
                </div>

                {/* ------------------------- 3. Informations complémentaires */}
                <p
                  className="mt-3 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed"
                  style={{
                    background:
                      "color-mix(in srgb, var(--series-1) 10%, transparent)",
                    color: "var(--series-1)",
                  }}
                >
                  Le montant réglé sera enregistré dans l&apos;historique des
                  règlements. Le solde de la facture est mis à jour dès
                  validation.
                </p>

                {exceeds ? (
                  <p
                    role="alert"
                    className="mt-2 rounded-lg px-2.5 py-2 text-[10px] font-medium"
                    style={{
                      background:
                        "color-mix(in srgb, var(--critical) 12%, transparent)",
                      color: "var(--critical)",
                    }}
                  >
                    Le montant dépasse le solde restant dû de{" "}
                    {formatAmount(selected.balance)} TND.
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || newPayment <= 0 || exceeds}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium text-white disabled:opacity-50"
                    style={{ background: "var(--series-1)" }}
                  >
                    {pending ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden />
                    ) : (
                      <Save size={13} strokeWidth={2.2} aria-hidden />
                    )}
                    Ajouter le règlement
                  </button>
                  <button
                    type="button"
                    onClick={reset}
                    className="card inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium text-[var(--text-secondary)]"
                  >
                    <RotateCcw size={13} strokeWidth={2.2} aria-hidden />
                    Réinitialiser
                  </button>
                </div>
              </>
            )}

            {feedback ? (
              <p
                role="status"
                className="mt-3 rounded-lg px-2.5 py-2 text-[11px]"
                style={{
                  background: `color-mix(in srgb, ${
                    feedback.status === "success"
                      ? "var(--good)"
                      : "var(--critical)"
                  } 12%, transparent)`,
                  color:
                    feedback.status === "success"
                      ? "var(--good)"
                      : "var(--critical)",
                }}
              >
                {feedback.message}
              </p>
            ) : null}
          </section>

          {/* ------------------------------------------ 4. Historique */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                4. Historique des règlements
                <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                  ({formatInt(history.length)})
                </span>
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search
                    size={13}
                    className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                    aria-hidden
                  />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Facture, fournisseur, référence…"
                    aria-label="Rechercher un règlement"
                    className={cn(INPUT_CLASS, "w-[200px] pl-7")}
                  />
                </div>
                <ExportCsvButton kind="payments" label="Exporter (CSV)" />
              </div>
            </div>

            <DataTable>
              <thead>
                <tr>
                  <Th>Date</Th>
                  <Th>N° Facture</Th>
                  <Th>Fournisseur</Th>
                  <Th>Mode</Th>
                  <Th>Référence</Th>
                  <Th align="right">Montant</Th>
                  <Th align="right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {history.length === 0 ? (
                  <tr>
                    <Td className="py-6 text-center text-[var(--text-muted)]">
                      Aucun règlement enregistré.
                    </Td>
                  </tr>
                ) : (
                  history.slice(0, 50).map((payment) => {
                    const reversed = payment.reversed_at !== null;
                    return (
                      <tr
                        key={payment.payment_id}
                        className={cn(reversed && "opacity-55")}
                      >
                        <Td nowrap>{formatDate(payment.paid_at)}</Td>
                        <Td nowrap className="font-medium">
                          {payment.invoice_number}
                        </Td>
                        <Td className="max-w-[150px] truncate">
                          {payment.creditor}
                        </Td>
                        <Td>{METHOD_LABEL[payment.method]}</Td>
                        <Td className="text-[var(--text-muted)]">
                          {payment.reference ?? "—"}
                        </Td>
                        <Td
                          align="right"
                          className={cn(
                            "font-semibold",
                            reversed && "line-through"
                          )}
                        >
                          {formatAmount(payment.amount)}
                        </Td>
                        <Td align="right">
                          {reversed ? (
                            <span
                              title={`Annulé le ${formatDateTime(
                                payment.reversed_at!
                              )} par ${payment.reversed_by ?? "—"}${
                                payment.reversal_reason
                                  ? ` — ${payment.reversal_reason}`
                                  : ""
                              }`}
                              className="text-[10px] font-medium text-[var(--text-muted)]"
                            >
                              Annulé
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmReversal(payment.payment_id);
                                setReversalReason("");
                              }}
                              title="Annuler ce règlement"
                              aria-label="Annuler ce règlement"
                              className="inline-grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] hover:text-[var(--critical)]"
                            >
                              <Ban size={13} strokeWidth={2.2} aria-hidden />
                            </button>
                          )}
                        </Td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </DataTable>

            {confirmReversal !== null ? (
              <div
                className="mt-3 rounded-lg p-3"
                style={{
                  background:
                    "color-mix(in srgb, var(--critical) 8%, transparent)",
                }}
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
                    className={cn(INPUT_CLASS, "max-w-[260px]")}
                  />
                  <button
                    type="button"
                    onClick={() => submitReversal(confirmReversal)}
                    disabled={pending}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white disabled:opacity-60"
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
                    onClick={() => setConfirmReversal(null)}
                    className="card inline-flex h-8 items-center px-2.5 text-[11px] font-medium text-[var(--text-secondary)]"
                  >
                    Renoncer
                  </button>
                </div>
              </div>
            ) : null}

            {history.length > 50 ? (
              <p className="pt-2 text-center text-[10px] text-[var(--text-muted)]">
                50 règlements les plus récents sur {formatInt(history.length)}.
                Affinez la recherche pour voir les autres.
              </p>
            ) : null}
          </section>
        </div>

        <aside className="space-y-3">
          {/* -------------------------- 7.1 Résumé du paiement sélectionné */}
          <section className="card p-4">
            <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
              Résumé du paiement
            </h2>

            {!selected ? (
              <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">
                Aucune facture sélectionnée.
              </p>
            ) : (
              <>
                <dl className="space-y-1.5 text-[11px]">
                  <Line
                    label="Montant de la facture"
                    value={formatAmount(selected.amount_due)}
                  />
                  <Line
                    label="Total déjà payé"
                    value={formatAmount(selected.amount_paid)}
                  />
                  <Line
                    label="Nouveau paiement"
                    value={formatAmount(newPayment)}
                    color="var(--series-1)"
                  />
                  <div className="mt-1 border-t border-[var(--border)] pt-1.5">
                    <Line
                      label="Nouveau solde"
                      value={formatAmount(Math.max(newBalance, 0))}
                      color={newBalance <= 0 ? "var(--good)" : undefined}
                      strong
                    />
                  </div>
                </dl>

                {statusAfter ? (
                  <p
                    className="mt-3 flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[10px] font-semibold"
                    style={{
                      background: `color-mix(in srgb, ${statusAfter.color} 12%, transparent)`,
                      color: statusAfter.color,
                    }}
                  >
                    <CheckCircle2 size={12} strokeWidth={2.6} aria-hidden />
                    Statut après paiement : {statusAfter.label}
                  </p>
                ) : null}
              </>
            )}
          </section>

          <DebtAgeing ageing={data.ageing} totals={data.totals} />

          {/* -------------------------------- 7.3 Rappel des délais ISO */}
          <section className="card p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-[12px] font-semibold text-[var(--text-primary)]">
              <ShieldCheck
                size={14}
                strokeWidth={2.2}
                style={{ color: "var(--series-1)" }}
                aria-hidden
              />
              Rappel des délais
            </h2>
            <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
              Les paiements et suivis financiers doivent être tracés et
              conservés. Chaque règlement est une écriture définitive :
              l&apos;annulation se fait par contre-passation, jamais par
              suppression. Conforme aux exigences ISO 15189:2022.
            </p>
          </section>

          <Link
            href="/debts"
            className="card flex h-9 items-center justify-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
          >
            <ArrowLeft size={13} strokeWidth={2.2} aria-hidden />
            Retour aux dettes
          </Link>
        </aside>
      </div>
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <span className="block truncate text-[11px] text-[var(--text-primary)]">
        {value}
      </span>
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
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd
        className={cn("tnum shrink-0", strong && "text-[13px] font-semibold")}
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </dd>
    </div>
  );
}
