"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Bell,
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileSpreadsheet,
  FileStack,
  FileText,
  Info,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import {
  approveRequest,
  convertRequests,
  createRequest,
  deleteRequest,
  rejectRequest,
  updateRequest,
  type RequestInput,
  type RequestState,
} from "@/app/(app)/requests/actions";
import { Donut } from "@/components/Donut";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { Pagination } from "@/components/Pagination";
import {
  REQUEST_PRIORITY_CONFIG,
  REQUEST_STATUS_CONFIG,
  RequestPriorityBadge,
  RequestStatusBadge,
} from "./RequestBadges";
import { cn, formatDate, formatDateTime, formatInt, formatTnd } from "@/lib/utils";
import type {
  PurchaseRequestRow,
  RequestPriority,
  RequestStatus,
  RequestsWorkspaceData,
} from "@/lib/types";

const INPUT_CLASS =
  "h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]";

type StatusFilter = "all" | RequestStatus;
type PriorityFilter = "all" | RequestPriority;
type PeriodFilter = "all" | "month" | "quarter";

type SortKey =
  | "requested_at"
  | "number"
  | "reference"
  | "designation"
  | "supplier"
  | "quantity_requested"
  | "quantity_approved"
  | "priority"
  | "status"
  | "requester";

/* Tri métier, pas alphabétique : « Critique » passe avant « Normale ». */
const PRIORITY_RANK: Record<RequestPriority, number> = { critical: 0, urgent: 1, normal: 2 };
const STATUS_RANK: Record<RequestStatus, number> = {
  pending: 0,
  approved: 1,
  converted: 2,
  rejected: 3,
};

function sortValue(request: PurchaseRequestRow, key: SortKey): string | number {
  switch (key) {
    case "priority":
      return PRIORITY_RANK[request.priority];
    case "status":
      return STATUS_RANK[request.status];
    case "quantity_requested":
      return request.quantity_requested;
    case "quantity_approved":
      return request.quantity_approved ?? -1;
    default:
      return (request[key] ?? "").toString().toLowerCase();
  }
}

const COLUMNS: { key: SortKey; label: string; align?: "right" }[] = [
  { key: "requested_at", label: "Date DA" },
  { key: "number", label: "N° DA" },
  { key: "reference", label: "Référence" },
  { key: "designation", label: "Désignation" },
  { key: "supplier", label: "Fournisseur" },
  { key: "quantity_requested", label: "Qté demandée", align: "right" },
  { key: "quantity_approved", label: "Qté validée", align: "right" },
  { key: "priority", label: "Priorité" },
  { key: "status", label: "Statut" },
  { key: "requester", label: "Demandeur" },
];

const emptyDraft = () => ({
  product_id: "" as number | "",
  reference: "",
  designation: "",
  supplier_id: "" as number | "",
  quantity: "1",
  priority: "normal" as RequestPriority,
  estimated_unit_price: "",
  comment: "",
});

