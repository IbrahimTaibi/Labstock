"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpDown,
  CheckCircle2,
  CircleCheck,
  ClipboardList,
  Eye,
  Loader2,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldCheck,
  ShieldOff,
  ShoppingCart,
  Star,
  Trash2,
  TriangleAlert,
  Users,
} from "lucide-react";
import { deleteSupplier, saveSupplier } from "@/app/(app)/suppliers/actions";
import type { SupplierProfileInput, SupplierState } from "@/app/(app)/suppliers/actions";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { Kpi } from "@/components/Kpi";
import { Pagination } from "@/components/Pagination";
import { cn, formatDate, formatInt, formatPercent, formatTnd } from "@/lib/utils";
import type { SupplierOrder, SuppliersWorkspaceData } from "@/lib/types";
import { SUPPLIER_FORM_ID, SupplierForm } from "./SupplierForm";
import { Stars, SupplierPerformance } from "./SupplierPerformance";

type Feedback = { message: string; ok: boolean } | null;
type Mode = "new" | "view" | "edit";
type RatingFilter = "all" | "4plus" | "3to4" | "below3" | "none";

const DEFAULT_CATEGORIES = [
  "Fournisseur de réactifs",
  "Consommables de laboratoire",
  "Équipements et instruments",
  "Maintenance et services",
  "Fournitures générales",
];

const HISTORY_SIZE = 6;

const TOOLBAR_CLASS =
  "h-9 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function orderState(order: SupplierOrder, today: string) {
  if (order.lifecycle === "cancelled") return { label: "Annulée", color: "var(--text-muted)" };
  if (order.lifecycle === "draft") return { label: "Brouillon", color: "var(--text-muted)" };
  if (order.status === "received") return { label: "Livrée", color: "var(--good)" };
  if (order.expected_date && order.expected_date < today) return { label: "Retard", color: "var(--critical)" };
  return { label: order.status === "partial" ? "Partielle" : "En cours", color: "var(--warning)" };
}

function Head({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn("whitespace-nowrap px-2 py-2.5 text-left text-[10px] font-semibold text-white", className)}
    >
      {children}
    </th>
  );
}

function RowAction({
  label,
  color,
  onClick,
  children,
}: {
  label: string;
  color: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-label={label}
      title={label}
      className="grid h-6 w-6 place-items-center rounded-md transition-opacity hover:opacity-80"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      {children}
    </button>
  );
}

function BarButton({
  color,
  icon,
  label,
  onClick,
  disabled,
  type = "button",
  form,
  title,
}: {
  color: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
  form?: string;
  title?: string;
}) {
  return (
    <button
      type={type}
      form={form}
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-11 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
      style={{ background: color }}
    >
      {icon}
      {label}
    </button>
  );
}

/**
 * Gestion des fournisseurs : indicateurs, fiche (création, consultation,
 * modification), performance, liste filtrée et historique des achats.
 */
