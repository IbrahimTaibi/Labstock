"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock,
  FileText,
  Loader2,
  Plus,
  Printer,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  deleteInvoice,
  loadInvoiceLines,
  markInvoicePaid,
} from "@/app/(app)/suppliers/actions";
import type {
  InvoiceLineRow,
  SupplierState,
} from "@/app/(app)/suppliers/actions";
import { DataTable, Td, Th } from "@/components/DataTable";
import { InvoiceBadge } from "./InvoiceBadge";
import { cn, formatAmount, formatCompact, formatDate, formatInt } from "@/lib/utils";
import type { InvoiceStatus, InvoicesWorkspaceData } from "@/lib/types";

const PAGE_SIZE = 25;

const INPUT_CLASS =
  "h-8 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

type Feedback = { message: string; ok: boolean } | null;
export type StatusFilter = "all" | InvoiceStatus;

/* Stat + filtre en un seul geste : cliquer un statut filtre le tableau. */
function StatFilter({
  label,
  amount,
  count,
  countLabel,
  color,
  icon,
  active,
  onClick,
}: {
  label: string;
  amount: number;
  count: number;
  countLabel: string;
  color: string;
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={`${formatAmount(amount)} — cliquer pour filtrer`}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 text-left transition-colors",
        active ? "bg-[var(--page)]" : "hover:bg-[var(--page)]"
      )}
      style={active ? { boxShadow: `inset 0 0 0 1px ${color}` } : undefined}
    >
      <span className="shrink-0" style={{ color }}>
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[9px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {label}
        </span>
        <span className="block truncate text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
          {formatCompact(amount)}
          <span className="ml-1.5 text-[10px] font-normal text-[var(--text-muted)]">
            {formatInt(count)} {countLabel}
          </span>
        </span>
      </span>
    </button>
  );
}