export function RequestsWorkspace({ data }: { data: RequestsWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<RequestState | null>(null);

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({
    key: "requested_at",
    dir: -1,
  });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [checked, setChecked] = useState<number[]>([]);
  const [composing, setComposing] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [approveQty, setApproveQty] = useState("");
  const [rejectReason, setRejectReason] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected =
    data.requests.find((request) => request.id === selectedId) ?? null;
  const selectedPending = selected?.status === "pending";

  const timeline = useMemo(
    () =>
      data.events
        .filter((event) => event.request_id === selectedId)
        .sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
    [data.events, selectedId]
  );

  function run(action: () => Promise<RequestState>) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback(result);
      if (result.status === "success") {
        setConfirmDelete(false);
        setRejectReason("");
        setApproveQty("");
        router.refresh();
      }
    });
  }

  function openCreate() {
    setComposing(true);
    setEditingId(null);
    setDraft(emptyDraft());
    setFeedback(null);
  }

  function openEdit(request: PurchaseRequestRow) {
    setComposing(true);
    setEditingId(request.id);
    setFeedback(null);
    setDraft({
      product_id: request.product_id ?? "",
      reference: request.reference ?? "",
      designation: request.designation,
      supplier_id: request.supplier_id ?? "",
      quantity: String(request.quantity_requested),
      priority: request.priority,
      estimated_unit_price:
        request.estimated_unit_price === null
          ? ""
          : String(request.estimated_unit_price),
      comment: request.comment ?? "",
    });
  }

  function draftToInput(): RequestInput {
    const price = Number.parseFloat(
      draft.estimated_unit_price.replace(",", ".")
    );
    return {
      productId: draft.product_id === "" ? null : Number(draft.product_id),
      reference: draft.reference || null,
      designation: draft.designation,
      supplierId: draft.supplier_id === "" ? null : Number(draft.supplier_id),
      quantity: Number.parseInt(draft.quantity, 10),
      priority: draft.priority,
      comment: draft.comment || null,
      estimatedUnitPrice: Number.isFinite(price) && price >= 0 ? price : null,
    };
  }

  function saveDraft() {
    run(async () => {
      const result = editingId
        ? await updateRequest(editingId, draftToInput())
        : await createRequest(draftToInput());
      if (result.status === "success") setComposing(false);
      return result;
    });
  }

  /* Choisir un article renseigne le fournisseur et la désignation : ce sont
     les valeurs du catalogue, et les ressaisir invite à les contredire. */
  function pickProduct(value: string) {
    if (value === "") {
      setDraft({ ...draft, product_id: "" });
      return;
    }
    const product = data.products.find((item) => item.id === Number(value));
    if (!product) return;
    setDraft({
      ...draft,
      product_id: product.id,
      designation: draft.designation || product.name,
      reference: product.reference ?? draft.reference,
      supplier_id: product.supplier_id,
    });
  }

  function select(request: PurchaseRequestRow) {
    setSelectedId(selectedId === request.id ? null : request.id);
    setConfirmDelete(false);
    setApproveQty("");
    setRejectReason("");
  }

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key ? { key, dir: current.dir === 1 ? -1 : 1 } : { key, dir: 1 }
    );
    setPage(0);
  }

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
      .toISOString()
      .slice(0, 10);
    const quarterStart = new Date(
      now.getFullYear(),
      Math.floor(now.getMonth() / 3) * 3,
      1
    )
      .toISOString()
      .slice(0, 10);

    return data.requests
      .filter((request) => {
        if (statusFilter !== "all" && request.status !== statusFilter)
          return false;
        if (priorityFilter !== "all" && request.priority !== priorityFilter)
          return false;
        if (periodFilter === "month" && request.requested_at < monthStart)
          return false;
        if (periodFilter === "quarter" && request.requested_at < quarterStart)
          return false;
        if (!needle) return true;
        return (
          request.number.toLowerCase().includes(needle) ||
          (request.reference ?? "").toLowerCase().includes(needle) ||
          request.designation.toLowerCase().includes(needle) ||
          (request.supplier ?? "").toLowerCase().includes(needle) ||
          request.requester.toLowerCase().includes(needle)
        );
      })
      .sort((a, b) => {
        const left = sortValue(a, sort.key);
        const right = sortValue(b, sort.key);
        if (left === right) return b.id - a.id;
        return (left < right ? -1 : 1) * sort.dir;
      });
  }, [data.requests, statusFilter, priorityFilter, periodFilter, search, sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pageCount - 1);
  const rows = filtered.slice(current * pageSize, current * pageSize + pageSize);

  /* §9.4 — une conversion ne vaut que pour des demandes validées partageant
     un fournisseur. On le dit avant de tenter, plutôt que de laisser la base
     rejeter après coup. */
  const checkedRequests = data.requests.filter((request) =>
    checked.includes(request.id)
  );
  const convertible =
    checkedRequests.length > 0 &&
    checkedRequests.every(
      (request) => request.status === "approved" && request.product_id !== null
    ) &&
    new Set(checkedRequests.map((request) => request.supplier_id)).size === 1 &&
    checkedRequests[0].supplier_id !== null;

  const sectionTitle =
    "text-[12px] font-bold uppercase tracking-wide text-[var(--text-primary)]";
  const barButton =
    "flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <>
      {/* ------------------------------------------------- §3 — 6 cartes */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Kpi
          label="Total des D.A."
          value={data.totals.total}
          note="Toutes demandes"
          color="var(--series-1)"
          icon={<ShoppingCart size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="En attente"
          value={data.totals.pending}
          note="Non encore validées"
          color="var(--warning)"
          icon={<Clock size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Validées"
          value={data.totals.approved}
          note="Approuvées"
          color="var(--good)"
          icon={<CheckCircle2 size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Converties en BC"
          value={data.totals.converted}
          note="Bon de commande créés"
          color="var(--series-1)"
          icon={<FileStack size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Priorité critique"
          value={data.totals.critical}
          note="Demandes critiques"
          color="var(--critical)"
          icon={<CircleAlert size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Ce mois"
          value={data.totals.this_month}
          note="Demandes créées"
          color="var(--series-1)"
          icon={<CalendarDays size={18} strokeWidth={2.2} aria-hidden />}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_340px]">
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

          {/* --------------------------- Formulaire création / édition */}
          {composing ? (
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className={sectionTitle}>
                  {editingId ? "Modifier la demande" : "Nouvelle demande d'achat"}
                </h2>
                <button
                  type="button"
                  onClick={() => setComposing(false)}
                  aria-label="Fermer le formulaire"
                  className="grid h-7 w-7 place-items-center rounded text-[var(--text-muted)] hover:bg-[var(--page)]"
                >
                  <X size={14} aria-hidden />
                </button>
              </div>

              <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                <FormField label="Article du catalogue">
                  <select
                    value={draft.product_id}
                    onChange={(event) => pickProduct(event.target.value)}
                    className={INPUT_CLASS}
                  >
                    <option value="">— Hors catalogue —</option>
                    {data.products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Désignation *">
                  <input
                    value={draft.designation}
                    onChange={(event) =>
                      setDraft({ ...draft, designation: event.target.value })
                    }
                    placeholder="Réactif PCR"
                    className={INPUT_CLASS}
                  />
                </FormField>

                <FormField label="Référence">
                  <input
                    value={draft.reference}
                    onChange={(event) =>
                      setDraft({ ...draft, reference: event.target.value })
                    }
                    placeholder="REF-001245"
                    className={INPUT_CLASS}
                  />
                </FormField>

                <FormField label="Fournisseur proposé">
                  <select
                    value={draft.supplier_id}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        supplier_id:
                          event.target.value === ""
                            ? ""
                            : Number(event.target.value),
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">— À déterminer —</option>
                    {data.suppliers.map((supplier) => (
                      <option key={supplier.id} value={supplier.id}>
                        {supplier.name}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Quantité demandée *">
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.quantity}
                    onChange={(event) =>
                      setDraft({ ...draft, quantity: event.target.value })
                    }
                    className={INPUT_CLASS}
                  />
                </FormField>

                <FormField label="Priorité">
                  <select
                    value={draft.priority}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        priority: event.target.value as RequestPriority,
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    {(
                      Object.keys(REQUEST_PRIORITY_CONFIG) as RequestPriority[]
                    ).map((priority) => (
                      <option key={priority} value={priority}>
                        {REQUEST_PRIORITY_CONFIG[priority].label}
                      </option>
                    ))}
                  </select>
                </FormField>

                <FormField label="Prix unitaire estimé (TND)">
                  <input
                    inputMode="decimal"
                    value={draft.estimated_unit_price}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        estimated_unit_price: event.target.value,
                      })
                    }
                    placeholder="Facultatif"
                    className={INPUT_CLASS}
                  />
                </FormField>

                <FormField label="Commentaire / justification" className="sm:col-span-2">
                  <input
                    value={draft.comment}
                    onChange={(event) =>
                      setDraft({ ...draft, comment: event.target.value })
                    }
                    placeholder="Besoin urgent pour la continuité des analyses."
                    className={INPUT_CLASS}
                  />
                </FormField>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={saveDraft}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-60"
                  style={{ background: "var(--series-1)" }}
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
                  onClick={() => setDraft(emptyDraft())}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
                >
                  <RotateCcw size={13} strokeWidth={2.2} aria-hidden />
                  Réinitialiser
                </button>
              </div>
            </section>
          ) : null}

          {/* ------------------------------------------ Liste des demandes */}
          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-3 flex items-center gap-1.5")}>
              Liste des demandes d&apos;achat
              <span
                title="Cliquez sur une ligne pour afficher son détail. Cochez des demandes validées d'un même fournisseur pour les convertir en bon de commande."
                className="text-[var(--series-1)]"
              >
                <Info size={14} strokeWidth={2.2} aria-hidden />
              </span>
            </h2>

            <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(0,1fr))_auto] lg:items-end">
              <div className="relative">
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPage(0);
                  }}
                  placeholder="Rechercher (N° DA, Référence, Désignation, Fournisseur…)"
                  aria-label="Rechercher une demande"
                  className={cn(INPUT_CLASS, "pr-8")}
                />
                <Search
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
              </div>

              <FilterField label="Statut">
                <select
                  value={statusFilter}
                  onChange={(event) => {
                    setStatusFilter(event.target.value as StatusFilter);
                    setPage(0);
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="all">Tous</option>
                  {(Object.keys(REQUEST_STATUS_CONFIG) as RequestStatus[]).map(
                    (status) => (
                      <option key={status} value={status}>
                        {REQUEST_STATUS_CONFIG[status].label}
                      </option>
                    )
                  )}
                </select>
              </FilterField>

              <FilterField label="Priorité">
                <select
                  value={priorityFilter}
                  onChange={(event) => {
                    setPriorityFilter(event.target.value as PriorityFilter);
                    setPage(0);
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="all">Toutes</option>
                  {(
                    Object.keys(REQUEST_PRIORITY_CONFIG) as RequestPriority[]
                  ).map((priority) => (
                    <option key={priority} value={priority}>
                      {REQUEST_PRIORITY_CONFIG[priority].label}
                    </option>
                  ))}
                </select>
              </FilterField>

              <FilterField label="Période">
                <select
                  value={periodFilter}
                  onChange={(event) => {
                    setPeriodFilter(event.target.value as PeriodFilter);
                    setPage(0);
                  }}
                  className={INPUT_CLASS}
                >
                  <option value="all">Toute période</option>
                  <option value="month">Ce mois</option>
                  <option value="quarter">Ce trimestre</option>
                </select>
              </FilterField>

              <button
                type="button"
                onClick={() => start(() => router.refresh())}
                className="flex h-9 items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)]"
              >
                <RefreshCw
                  size={13}
                  strokeWidth={2.2}
                  className={cn(pending && "animate-spin")}
                  aria-hidden
                />
                Actualiser
              </button>
            </div>

            {checked.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--page)] px-2.5 py-2">
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {formatInt(checked.length)} demande
                  {checked.length > 1 ? "s" : ""} cochée
                  {checked.length > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  disabled={!convertible || pending}
                  title={
                    convertible
                      ? "Créer un bon de commande"
                      : "Cochez des demandes validées, rattachées à un article, d'un même fournisseur"
                  }
                  onClick={() =>
                    run(async () => {
                      const result = await convertRequests(checked);
                      if (result.status === "success") setChecked([]);
                      return result;
                    })
                  }
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-semibold text-white disabled:opacity-40"
                  style={{ background: "var(--series-1)" }}
                >
                  <ShoppingCart size={12} strokeWidth={2.2} aria-hidden />
                  Convertir en bon de commande
                </button>
                <button
                  type="button"
                  onClick={() => setChecked([])}
                  className="text-[10px] text-[var(--text-muted)] hover:underline"
                >
                  Tout décocher
                </button>
              </div>
            ) : null}

            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-[11px]">
                <thead style={{ background: "var(--text-primary)" }}>
                  <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                    <th className="w-8 rounded-l-lg px-2 py-2.5">
                      <span className="sr-only">Cocher</span>
                    </th>
                    {COLUMNS.map((column, index) => {
                      const active = sort.key === column.key;
                      const SortIcon = !active ? ArrowUpDown : sort.dir === 1 ? ArrowUp : ArrowDown;
                      return (
                        <th
                          key={column.key}
                          aria-sort={
                            active ? (sort.dir === 1 ? "ascending" : "descending") : undefined
                          }
                          className={cn(
                            "px-2 py-2.5",
                            index === COLUMNS.length - 1 && "rounded-r-lg"
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => toggleSort(column.key)}
                            className={cn(
                              "inline-flex items-center gap-1 whitespace-nowrap hover:opacity-80",
                              column.align === "right" && "w-full justify-end"
                            )}
                          >
                            {column.label}
                            <SortIcon
                              size={11}
                              strokeWidth={2.4}
                              className={active ? "" : "opacity-50"}
                              aria-hidden
                            />
                          </button>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {rows.length === 0 ? (
                    <tr>
                      <td colSpan={11} className="py-8 text-center text-[var(--text-muted)]">
                        Aucune demande ne correspond à ces filtres.
                      </td>
                    </tr>
                  ) : (
                    rows.map((request) => {
                      const isSelected = selectedId === request.id;
                      return (
                        <tr
                          key={request.id}
                          onClick={() => select(request)}
                          aria-selected={isSelected}
                          className={cn(
                            "cursor-pointer border-b border-[var(--border)] transition-colors hover:bg-[var(--page)]",
                            isSelected &&
                              "bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)] hover:bg-[color-mix(in_srgb,var(--series-1)_8%,transparent)]"
                          )}
                        >
                          <td className="px-2 py-2.5">
                            <input
                              type="checkbox"
                              checked={checked.includes(request.id)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={(event) =>
                                setChecked((previous) =>
                                  event.target.checked
                                    ? [...previous, request.id]
                                    : previous.filter((id) => id !== request.id)
                                )
                              }
                              aria-label={`Cocher ${request.number}`}
                              className="cursor-pointer"
                            />
                          </td>
                          <td className="tnum whitespace-nowrap px-2 py-2.5">
                            {formatDate(request.requested_at)}
                          </td>
                          <td className="tnum whitespace-nowrap px-2 py-2.5 font-semibold">
                            {request.number}
                          </td>
                          <td className="tnum px-2 py-2.5 text-[var(--text-secondary)]">
                            {request.reference ?? "—"}
                          </td>
                          <td className="max-w-[180px] truncate px-2 py-2.5">
                            {request.designation}
                          </td>
                          <td className="max-w-[140px] truncate px-2 py-2.5">
                            {request.supplier ?? "—"}
                          </td>
                          <td className="tnum px-2 py-2.5 text-right">
                            {formatInt(request.quantity_requested)}
                          </td>
                          <td className="tnum px-2 py-2.5 text-right">
                            {request.quantity_approved === null
                              ? "—"
                              : formatInt(request.quantity_approved)}
                          </td>
                          <td className="px-2 py-2.5">
                            <RequestPriorityBadge priority={request.priority} />
                          </td>
                          <td className="px-2 py-2.5">
                            <RequestStatusBadge status={request.status} />
                          </td>
                          <td className="max-w-[120px] truncate px-2 py-2.5">
                            {request.requester}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            <Pagination
              page={current}
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

          {/* ----------------------------------------- §5 — Analyse */}
          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>Analyse des demandes</h2>
            <div className="grid gap-5 md:grid-cols-3 md:divide-x md:divide-[var(--border)]">
              <div>
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Répartition par statut
                </h3>
                <div className="flex items-center gap-3 [&>div]:mx-0 [&>div]:mb-0 [&>div]:shrink-0 [&>ul]:min-w-0 [&>ul]:flex-1">
                  <Donut
                    size={96}
                    centerLabel="Total"
                    slices={data.byStatus.map((slice) => ({
                      key: slice.key,
                      label: REQUEST_STATUS_CONFIG[slice.key].label,
                      count: slice.count,
                      color: REQUEST_STATUS_CONFIG[slice.key].color,
                    }))}
                  />
                </div>
              </div>

              <div className="md:pl-5">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Répartition par priorité
                </h3>
                <div className="flex items-center gap-3 [&>div]:mx-0 [&>div]:mb-0 [&>div]:shrink-0 [&>ul]:min-w-0 [&>ul]:flex-1">
                  <Donut
                    size={96}
                    centerLabel="Total"
                    slices={data.byPriority.map((slice) => ({
                      key: slice.key,
                      label: REQUEST_PRIORITY_CONFIG[slice.key].label,
                      count: slice.count,
                      color: REQUEST_PRIORITY_CONFIG[slice.key].color,
                    }))}
                  />
                </div>
              </div>

              <div className="md:pl-5">
                <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-[var(--text-secondary)]">
                  Top 5 fournisseurs
                </h3>
                {data.topSuppliers.length === 0 ? (
                  <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                    Aucune demande rattachée à un fournisseur.
                  </p>
                ) : (
                  <ol className="space-y-2">
                    {data.topSuppliers.map((entry, index) => (
                      <li
                        key={entry.supplier}
                        className="flex items-baseline gap-2 text-[11px]"
                      >
                        <span className="tnum w-4 shrink-0 font-bold text-[var(--text-primary)]">
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-[var(--text-primary)]">
                          {entry.supplier}
                        </span>
                        <span className="tnum shrink-0 text-[10px] text-[var(--text-secondary)]">
                          {formatInt(entry.count)} demande{entry.count > 1 ? "s" : ""}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </div>
          </section>
        </div>

        {/* ------------------------------------- §6 — Panneau de détail */}
        <aside className="space-y-3">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Détail de la demande sélectionnée
              </h2>
              {selected ? <RequestStatusBadge status={selected.status} /> : null}
            </div>

            {!selected ? (
              <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
                Sélectionnez une demande dans le tableau.
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[11px]">
                  <Detail label="N° Demande d'achat" value={selected.number} />
                  <Detail
                    label="Priorité"
                    node={<RequestPriorityBadge priority={selected.priority} />}
                  />
                  <Detail
                    label="Date de la demande"
                    value={formatDate(selected.requested_at)}
                  />
                  <Detail
                    label="Statut"
                    node={<RequestStatusBadge status={selected.status} />}
                  />
                  <Detail label="Référence" value={selected.reference ?? "—"} />
                  <Detail
                    label="Quantité demandée"
                    value={formatInt(selected.quantity_requested)}
                  />
                  <Detail label="Désignation" value={selected.designation} />
                  <Detail
                    label="Quantité validée"
                    value={
                      selected.quantity_approved === null
                        ? "—"
                        : formatInt(selected.quantity_approved)
                    }
                  />
                  <Detail
                    label="Fournisseur proposé"
                    value={selected.supplier ?? "—"}
                  />
                  <Detail
                    label="Date de validation"
                    value={
                      selected.validated_at ? formatDate(selected.validated_at) : "—"
                    }
                  />
                  <Detail label="Demandeur" value={selected.requester} />
                  <Detail label="Validé par" value={selected.validated_by ?? "—"} />
                  {selected.estimated_unit_price !== null ? (
                    <Detail
                      label="P.U. estimé"
                      value={`${formatTnd(selected.estimated_unit_price)} TND`}
                    />
                  ) : null}
                  {selected.purchase_order_number ? (
                    <Detail
                      label="Bon de commande"
                      value={selected.purchase_order_number}
                    />
                  ) : null}
                </dl>

                <div className="mt-3">
                  <div className="mb-1 text-[10px] font-semibold text-[var(--text-secondary)]">
                    Commentaire
                  </div>
                  <p className="text-[11px] leading-relaxed text-[var(--text-primary)]">
                    {selected.comment ?? "—"}
                  </p>
                </div>

                {selected.rejection_reason ? (
                  <p
                    className="mt-3 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed"
                    style={{
                      background: "color-mix(in srgb, var(--critical) 10%, transparent)",
                      color: "var(--critical)",
                    }}
                  >
                    Motif du refus : {selected.rejection_reason}
                  </p>
                ) : null}

                {/* §7 — arbitrage : la validation elle-même est dans la
                    barre d'actions, la quantité retenue se règle ici. */}
                {selectedPending ? (
                  <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                    <FormField label="Quantité à valider">
                      <input
                        type="number"
                        min={1}
                        max={selected.quantity_requested}
                        value={approveQty}
                        onChange={(event) => setApproveQty(event.target.value)}
                        placeholder={`${selected.quantity_requested} (quantité demandée)`}
                        className={INPUT_CLASS}
                      />
                    </FormField>
                    <div className="flex items-end gap-1.5">
                      <FormField label="Motif de refus" className="flex-1">
                        <input
                          value={rejectReason}
                          onChange={(event) => setRejectReason(event.target.value)}
                          placeholder="Obligatoire pour refuser"
                          className={INPUT_CLASS}
                        />
                      </FormField>
                      <button
                        type="button"
                        disabled={pending || rejectReason.trim() === ""}
                        onClick={() => run(() => rejectRequest(selected.id, rejectReason))}
                        className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold text-white disabled:opacity-40"
                        style={{ background: "var(--critical)" }}
                      >
                        <XCircle size={13} strokeWidth={2.2} aria-hidden />
                        Refuser
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ------------------------------- §6.2 — Historique */}
          <section className="card p-4">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              Historique de la demande
            </h2>
            {!selected ? (
              <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">
                Aucune demande sélectionnée.
              </p>
            ) : (
              <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-[var(--border)]">
                {timeline.map((event) => {
                  const config =
                    event.kind === "approved"
                      ? REQUEST_STATUS_CONFIG.approved
                      : event.kind === "rejected"
                        ? REQUEST_STATUS_CONFIG.rejected
                        : event.kind === "converted"
                          ? REQUEST_STATUS_CONFIG.converted
                          : event.kind === "created"
                            ? { color: "var(--series-1)", Icon: FileText }
                            : { color: "var(--warning)", Icon: Clock };
                  const Icon = config.Icon;
                  return (
                    <li key={event.id} className="relative flex gap-2.5">
                      <span
                        className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full text-white"
                        style={{ background: config.color }}
                      >
                        <Icon size={12} strokeWidth={2.6} aria-hidden />
                      </span>
                      <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-2">
                        <div className="min-w-0">
                          <div className="tnum text-[10px] text-[var(--text-muted)]">
                            {formatDateTime(event.occurred_at)}
                          </div>
                          <div className="text-[11px] font-semibold text-[var(--text-primary)]">
                            {event.detail ?? event.kind}
                          </div>
                        </div>
                        {event.actor ? (
                          <span className="text-[10px] text-[var(--text-secondary)]">
                            par {event.actor}
                          </span>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </aside>
      </div>

      {/* ---------------------------------------------- Barre d'actions */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
        <button
          type="button"
          onClick={openCreate}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-1)" }}
        >
          <Plus size={16} strokeWidth={2.4} aria-hidden />
          Nouvelle demande
        </button>
        <button
          type="button"
          disabled={!composing || pending}
          onClick={saveDraft}
          title={composing ? undefined : "Ouvrez une nouvelle demande ou modifiez-en une"}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-1)" }}
        >
          {pending && composing ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Save size={16} strokeWidth={2.2} aria-hidden />
          )}
          Enregistrer
        </button>
        <button
          type="button"
          disabled={!selectedPending || pending}
          onClick={() =>
            selected &&
            run(() =>
              approveRequest(
                selected.id,
                approveQty === "" ? null : Number.parseInt(approveQty, 10)
              )
            )
          }
          title={selectedPending ? undefined : "Sélectionnez une demande en attente"}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--good)" }}
        >
          <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden />
          Valider la demande
        </button>
        <button
          type="button"
          disabled={!selectedPending}
          onClick={() => selected && openEdit(selected)}
          title={selectedPending ? undefined : "Seule une demande en attente se modifie"}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-2)" }}
        >
          <Pencil size={16} strokeWidth={2.2} aria-hidden />
          Modifier
        </button>
        <button
          type="button"
          disabled={!selectedPending || pending}
          onClick={() =>
            selected &&
            (confirmDelete ? run(() => deleteRequest(selected.id)) : setConfirmDelete(true))
          }
          onBlur={() => setConfirmDelete(false)}
          title={selectedPending ? undefined : "Seule une demande en attente se supprime"}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--critical)" }}
        >
          <Trash2 size={16} strokeWidth={2.2} aria-hidden />
          {confirmDelete ? "Confirmer ?" : "Supprimer"}
        </button>
        <button
          type="button"
          disabled={!selected}
          onClick={() => selected && window.open(`/requests/${selected.id}/print`, "_blank")}
          title={selected ? undefined : "Sélectionnez une demande"}
          className={cn(
            barButton,
            "card text-[var(--text-primary)] hover:bg-[var(--page)] hover:opacity-100"
          )}
        >
          <Printer size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Imprimer D.A.
        </button>
        <ExportCsvButton
          kind="requests"
          label="Exporter (Excel)"
          icon={
            <FileSpreadsheet
              size={16}
              strokeWidth={2.2}
              style={{ color: "var(--good)" }}
              aria-hidden
            />
          }
          className={cn(barButton, "card text-[var(--text-primary)] hover:bg-[var(--page)] hover:opacity-100")}
        />
      </div>

      {/* --------------------------------------------- Bandeau qualité */}
      <div className="card mt-3 grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <Assurance
          icon={<Info size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="ISO 15189:2022"
          text="Traçabilité complète des demandes d'achat. Enregistrement conforme aux exigences."
        />
        <Assurance
          icon={<ShieldCheck size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Traçabilité assurée"
          text="Toutes les actions sont enregistrées dans l'historique de la demande."
        />
        <Assurance
          icon={<Lock size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Données sécurisées"
          text="Accès contrôlé selon les droits de chaque utilisateur."
        />
        <Assurance
          icon={<Bell size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-2)"
          title="Priorités signalées"
          text="Les demandes critiques sont comptées et mises en évidence dès leur création."
        />
        <Assurance
          icon={<FileText size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Documents liés"
          text="Impression de la D.A. en PDF et export de la liste au format Excel."
        />
      </div>
    </>
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
  value: number;
  note: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="card flex items-center gap-3 p-3.5">
      <span
        className="grid h-10 w-10 shrink-0 place-items-center rounded-full"
        style={{
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-bold" style={{ color }}>
          {label}
        </div>
        <div className="tnum text-[22px] font-bold leading-tight text-[var(--text-primary)]">
          {formatInt(value)}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">{note}</div>
      </div>
    </article>
  );
}

function FormField({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("block min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-semibold text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function FilterField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[10px] font-semibold text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Detail({
  label,
  value,
  node,
}: {
  label: string;
  value?: string;
  node?: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] text-[var(--text-secondary)]">{label}</dt>
      <dd className="truncate font-semibold text-[var(--text-primary)]" title={value}>
        {node ?? value}
      </dd>
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
