"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RotateCcw,
  Save,
  Search,
  Wallet,
} from "lucide-react";
import { saveDebtTerms, type DebtState } from "@/app/(app)/debts/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { DebtBadge, DEBT_STATUS_CONFIG } from "./DebtBadge";
import { DebtAgeing, DebtKpis, TopCreditors } from "./DebtSummary";
import { DEBT_STATUS_ORDER, OVERDUE_STATUSES } from "@/lib/debt-status";
import { cn, formatAmount, formatDate, formatInt } from "@/lib/utils";
import type { DebtRow, DebtStatus, DebtsWorkspaceData } from "@/lib/types";

const INPUT_CLASS =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

const PAGE_SIZES = [10, 25, 50];

type StatusFilter = "all" | "overdue" | DebtStatus;

/** Échéance proposée : date de facture + délai convenu (§5.1). */
function addDays(iso: string, days: number) {
  const date = new Date(iso);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function DebtsWorkspace({ data }: { data: DebtsWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<DebtState | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [terms, setTerms] = useState({
    expense_category: "",
    payment_terms_days: "",
    due_date: "",
  });

  const keyOf = (debt: DebtRow) => `${debt.source}:${debt.invoice_id}`;
  const selected =
    data.debts.find((debt) => keyOf(debt) === selectedKey) ?? null;

  function select(debt: DebtRow) {
    if (selectedKey === keyOf(debt)) {
      setSelectedKey(null);
      return;
    }
    setSelectedKey(keyOf(debt));
    setFeedback(null);
    setTerms({
      expense_category: debt.expense_category ?? "",
      payment_terms_days:
        debt.payment_terms_days === null ? "" : String(debt.payment_terms_days),
      due_date: debt.due_date ?? "",
    });
  }

  /* §5.3 — « Calculer échéance » : la date se déduit de la facture et du
     délai, mais reste modifiable ensuite. */
  function computeDueDate() {
    if (!selected) return;
    const days = Number.parseInt(terms.payment_terms_days, 10);
    if (!Number.isFinite(days) || days < 0) {
      setFeedback({
        status: "error",
        message: "Renseignez d'abord un délai de paiement en jours.",
      });
      return;
    }
    setFeedback(null);
    setTerms((previous) => ({
      ...previous,
      due_date: addDays(selected.issue_date, days),
    }));
  }

  function submitTerms() {
    if (!selected) return;
    const days = terms.payment_terms_days.trim();
    setFeedback(null);
    start(async () => {
      const result = await saveDebtTerms({
        source: selected.source,
        invoiceId: selected.invoice_id,
        expenseCategory: terms.expense_category || null,
        paymentTermsDays: days === "" ? null : Number.parseInt(days, 10),
        dueDate: terms.due_date || null,
      });
      setFeedback(result);
      if (result.status === "success") router.refresh();
    });
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.debts.filter((debt) => {
      if (statusFilter === "overdue") {
        if (!OVERDUE_STATUSES.includes(debt.status)) return false;
      } else if (statusFilter !== "all" && debt.status !== statusFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        debt.number.toLowerCase().includes(needle) ||
        debt.creditor.toLowerCase().includes(needle) ||
        (debt.expense_category ?? "").toLowerCase().includes(needle) ||
        (debt.external_number ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data.debts, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  function changeFilter(next: StatusFilter) {
    setStatusFilter(next);
    setPage(0);
  }

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
                  value={selectedKey ?? ""}
                  onChange={(event) => {
                    const debt = data.debts.find(
                      (row) => keyOf(row) === event.target.value
                    );
                    if (debt) select(debt);
                    else setSelectedKey(null);
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="">— Choisir une facture —</option>
                  {data.debts.map((debt) => (
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
                    Montant de la facture
                  </span>
                  <span className="tnum text-[17px] font-semibold leading-tight">
                    {formatAmount(selected.amount_due)} TND
                  </span>
                </div>
              ) : null}
            </div>

            {selected ? (
              <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] sm:grid-cols-4">
                <Field label="Date facture" value={formatDate(selected.issue_date)} />
                <Field label="Fournisseur" value={selected.creditor} />
                <Field
                  label="Déjà payé"
                  value={`${formatAmount(selected.amount_paid)} TND`}
                />
                <Field
                  label="Solde"
                  value={`${formatAmount(selected.balance)} TND`}
                  strong
                />
              </dl>
            ) : null}
          </section>

          {/* ------------------------------------- 2. Informations dette */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                2. Informations de la dette
              </h2>
              {selected ? (
                <Link
                  href={`/debts/payments?invoice=${selected.source}:${selected.invoice_id}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white"
                  style={{ background: "var(--good)" }}
                >
                  <Wallet size={13} strokeWidth={2.2} aria-hidden />
                  Enregistrer un règlement
                </Link>
              ) : null}
            </div>

            {!selected ? (
              <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                Sélectionnez une facture pour gérer son échéancier.
              </p>
            ) : (
              <>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Catégorie de dépense
                    </span>
                    <input
                      value={terms.expense_category}
                      onChange={(event) =>
                        setTerms({
                          ...terms,
                          expense_category: event.target.value,
                        })
                      }
                      placeholder="BIOCHIMIE, MAINTENANCE…"
                      className={INPUT_CLASS}
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Délai de paiement (jours)
                    </span>
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={terms.payment_terms_days}
                      onChange={(event) =>
                        setTerms({
                          ...terms,
                          payment_terms_days: event.target.value,
                        })
                      }
                      placeholder="30"
                      className={INPUT_CLASS}
                    />
                  </label>

                  <label>
                    <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                      Date d&apos;échéance
                    </span>
                    <input
                      type="date"
                      value={terms.due_date}
                      onChange={(event) =>
                        setTerms({ ...terms, due_date: event.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </label>

                  <div className="flex flex-col justify-end gap-1">
                    <span className="text-[10px] font-medium text-[var(--text-secondary)]">
                      Retard / statut
                    </span>
                    <div className="flex h-8 items-center gap-2">
                      <span className="tnum text-[12px] font-semibold text-[var(--text-primary)]">
                        {selected.days_late === null
                          ? "—"
                          : `${selected.days_late > 0 ? "+" : ""}${formatInt(
                              selected.days_late
                            )} j`}
                      </span>
                      <DebtBadge status={selected.status} />
                    </div>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={computeDueDate}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white"
                    style={{ background: "var(--series-1)" }}
                  >
                    <CalendarClock size={13} strokeWidth={2.2} aria-hidden />
                    Calculer l&apos;échéance
                  </button>
                  <button
                    type="button"
                    onClick={submitTerms}
                    disabled={pending}
                    className="card inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium text-[var(--text-primary)] disabled:opacity-60"
                  >
                    {pending ? (
                      <Loader2 size={13} className="animate-spin" aria-hidden />
                    ) : (
                      <Save size={13} strokeWidth={2.2} aria-hidden />
                    )}
                    Enregistrer
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setTerms({
                        expense_category: selected.expense_category ?? "",
                        payment_terms_days:
                          selected.payment_terms_days === null
                            ? ""
                            : String(selected.payment_terms_days),
                        due_date: selected.due_date ?? "",
                      })
                    }
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

          {/* ----------------------------------------------- 3. Liste */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                3. Liste des dettes enregistrées
                <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                  ({formatInt(filtered.length)})
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
                    onChange={(event) => {
                      setSearch(event.target.value);
                      setPage(0);
                    }}
                    placeholder="N° facture, fournisseur, catégorie…"
                    aria-label="Rechercher une dette"
                    className={cn(INPUT_CLASS, "w-[210px] pl-7")}
                  />
                </div>
                <ExportCsvButton kind="debts" />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap gap-1.5">
              <FilterChip
                label="Toutes"
                active={statusFilter === "all"}
                onClick={() => changeFilter("all")}
                color="var(--text-secondary)"
              />
              <FilterChip
                label="Échues"
                active={statusFilter === "overdue"}
                onClick={() => changeFilter("overdue")}
                color="var(--critical)"
              />
              {DEBT_STATUS_ORDER.filter((status) =>
                data.ageing.some((slice) => slice.status === status)
              ).map((status) => (
                <FilterChip
                  key={status}
                  label={DEBT_STATUS_CONFIG[status].short}
                  active={statusFilter === status}
                  onClick={() => changeFilter(status)}
                  color={DEBT_STATUS_CONFIG[status].color}
                />
              ))}
            </div>

            <DataTable>
              <thead>
                <tr>
                  <Th>N° Facture</Th>
                  <Th>Date</Th>
                  <Th>Fournisseur</Th>
                  <Th>Catégorie</Th>
                  <Th align="right">Délai (j)</Th>
                  <Th align="right">À payer</Th>
                  <Th align="right">Payé</Th>
                  <Th align="right">Solde</Th>
                  <Th>Échéance</Th>
                  <Th align="right">Retard (j)</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <Td className="py-6 text-center text-[var(--text-muted)]">
                      Aucune dette ne correspond à ce filtre.
                    </Td>
                  </tr>
                ) : (
                  rows.map((debt) => (
                    <tr
                      key={keyOf(debt)}
                      onClick={() => select(debt)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[var(--page)]",
                        selectedKey === keyOf(debt) && "bg-[var(--page)]"
                      )}
                    >
                      <Td nowrap>
                        <span className="font-medium">{debt.number}</span>
                        {debt.source === "subcontractor" ? (
                          <span className="ml-1 rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                            S-T
                          </span>
                        ) : null}
                      </Td>
                      <Td nowrap>{formatDate(debt.issue_date)}</Td>
                      <Td className="max-w-[160px] truncate">{debt.creditor}</Td>
                      <Td className="text-[var(--text-muted)]">
                        {debt.expense_category ?? "—"}
                      </Td>
                      <Td align="right">
                        {debt.payment_terms_days ?? "—"}
                      </Td>
                      <Td align="right">{formatAmount(debt.amount_due)}</Td>
                      <Td align="right">{formatAmount(debt.amount_paid)}</Td>
                      <Td align="right" className="font-semibold">
                        {formatAmount(debt.balance)}
                      </Td>
                      <Td nowrap>
                        {debt.due_date ? formatDate(debt.due_date) : "—"}
                      </Td>
                      <Td align="right">
                        {debt.days_late === null
                          ? "—"
                          : `${debt.days_late > 0 ? "+" : ""}${formatInt(
                              debt.days_late
                            )}`}
                      </Td>
                      <Td>
                        <DebtBadge status={debt.status} />
                      </Td>
                    </tr>
                  ))
                )}
              </tbody>
            </DataTable>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[var(--text-muted)]">
              <label className="flex items-center gap-1.5">
                Afficher
                <select
                  value={pageSize}
                  onChange={(event) => {
                    setPageSize(Number(event.target.value));
                    setPage(0);
                  }}
                  className="h-7 rounded-lg border border-[var(--border)] bg-[var(--page)] px-1.5 text-[10px] text-[var(--text-primary)]"
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
                lignes
              </label>

              <div className="flex items-center gap-2">
                <span className="tnum">
                  {filtered.length === 0
                    ? "0"
                    : `${current * pageSize + 1} – ${Math.min(
                        (current + 1) * pageSize,
                        filtered.length
                      )}`}{" "}
                  sur {formatInt(filtered.length)}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(Math.max(0, current - 1))}
                  disabled={current === 0}
                  aria-label="Page précédente"
                  className="card grid h-7 w-7 place-items-center disabled:opacity-40"
                >
                  <ChevronLeft size={13} aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => setPage(Math.min(pageCount - 1, current + 1))}
                  disabled={current >= pageCount - 1}
                  aria-label="Page suivante"
                  className="card grid h-7 w-7 place-items-center disabled:opacity-40"
                >
                  <ChevronRight size={13} aria-hidden />
                </button>
              </div>
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <DebtAgeing ageing={data.ageing} totals={data.totals} />
          <TopCreditors
            creditors={data.topCreditors}
            onSelect={(creditor) => {
              setSearch(creditor);
              setStatusFilter("all");
              setPage(0);
            }}
          />
        </aside>
      </div>
    </>
  );
}

function Field({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd
        className={cn(
          "truncate text-[var(--text-primary)]",
          strong && "font-semibold"
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
  color,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "rounded-full px-2.5 py-1 text-[10px] font-medium transition-colors",
        active
          ? "text-white"
          : "text-[var(--text-secondary)] hover:bg-[var(--page)]"
      )}
      style={active ? { background: color } : undefined}
    >
      {label}
    </button>
  );
}