export function InvoicesWorkspace({
  data,
  initialStatus = "all",
}: {
  data: InvoicesWorkspaceData;
  initialStatus?: StatusFilter;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>(initialStatus);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* Détail : lignes chargées à la demande et mémorisées par facture. */
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [linesCache, setLinesCache] = useState<Record<number, InvoiceLineRow[]>>(
    {}
  );
  const [linesLoading, setLinesLoading] = useState(false);

  /* Sélection dérivée : si la facture disparaît (suppression), le panneau
     se vide de lui-même. */
  const selected = data.invoices.find((f) => f.id === selectedId) ?? null;
  const selectedLines = selected ? linesCache[selected.id] : undefined;

  function run(action: () => Promise<SupplierState>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    });
  }

  function select(invoiceId: number) {
    setConfirmDelete(false);
    if (selectedId === invoiceId) {
      setSelectedId(null);
      return;
    }
    setSelectedId(invoiceId);
    if (linesCache[invoiceId]) return;

    setLinesLoading(true);
    loadInvoiceLines(invoiceId)
      .then((result) => {
        if (result.status === "success") {
          setLinesCache((cache) => ({ ...cache, [invoiceId]: result.lines }));
        } else {
          setFeedback({ message: result.message, ok: false });
        }
      })
      .finally(() => setLinesLoading(false));
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.invoices.filter((f) => {
      if (statusFilter !== "all" && f.status !== statusFilter) return false;
      if (needle === "") return true;
      return (
        f.number.toLowerCase().includes(needle) ||
        f.supplier.toLowerCase().includes(needle)
      );
    });
  }, [data.invoices, statusFilter, search]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(
    safePage * PAGE_SIZE,
    safePage * PAGE_SIZE + PAGE_SIZE
  );

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

      {/* Synthèse-filtre : une bande compacte, chaque statut filtre le tableau. */}
      <div className="card flex flex-col gap-1 p-1.5 sm:flex-row sm:items-stretch sm:divide-x sm:divide-[var(--border)]">
        <StatFilter
          label="Total facturé"
          amount={data.totals.invoiced}
          count={data.invoices.length}
          countLabel="factures"
          color="var(--series-1)"
          icon={<FileText size={16} strokeWidth={2.2} aria-hidden />}
          active={statusFilter === "all"}
          onClick={() => {
            setStatusFilter("all");
            setPage(0);
          }}
        />
        <StatFilter
          label="Payées"
          amount={data.totals.paid_amount}
          count={data.totals.paid_count}
          countLabel="réglées"
          color="var(--good)"
          icon={<Banknote size={16} strokeWidth={2.2} aria-hidden />}
          active={statusFilter === "paid"}
          onClick={() => {
            setStatusFilter("paid");
            setPage(0);
          }}
        />
        <StatFilter
          label="En attente"
          amount={data.totals.pending_amount}
          count={data.totals.pending_count}
          countLabel="à échoir"
          color="var(--warning)"
          icon={<Clock size={16} strokeWidth={2.2} aria-hidden />}
          active={statusFilter === "pending"}
          onClick={() => {
            setStatusFilter("pending");
            setPage(0);
          }}
        />
        <StatFilter
          label="En retard"
          amount={data.totals.overdue_amount}
          count={data.totals.overdue_count}
          countLabel="échues"
          color="var(--critical)"
          icon={<CircleAlert size={16} strokeWidth={2.2} aria-hidden />}
          active={statusFilter === "overdue"}
          onClick={() => {
            setStatusFilter("overdue");
            setPage(0);
          }}
        />
      </div>

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_330px]">
        {/* Liste des factures */}
        <section className="card min-w-0 p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Factures
              <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-muted)]">
                ({formatInt(filtered.length)})
              </span>
            </h2>

            <div className="relative ml-auto">
              <Search
                size={13}
                strokeWidth={2.2}
                className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(0);
                }}
                placeholder="Numéro ou fournisseur…"
                className={cn(INPUT_CLASS, "w-52 pl-8")}
              />
            </div>
          </div>

          {rows.length === 0 ? (
            <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
              Aucune facture ne correspond à ces critères.
            </p>
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <Th>Facture</Th>
                  <Th>Fournisseur</Th>
                  <Th>Échéance</Th>
                  <Th align="right">Montant</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => {
                  const active = f.id === selectedId;
                  return (
                    <tr
                      key={f.id}
                      onClick={() => select(f.id)}
                      aria-selected={active}
                      className={cn(
                        "cursor-pointer transition-colors",
                        active ? "bg-[var(--page)]" : "hover:bg-[var(--page)]"
                      )}
                    >
                      <Td nowrap>
                        <span className="font-medium">{f.number}</span>
                      </Td>
                      <Td nowrap>{f.supplier}</Td>
                      <Td nowrap>
                        {formatDate(f.due_date)}
                        {f.days_late > 0 ? (
                          <span
                            className="tnum ml-1.5 text-[10px] font-semibold"
                            style={{ color: "var(--critical)" }}
                          >
                            +{formatInt(f.days_late)} j
                          </span>
                        ) : null}
                      </Td>
                      <Td align="right">{formatAmount(f.amount)}</Td>
                      <Td nowrap>
                        <InvoiceBadge status={f.status} />
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}

          {filtered.length > PAGE_SIZE ? (
            <div className="mt-3 flex items-center justify-between">
              <span className="tnum text-[10px] text-[var(--text-muted)]">
                {formatInt(safePage * PAGE_SIZE + 1)}–
                {formatInt(
                  Math.min((safePage + 1) * PAGE_SIZE, filtered.length)
                )}{" "}
                sur {formatInt(filtered.length)}
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={safePage === 0}
                  onClick={() => setPage(safePage - 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--page)] disabled:opacity-40"
                >
                  <ChevronLeft size={14} strokeWidth={2.2} aria-hidden />
                  <span className="sr-only">Page précédente</span>
                </button>
                <span className="tnum px-1 text-[10px] text-[var(--text-muted)]">
                  {formatInt(safePage + 1)} / {formatInt(pageCount)}
                </span>
                <button
                  type="button"
                  disabled={safePage >= pageCount - 1}
                  onClick={() => setPage(safePage + 1)}
                  className="grid h-7 w-7 place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] hover:bg-[var(--page)] disabled:opacity-40"
                >
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden />
                  <span className="sr-only">Page suivante</span>
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Colonne latérale : détail sélectionné + composeur */}
        <div className="flex flex-col gap-3">
          {selected ? (
            <section className="card p-4">
              <header className="mb-2 flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-[13px] font-semibold text-[var(--text-primary)]">
                    {selected.number}
                  </h2>
                  <p className="text-[10px] text-[var(--text-muted)]">
                    {selected.supplier}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedId(null)}
                  className="rounded p-1 text-[var(--text-muted)] hover:bg-[var(--page)]"
                >
                  <X size={13} strokeWidth={2.2} aria-hidden />
                  <span className="sr-only">Fermer le détail</span>
                </button>
              </header>

              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-[var(--text-muted)]">
                <span>
                  Émise le{" "}
                  <span className="tnum font-medium text-[var(--text-primary)]">
                    {formatDate(selected.issue_date)}
                  </span>
                </span>
                <span>
                  Échéance{" "}
                  <span className="tnum font-medium text-[var(--text-primary)]">
                    {formatDate(selected.due_date)}
                  </span>
                  {selected.days_late > 0 ? (
                    <span
                      className="tnum ml-1 font-semibold"
                      style={{ color: "var(--critical)" }}
                    >
                      (+{formatInt(selected.days_late)} j)
                    </span>
                  ) : null}
                </span>
                {selected.payment_date ? (
                  <span>
                    Payée le{" "}
                    <span className="tnum font-medium text-[var(--text-primary)]">
                      {formatDate(selected.payment_date)}
                    </span>
                  </span>
                ) : null}
                <InvoiceBadge status={selected.status} />
              </div>

              {selectedLines === undefined ? (
                <p className="flex items-center gap-2 py-2 text-[10px] text-[var(--text-muted)]">
                  {linesLoading ? (
                    <Loader2
                      size={12}
                      strokeWidth={2.2}
                      className="animate-spin"
                      aria-hidden
                    />
                  ) : null}
                  Chargement du détail…
                </p>
              ) : (
                <table className="w-full border-collapse text-[10px]">
                  <thead>
                    <tr className="text-[var(--text-muted)]">
                      <th className="border-b border-[var(--border)] pb-1 text-left font-medium">
                        Désignation
                      </th>
                      <th className="border-b border-[var(--border)] pb-1 text-right font-medium">
                        Qté
                      </th>
                      <th className="border-b border-[var(--border)] pb-1 text-right font-medium">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedLines.map((line) => (
                      <tr key={line.id} className="text-[var(--text-primary)]">
                        <td className="py-1 pr-2">
                          {line.description}
                          <span className="tnum ml-1 text-[9px] text-[var(--text-muted)]">
                            × {formatAmount(line.unit_price)}
                          </span>
                        </td>
                        <td className="tnum py-1 text-right">
                          {formatInt(line.quantity)}
                        </td>
                        <td className="tnum py-1 text-right font-medium">
                          {formatAmount(line.quantity * line.unit_price)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="text-[var(--text-primary)]">
                      <td className="border-t border-[var(--border)] pt-1 font-semibold">
                        Total
                      </td>
                      <td className="border-t border-[var(--border)]">{null}</td>
                      <td className="tnum border-t border-[var(--border)] pt-1 text-right font-semibold">
                        {formatAmount(selected.amount)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}

              <div className="mt-3 flex flex-col gap-2 border-t border-[var(--border)] pt-3">
                <Link
                  href={`/invoices/${selected.id}/print`}
                  className="flex h-8 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-[11px] font-medium text-[var(--text-primary)] hover:bg-[var(--page)]"
                >
                  <Printer size={13} strokeWidth={2.2} aria-hidden />
                  Imprimer la facture
                </Link>
                {selected.status !== "paid" ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => markInvoicePaid(selected.id))}
                    className="flex h-8 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--good)" }}
                  >
                    <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden />
                    Marquer payée
                  </button>
                ) : null}
                {confirmDelete ? (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => {
                        setConfirmDelete(false);
                        run(() => deleteInvoice(selected.id));
                      }}
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                      style={{ background: "var(--critical)" }}
                    >
                      <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                      Confirmer la suppression
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="flex h-8 items-center rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
                    >
                      Annuler
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--critical)]"
                  >
                    <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                    Supprimer cette facture
                  </button>
                )}
              </div>
            </section>
          ) : null}

          {/* Saisie : écran dédié (import, lecture automatique, vérification). */}
          <section className="card p-4">
            <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              Nouvelle facture
            </h2>
            <p className="mb-3 text-[10px] text-[var(--text-muted)]">
              Importez le PDF ou la photo de la facture : les lignes sont lues
              et rapprochées du référentiel automatiquement.
            </p>
            <Link
              href="/invoices/new"
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white"
              style={{ background: "var(--serious)" }}
            >
              <Plus size={13} strokeWidth={2.4} aria-hidden />
              Saisir une facture fournisseur
            </Link>
            <Link
              href="/subcontracting"
              className="mt-2 flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)]"
            >
              <Plus size={13} strokeWidth={2.4} aria-hidden />
              Saisir une facture sous-traitant
            </Link>
          </section>

          {data.drafts.length > 0 ? (
            <section className="card p-4">
              <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
                Brouillons
                <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-muted)]">
                  ({formatInt(data.drafts.length)})
                </span>
              </h2>
              <ul className="flex flex-col divide-y divide-[var(--border)]">
                {data.drafts.map((d) => (
                  <li key={d.id}>
                    <Link
                      href={`/invoices/new?brouillon=${d.id}`}
                      className="flex items-center gap-2 rounded px-1 py-2 text-[11px] hover:bg-[var(--page)]"
                    >
                      <FileText size={13} strokeWidth={2.2} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--text-primary)]">
                          {d.supplier}
                          {d.supplier_number ? ` · ${d.supplier_number}` : ""}
                        </span>
                        <span className="tnum block text-[10px] text-[var(--text-muted)]">
                          {d.number} · {formatDate(d.issue_date)} · {formatInt(d.lines)} ligne(s)
                        </span>
                      </span>
                      <span className="shrink-0 text-[10px] font-semibold text-[var(--series-1)]">
                        Reprendre
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}