export function SuppliersWorkspace({ data }: { data: SuppliersWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode>("new");
  const [formNonce, setFormNonce] = useState(0);
  const [formValid, setFormValid] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [ratingFilter, setRatingFilter] = useState<RatingFilter>("all");
  const [sortDesc, setSortDesc] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const selected = data.suppliers.find((s) => s.id === selectedId) ?? null;
  /* Si le fournisseur sélectionné disparaît (suppression), retour à la création. */
  const effectiveMode: Mode = selected ? mode : "new";

  const today = new Date().toISOString().slice(0, 10);

  const categories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES);
    for (const s of data.suppliers) if (s.category) set.add(s.category);
    return [...set];
  }, [data.suppliers]);

  const nextCode = useMemo(() => {
    const max = data.suppliers.reduce((highest, s) => {
      const match = /(\d+)$/.exec(s.code);
      return match ? Math.max(highest, Number(match[1])) : highest;
    }, 0);
    return `FOURN-${String(max + 1).padStart(4, "0")}`;
  }, [data.suppliers]);

  const total = data.suppliers.length;
  const activeCount = data.suppliers.filter((s) => s.active).length;
  const inactiveCount = total - activeCount;
  const pct = (n: number) => (total === 0 ? "0 %" : formatPercent((n / total) * 100, 2));

  const filtered = useMemo(() => {
    const needle = normalize(search.trim());
    const rows = data.suppliers.filter((s) => {
      if (categoryFilter && s.category !== categoryFilter) return false;
      if (statusFilter === "active" && !s.active) return false;
      if (statusFilter === "inactive" && s.active) return false;
      if (ratingFilter !== "all") {
        const r = s.rating;
        if (ratingFilter === "none" && r !== null) return false;
        if (ratingFilter === "4plus" && (r === null || r < 4)) return false;
        if (ratingFilter === "3to4" && (r === null || r < 3 || r >= 4)) return false;
        if (ratingFilter === "below3" && (r === null || r >= 3)) return false;
      }
      if (!needle) return true;
      return [s.name, s.code, s.address, s.postal_code, s.tax_id, s.email, s.phone, s.mobile].some(
        (field) => normalize(field).includes(needle)
      );
    });
    rows.sort((a, b) => (sortDesc ? b.code.localeCompare(a.code) : a.code.localeCompare(b.code)));
    return rows;
  }, [data.suppliers, search, categoryFilter, statusFilter, ratingFilter, sortDesc]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const rows = filtered.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const history = selected
    ? data.orders.filter((o) => o.supplier_id === selected.id).slice(0, HISTORY_SIZE)
    : [];

  const run = useCallback(
    (action: () => Promise<SupplierState & { id?: number }>, after?: (id?: number) => void) => {
      setFeedback(null);
      start(async () => {
        const result = await action();
        setFeedback({ message: result.message, ok: result.status === "success" });
        if (result.status === "success") {
          after?.(result.id);
          router.refresh();
        }
      });
    },
    [router]
  );

  const onResult = useCallback(
    (result: SupplierState) => {
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") router.refresh();
    },
    [router]
  );

  function open(id: number, nextMode: Mode) {
    setSelectedId(id);
    setMode(nextMode);
    setConfirmDeleteId(null);
    setFormNonce((n) => n + 1);
  }

  function startNew() {
    setSelectedId(null);
    setMode("new");
    setConfirmDeleteId(null);
    setFormNonce((n) => n + 1);
  }

  function submit(input: SupplierProfileInput) {
    const id = effectiveMode === "edit" && selected ? selected.id : null;
    run(
      () => saveSupplier(id, input),
      (savedId) => {
        if (savedId) {
          setSelectedId(savedId);
          setMode("view");
          setFormNonce((n) => n + 1);
        }
      }
    );
  }

  function remove(id: number) {
    setConfirmDeleteId(null);
    run(() => deleteSupplier(id), () => {
      if (selectedId === id) startNew();
    });
  }

  const resetPage = () => setPage(0);

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

      {/* Indicateurs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
        <Kpi
          icon={<Users size={20} strokeWidth={2} aria-hidden />}
          color="var(--series-1)"
          label="Total fournisseurs"
          value={formatInt(total)}
          note="Enregistrés"
        />
        <Kpi
          icon={<ShieldCheck size={20} strokeWidth={2} aria-hidden />}
          color="var(--good)"
          label="Fournisseurs actifs"
          value={formatInt(activeCount)}
          note={`(${pct(activeCount)})`}
        />
        <Kpi
          icon={<ShieldOff size={20} strokeWidth={2} aria-hidden />}
          color="var(--serious)"
          label="Fournisseurs inactifs"
          value={formatInt(inactiveCount)}
          note={`(${pct(inactiveCount)})`}
        />
        <Kpi
          icon={<ShoppingCart size={20} strokeWidth={2} aria-hidden />}
          color="var(--series-1)"
          label="Achats ce mois (HT)"
          value={formatTnd(data.totals.purchases_month)}
          unit="TND"
          note="Factures validées du mois"
        />
        <Kpi
          icon={<ClipboardList size={20} strokeWidth={2} aria-hidden />}
          color="var(--series-1)"
          label="Commandes en cours"
          value={formatInt(data.totals.open_orders)}
          note="En attente"
        />
        <Kpi
          icon={<Star size={20} strokeWidth={2} aria-hidden />}
          color="var(--warning)"
          label="Évaluations moyennes"
          value={
            data.totals.average_rating === null
              ? "—"
              : data.totals.average_rating.toFixed(2).replace(".", ",")
          }
          unit="/ 5"
          note="Note globale"
        />
      </div>

      {/* Fiche + performance */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <SupplierForm
          key={`${selected?.id ?? "new"}-${formNonce}`}
          supplier={selected}
          nextCode={nextCode}
          readOnly={effectiveMode === "view"}
          categories={categories}
          onSubmit={submit}
          onValidityChange={setFormValid}
        />
        <SupplierPerformance
          key={selected?.id ?? "none"}
          supplierId={selected?.id ?? null}
          supplierName={selected ? `${selected.code} · ${selected.name}` : null}
          evaluations={data.evaluations}
          receipts={data.receipts}
          onResult={onResult}
        />
      </div>

      {/* Liste + historique */}
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
        <section className="card min-w-0 p-4">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Liste des fournisseurs
          </h2>

          <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
            <label className="relative">
              <input
                type="search"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  resetPage();
                }}
                placeholder="Rechercher (Nom, Code, Ville, Matricule…)"
                className={cn(TOOLBAR_CLASS, "w-full pr-8")}
              />
              <Search
                size={14}
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden
              />
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--text-secondary)]">
              Catégorie
              <select
                value={categoryFilter}
                onChange={(e) => {
                  setCategoryFilter(e.target.value);
                  resetPage();
                }}
                className={TOOLBAR_CLASS}
              >
                <option value="">Toutes</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--text-secondary)]">
              Statut
              <select
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as typeof statusFilter);
                  resetPage();
                }}
                className={TOOLBAR_CLASS}
              >
                <option value="all">Tous</option>
                <option value="active">Actifs</option>
                <option value="inactive">Inactifs</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[10px] font-semibold text-[var(--text-secondary)]">
              Évaluation
              <select
                value={ratingFilter}
                onChange={(e) => {
                  setRatingFilter(e.target.value as RatingFilter);
                  resetPage();
                }}
                className={TOOLBAR_CLASS}
              >
                <option value="all">Toutes</option>
                <option value="4plus">4 et plus</option>
                <option value="3to4">De 3 à 4</option>
                <option value="below3">Moins de 3</option>
                <option value="none">Non évalués</option>
              </select>
            </label>
            <button
              type="button"
              onClick={() => router.refresh()}
              className="flex h-9 items-center justify-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-[var(--series-1)] hover:bg-[var(--page)]"
            >
              <RefreshCw size={13} strokeWidth={2.2} aria-hidden />
              Actualiser
            </button>
          </div>

          <div className="-mx-1 overflow-x-auto">
            <table className="w-full min-w-[1080px] border-collapse text-[11px]">
              <thead style={{ background: "var(--text-primary)" }}>
                <tr>
                  <Head className="rounded-l-lg">
                    <button
                      type="button"
                      onClick={() => setSortDesc((v) => !v)}
                      className="inline-flex items-center gap-1"
                      title="Trier par code"
                    >
                      Code
                      <ArrowUpDown size={11} aria-hidden />
                    </button>
                  </Head>
                  <Head>Nom du fournisseur</Head>
                  <Head>Adresse</Head>
                  <Head>CP</Head>
                  <Head>Tél / Fax</Head>
                  <Head>GSM</Head>
                  <Head>Matricule</Head>
                  <Head>Email</Head>
                  <Head>Statut</Head>
                  <Head>Évaluation</Head>
                  <Head className="rounded-r-lg text-center">Actions</Head>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="py-8 text-center text-[var(--text-muted)]">
                      Aucun fournisseur ne correspond à ces critères.
                    </td>
                  </tr>
                ) : null}
                {rows.map((s) => {
                  const active = s.id === selectedId;
                  const confirming = confirmDeleteId === s.id;
                  return (
                    <tr
                      key={s.id}
                      onClick={() => open(s.id, "view")}
                      aria-selected={active}
                      className={cn(
                        "cursor-pointer border-b border-[var(--border)] transition-colors",
                        active ? "bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)]" : "hover:bg-[var(--page)]"
                      )}
                    >
                      <td className="tnum whitespace-nowrap px-2 py-2 font-semibold text-[var(--text-primary)]">
                        {s.code}
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-2 font-medium text-[var(--text-primary)]" title={s.name}>
                        {s.name}
                      </td>
                      <td className="max-w-[180px] truncate px-2 py-2 text-[var(--text-secondary)]" title={s.address ?? ""}>
                        {s.address ?? "—"}
                      </td>
                      <td className="tnum px-2 py-2 text-[var(--text-secondary)]">{s.postal_code ?? "—"}</td>
                      <td className="tnum max-w-[130px] truncate px-2 py-2 text-[var(--text-secondary)]" title={s.phone ?? ""}>
                        {s.phone ?? "—"}
                      </td>
                      <td className="tnum max-w-[120px] truncate px-2 py-2 text-[var(--text-secondary)]" title={s.mobile ?? ""}>
                        {s.mobile ?? "—"}
                      </td>
                      <td className="tnum whitespace-nowrap px-2 py-2 text-[var(--text-secondary)]">{s.tax_id ?? "—"}</td>
                      <td className="max-w-[170px] truncate px-2 py-2 text-[var(--text-secondary)]" title={s.email ?? ""}>
                        {s.email ?? "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                          style={{
                            color: s.active ? "var(--good)" : "var(--critical)",
                            background: `color-mix(in srgb, ${s.active ? "var(--good)" : "var(--critical)"} 12%, transparent)`,
                          }}
                        >
                          {s.active ? "Actif" : "Inactif"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">
                        {s.rating === null ? (
                          <span className="text-[var(--text-muted)]">Non évalué</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Stars value={s.rating} size={11} />
                            <span className="tnum font-semibold text-[var(--text-primary)]">
                              {s.rating.toFixed(1).replace(".", ",")}
                            </span>
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {confirming ? (
                          <span className="flex items-center justify-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => remove(s.id)}
                              className="rounded px-1.5 py-1 text-[10px] font-semibold text-white"
                              style={{ background: "var(--critical)" }}
                            >
                              Supprimer
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded px-1.5 py-1 text-[10px] text-[var(--text-secondary)] hover:bg-[var(--page)]"
                            >
                              Non
                            </button>
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1">
                            <RowAction label="Consulter" color="var(--series-1)" onClick={() => open(s.id, "view")}>
                              <Eye size={12} strokeWidth={2.2} aria-hidden />
                            </RowAction>
                            <RowAction label="Modifier" color="var(--serious)" onClick={() => open(s.id, "edit")}>
                              <Pencil size={12} strokeWidth={2.2} aria-hidden />
                            </RowAction>
                            <RowAction label="Supprimer" color="var(--critical)" onClick={() => setConfirmDeleteId(s.id)}>
                              <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                            </RowAction>
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <Pagination
            page={safePage}
            pageCount={pageCount}
            pageSize={pageSize}
            total={filtered.length}
            onPage={setPage}
            onPageSize={(size) => {
              setPageSize(size);
              setPage(0);
            }}
          />
        </section>

        <section className="card flex flex-col p-4">
          <h2 className="mb-3 text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
            Historique des achats
            <span className="ml-1 text-[10px] font-normal normal-case tracking-normal text-[var(--text-muted)]">
              (Ce fournisseur)
            </span>
          </h2>
          {selected === null ? (
            <p className="grid flex-1 place-items-center py-8 text-center text-[11px] text-[var(--text-muted)]">
              Sélectionnez un fournisseur pour afficher ses commandes.
            </p>
          ) : history.length === 0 ? (
            <p className="grid flex-1 place-items-center py-8 text-center text-[11px] text-[var(--text-muted)]">
              Aucune commande pour {selected.name}.
            </p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--border)]">
              {history.map((o) => {
                const state = orderState(o, today);
                return (
                  <li key={o.id} className="flex items-center gap-2 py-2.5 text-[11px]">
                    <CircleCheck size={16} strokeWidth={2} style={{ color: state.color }} className="shrink-0" aria-hidden />
                    <span className="tnum min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]">
                      {o.number}
                    </span>
                    <span className="tnum shrink-0 text-[10px] text-[var(--text-muted)]">{formatDate(o.ordered_at)}</span>
                    <span
                      className="w-[60px] shrink-0 rounded px-1.5 py-0.5 text-center text-[10px] font-semibold"
                      style={{ color: state.color, background: `color-mix(in srgb, ${state.color} 12%, transparent)` }}
                    >
                      {state.label}
                    </span>
                    <span className="tnum w-[96px] shrink-0 text-right font-semibold text-[var(--text-primary)]">
                      {formatTnd(o.total)} <span className="text-[9px]">TND</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link
            href="/orders"
            className="mt-auto pt-3 text-right text-[11px] font-semibold text-[var(--series-1)] hover:underline"
          >
            Voir tout l&apos;historique
          </Link>
        </section>
      </div>

      {/* Barre d'actions */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        <BarButton
          color="var(--series-1)"
          icon={<Plus size={16} strokeWidth={2.6} aria-hidden />}
          label="Nouveau fournisseur"
          onClick={startNew}
        />
        <BarButton
          color="var(--good)"
          icon={pending ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Save size={15} strokeWidth={2.2} aria-hidden />}
          label="Enregistrer"
          type="submit"
          form={SUPPLIER_FORM_ID}
          disabled={pending || effectiveMode === "view" || !formValid}
          title={effectiveMode === "view" ? "Cliquez sur « Modifier » pour changer la fiche" : undefined}
        />
        <BarButton
          color="var(--serious)"
          icon={<Pencil size={15} strokeWidth={2.2} aria-hidden />}
          label="Modifier"
          disabled={!selected || effectiveMode === "edit"}
          onClick={() => selected && open(selected.id, "edit")}
        />
        <BarButton
          color="var(--critical)"
          icon={<Trash2 size={15} strokeWidth={2.2} aria-hidden />}
          label={selected && confirmDeleteId === selected.id ? "Confirmer la suppression" : "Supprimer"}
          disabled={!selected || pending}
          onClick={() => {
            if (!selected) return;
            if (confirmDeleteId === selected.id) remove(selected.id);
            else setConfirmDeleteId(selected.id);
          }}
        />
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && window.open(`/suppliers/${selected.id}/print`, "_blank")}
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-[12px] font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--page)] disabled:cursor-not-allowed disabled:opacity-45"
        >
          <Printer size={15} strokeWidth={2.2} aria-hidden />
          Imprimer fiche
        </button>
        <ExportCsvButton
          kind="suppliers"
          label="Exporter (Excel)"
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 text-[12px] font-semibold text-[var(--good)] transition-colors hover:bg-[var(--page)]"
        />
      </div>
    </div>
  );
}
