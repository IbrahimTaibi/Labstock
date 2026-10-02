"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  FileText,
  Flame,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
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
import { DataTable, Td, Th } from "@/components/DataTable";
import { Donut } from "@/components/Donut";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import {
  REQUEST_PRIORITY_CONFIG,
  REQUEST_STATUS_CONFIG,
  RequestPriorityBadge,
  RequestStatusBadge,
} from "./RequestBadges";
import { cn, formatAmount, formatDate, formatDateTime, formatInt } from "@/lib/utils";
import type {
  PurchaseRequestRow,
  RequestPriority,
  RequestStatus,
  RequestsWorkspaceData,
} from "@/lib/types";

const INPUT_CLASS =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

const PAGE_SIZES = [10, 25, 50];

type StatusFilter = "all" | RequestStatus;
type PriorityFilter = "all" | RequestPriority;
type PeriodFilter = "all" | "month" | "quarter";

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

    return data.requests.filter((request) => {
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
    });
  }, [data.requests, statusFilter, priorityFilter, periodFilter, search]);

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

  return (
    <>
      {/* ------------------------------------------------- §3 — 6 cartes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
        <Kpi
          label="Total des D.A."
          value={data.totals.total}
          note="Toutes demandes"
          color="var(--series-1)"
          icon={<FileText size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="En attente"
          value={data.totals.pending}
          note="Non encore validées"
          color="var(--warning)"
          icon={<Loader2 size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Validées"
          value={data.totals.approved}
          note="Approuvées"
          color="var(--good)"
          icon={<CheckCircle2 size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Converties en BC"
          value={data.totals.converted}
          note="Bons de commande créés"
          color="var(--series-5)"
          icon={<ShoppingCart size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Priorité critique"
          value={data.totals.critical}
          note="Demandes critiques"
          color="var(--critical)"
          icon={<Flame size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Ce mois"
          value={data.totals.this_month}
          note="Demandes créées"
          color="var(--series-3)"
          icon={<Plus size={17} strokeWidth={2.2} aria-hidden />}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {/* --------------------------- Formulaire création / édition */}
          {composing ? (
            <section className="card p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
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
                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Article du catalogue
                  </span>
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
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Désignation *
                  </span>
                  <input
                    value={draft.designation}
                    onChange={(event) =>
                      setDraft({ ...draft, designation: event.target.value })
                    }
                    placeholder="Réactif PCR"
                    className={INPUT_CLASS}
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Référence
                  </span>
                  <input
                    value={draft.reference}
                    onChange={(event) =>
                      setDraft({ ...draft, reference: event.target.value })
                    }
                    placeholder="REF-001245"
                    className={INPUT_CLASS}
                  />
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Fournisseur proposé
                  </span>
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
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Quantité demandée *
                  </span>
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
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Priorité
                  </span>
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
                </label>

                <label>
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Prix unitaire estimé (TND)
                  </span>
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
                </label>

                <label className="sm:col-span-2">
                  <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
                    Commentaire / justification
                  </span>
                  <input
                    value={draft.comment}
                    onChange={(event) =>
                      setDraft({ ...draft, comment: event.target.value })
                    }
                    placeholder="Besoin urgent pour la continuité des analyses."
                    className={INPUT_CLASS}
                  />
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(async () => {
                      const result = editingId
                        ? await updateRequest(editingId, draftToInput())
                        : await createRequest(draftToInput());
                      if (result.status === "success") setComposing(false);
                      return result;
                    })
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium text-white disabled:opacity-60"
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
                  className="card inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium text-[var(--text-secondary)]"
                >
                  <RotateCcw size={13} strokeWidth={2.2} aria-hidden />
                  Réinitialiser
                </button>
              </div>
            </section>
          ) : null}

          {/* ------------------------------------------ Liste des demandes */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                Liste des demandes d&apos;achat
                <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                  ({formatInt(filtered.length)})
                </span>
              </h2>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white"
                  style={{ background: "var(--series-1)" }}
                >
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Nouvelle demande
                </button>
                <ExportCsvButton kind="requests" />
              </div>
            </div>

            <div className="mb-3 flex flex-wrap items-center gap-2">
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
                  placeholder="N° DA, référence, désignation, fournisseur…"
                  aria-label="Rechercher une demande"
                  className={cn(INPUT_CLASS, "w-[250px] pl-7")}
                />
              </div>

              <select
                value={statusFilter}
                onChange={(event) => {
                  setStatusFilter(event.target.value as StatusFilter);
                  setPage(0);
                }}
                aria-label="Filtrer par statut"
                className={cn(INPUT_CLASS, "w-auto")}
              >
                <option value="all">Tous les statuts</option>
                {(Object.keys(REQUEST_STATUS_CONFIG) as RequestStatus[]).map(
                  (status) => (
                    <option key={status} value={status}>
                      {REQUEST_STATUS_CONFIG[status].label}
                    </option>
                  )
                )}
              </select>

              <select
                value={priorityFilter}
                onChange={(event) => {
                  setPriorityFilter(event.target.value as PriorityFilter);
                  setPage(0);
                }}
                aria-label="Filtrer par priorité"
                className={cn(INPUT_CLASS, "w-auto")}
              >
                <option value="all">Toutes priorités</option>
                {(
                  Object.keys(REQUEST_PRIORITY_CONFIG) as RequestPriority[]
                ).map((priority) => (
                  <option key={priority} value={priority}>
                    {REQUEST_PRIORITY_CONFIG[priority].label}
                  </option>
                ))}
              </select>

              <select
                value={periodFilter}
                onChange={(event) => {
                  setPeriodFilter(event.target.value as PeriodFilter);
                  setPage(0);
                }}
                aria-label="Filtrer par période"
                className={cn(INPUT_CLASS, "w-auto")}
              >
                <option value="all">Toute période</option>
                <option value="month">Ce mois</option>
                <option value="quarter">Ce trimestre</option>
              </select>
            </div>

            {checked.length > 0 ? (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--page)] px-2.5 py-2">
                <span className="text-[10px] text-[var(--text-secondary)]">
                  {formatInt(checked.length)} demande
                  {checked.length > 1 ? "s" : ""} sélectionnée
                  {checked.length > 1 ? "s" : ""}
                </span>
                <button
                  type="button"
                  disabled={!convertible || pending}
                  title={
                    convertible
                      ? "Créer un bon de commande"
                      : "Sélectionnez des demandes validées, rattachées à un article, d'un même fournisseur"
                  }
                  onClick={() =>
                    run(async () => {
                      const result = await convertRequests(checked);
                      if (result.status === "success") setChecked([]);
                      return result;
                    })
                  }
                  className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[10px] font-medium text-white disabled:opacity-40"
                  style={{ background: "var(--series-5)" }}
                >
                  <ShoppingCart size={12} strokeWidth={2.2} aria-hidden />
                  Convertir en bon de commande
                </button>
                <button
                  type="button"
                  onClick={() => setChecked([])}
                  className="text-[10px] text-[var(--text-muted)] hover:underline"
                >
                  Tout désélectionner
                </button>
              </div>
            ) : null}

            <DataTable>
              <thead>
                <tr>
                  <Th className="w-7">
                    <span className="sr-only">Sélection</span>
                  </Th>
                  <Th>Date DA</Th>
                  <Th>N° DA</Th>
                  <Th>Référence</Th>
                  <Th>Désignation</Th>
                  <Th>Fournisseur</Th>
                  <Th align="right">Qté dem.</Th>
                  <Th align="right">Qté val.</Th>
                  <Th>Priorité</Th>
                  <Th>Statut</Th>
                  <Th>Demandeur</Th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <Td className="py-6 text-center text-[var(--text-muted)]">
                      Aucune demande ne correspond à ces filtres.
                    </Td>
                  </tr>
                ) : (
                  rows.map((request) => (
                    <tr
                      key={request.id}
                      onClick={() => {
                        setSelectedId(
                          selectedId === request.id ? null : request.id
                        );
                        setConfirmDelete(false);
                        setApproveQty("");
                      }}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[var(--page)]",
                        selectedId === request.id && "bg-[var(--page)]"
                      )}
                    >
                      <Td>
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
                          aria-label={`Sélectionner ${request.number}`}
                          className="cursor-pointer"
                        />
                      </Td>
                      <Td nowrap>{formatDate(request.requested_at)}</Td>
                      <Td nowrap className="font-medium">
                        {request.number}
                      </Td>
                      <Td className="text-[var(--text-muted)]">
                        {request.reference ?? "—"}
                      </Td>
                      <Td className="max-w-[170px] truncate">
                        {request.designation}
                      </Td>
                      <Td className="max-w-[140px] truncate">
                        {request.supplier ?? "—"}
                      </Td>
                      <Td align="right">{formatInt(request.quantity_requested)}</Td>
                      <Td align="right">
                        {request.quantity_approved === null
                          ? "—"
                          : formatInt(request.quantity_approved)}
                      </Td>
                      <Td>
                        <RequestPriorityBadge priority={request.priority} />
                      </Td>
                      <Td>
                        <RequestStatusBadge status={request.status} />
                      </Td>
                      <Td className="max-w-[120px] truncate">
                        {request.requester}
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

          {/* ----------------------------------------- §5 — Analyse */}
          <div className="grid gap-3 md:grid-cols-3">
            <section className="card p-4">
              <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
                Répartition par statut
              </h2>
              <Donut
                centerLabel="Total"
                slices={data.byStatus.map((slice) => ({
                  key: slice.key,
                  label: REQUEST_STATUS_CONFIG[slice.key].label,
                  count: slice.count,
                  color: REQUEST_STATUS_CONFIG[slice.key].color,
                }))}
              />
            </section>

            <section className="card p-4">
              <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
                Répartition par priorité
              </h2>
              <Donut
                centerLabel="Total"
                slices={data.byPriority.map((slice) => ({
                  key: slice.key,
                  label: REQUEST_PRIORITY_CONFIG[slice.key].label,
                  count: slice.count,
                  color: REQUEST_PRIORITY_CONFIG[slice.key].color,
                }))}
              />
            </section>

            <section className="card p-4">
              <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
                Top 5 fournisseurs
              </h2>
              {data.topSuppliers.length === 0 ? (
                <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                  Aucune demande rattachée à un fournisseur.
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {data.topSuppliers.map((entry) => (
                    <li key={entry.supplier}>
                      <div className="mb-1 flex items-baseline justify-between gap-2">
                        <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text-primary)]">
                          {entry.supplier}
                        </span>
                        <span className="tnum shrink-0 text-[11px] font-semibold text-[var(--text-primary)]">
                          {formatInt(entry.count)}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-[var(--page)]">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${
                              (entry.count / data.topSuppliers[0].count) * 100
                            }%`,
                            background: "var(--series-1)",
                          }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </div>

        {/* ------------------------------------- §6 — Panneau de détail */}
        <aside className="space-y-3">
          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                Détail de la demande
              </h2>
              {selected ? <RequestStatusBadge status={selected.status} /> : null}
            </div>

            {!selected ? (
              <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                Sélectionnez une demande dans le tableau.
              </p>
            ) : (
              <>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[11px]">
                  <Detail label="N° Demande" value={selected.number} />
                  <Detail
                    label="Date"
                    value={formatDate(selected.requested_at)}
                  />
                  <Detail label="Référence" value={selected.reference ?? "—"} />
                  <Detail
                    label="Priorité"
                    node={<RequestPriorityBadge priority={selected.priority} />}
                  />
                  <Detail
                    label="Désignation"
                    value={selected.designation}
                    wide
                  />
                  <Detail
                    label="Fournisseur proposé"
                    value={selected.supplier ?? "—"}
                  />
                  <Detail label="Demandeur" value={selected.requester} />
                  <Detail
                    label="Qté demandée"
                    value={formatInt(selected.quantity_requested)}
                  />
                  <Detail
                    label="Qté validée"
                    value={
                      selected.quantity_approved === null
                        ? "—"
                        : formatInt(selected.quantity_approved)
                    }
                  />
                  {selected.estimated_unit_price !== null ? (
                    <Detail
                      label="P.U. estimé"
                      value={`${formatAmount(
                        selected.estimated_unit_price
                      )} TND`}
                    />
                  ) : null}
                  <Detail
                    label="Date de validation"
                    value={
                      selected.validated_at
                        ? formatDate(selected.validated_at)
                        : "—"
                    }
                  />
                  <Detail
                    label="Validé par"
                    value={selected.validated_by ?? "—"}
                  />
                  {selected.purchase_order_number ? (
                    <Detail
                      label="Bon de commande"
                      value={selected.purchase_order_number}
                      wide
                    />
                  ) : null}
                </dl>

                {selected.comment ? (
                  <div className="mt-3">
                    <div className="mb-1 text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                      Commentaire
                    </div>
                    <p className="rounded-lg bg-[var(--page)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
                      {selected.comment}
                    </p>
                  </div>
                ) : null}

                {selected.rejection_reason ? (
                  <p
                    className="mt-3 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed"
                    style={{
                      background:
                        "color-mix(in srgb, var(--critical) 10%, transparent)",
                      color: "var(--critical)",
                    }}
                  >
                    Motif du refus : {selected.rejection_reason}
                  </p>
                ) : null}

                {/* ------------------------------------ §7 — Actions */}
                {selected.status === "pending" ? (
                  <div className="mt-3 space-y-2 border-t border-[var(--border)] pt-3">
                    <div className="flex items-end gap-1.5">
                      <label className="flex-1">
                        <span className="mb-1 block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                          Qté à valider
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={selected.quantity_requested}
                          value={approveQty}
                          onChange={(event) => setApproveQty(event.target.value)}
                          placeholder={String(selected.quantity_requested)}
                          className={INPUT_CLASS}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() =>
                          run(() =>
                            approveRequest(
                              selected.id,
                              approveQty === ""
                                ? null
                                : Number.parseInt(approveQty, 10)
                            )
                          )
                        }
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white disabled:opacity-60"
                        style={{ background: "var(--good)" }}
                      >
                        <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden />
                        Valider
                      </button>
                    </div>

                    <div className="flex items-end gap-1.5">
                      <label className="flex-1">
                        <span className="mb-1 block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                          Motif de refus
                        </span>
                        <input
                          value={rejectReason}
                          onChange={(event) =>
                            setRejectReason(event.target.value)
                          }
                          placeholder="Obligatoire"
                          className={INPUT_CLASS}
                        />
                      </label>
                      <button
                        type="button"
                        disabled={pending || rejectReason.trim() === ""}
                        onClick={() => run(() => rejectRequest(selected.id, rejectReason))}
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white disabled:opacity-40"
                        style={{ background: "var(--critical)" }}
                      >
                        <XCircle size={13} strokeWidth={2.2} aria-hidden />
                        Refuser
                      </button>
                    </div>

                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => openEdit(selected)}
                        className="card inline-flex h-8 flex-1 items-center justify-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)]"
                      >
                        Modifier
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          confirmDelete
                            ? run(() => deleteRequest(selected.id))
                            : setConfirmDelete(true)
                        }
                        disabled={pending}
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium disabled:opacity-60"
                        style={{
                          background: confirmDelete
                            ? "var(--critical)"
                            : "transparent",
                          color: confirmDelete ? "#fff" : "var(--critical)",
                          boxShadow: confirmDelete
                            ? undefined
                            : "inset 0 0 0 1px var(--border)",
                        }}
                      >
                        <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                        {confirmDelete ? "Confirmer" : "Supprimer"}
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ------------------------------- §6.2 — Historique */}
          {selected ? (
            <section className="card p-4">
              <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
                Historique de la demande
              </h2>
              <ol className="space-y-3">
                {timeline.map((event) => {
                  const config =
                    event.kind === "approved"
                      ? REQUEST_STATUS_CONFIG.approved
                      : event.kind === "rejected"
                        ? REQUEST_STATUS_CONFIG.rejected
                        : event.kind === "converted"
                          ? REQUEST_STATUS_CONFIG.converted
                          : {
                              color: "var(--text-muted)",
                              Icon: FileText,
                            };
                  const Icon = config.Icon;
                  return (
                    <li key={event.id} className="flex gap-2.5">
                      <span
                        className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full"
                        style={{
                          background: `color-mix(in srgb, ${config.color} 14%, transparent)`,
                          color: config.color,
                        }}
                      >
                        <Icon size={12} strokeWidth={2.4} aria-hidden />
                      </span>
                      <div className="min-w-0">
                        <div className="text-[11px] font-medium text-[var(--text-primary)]">
                          {event.detail ?? event.kind}
                        </div>
                        <div className="text-[9px] text-[var(--text-muted)]">
                          {formatDateTime(event.occurred_at)}
                          {event.actor ? ` · par ${event.actor}` : ""}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ) : null}
        </aside>
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
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
          {label}
        </div>
        <div className="text-[20px] font-semibold leading-tight text-[var(--text-primary)]">
          {formatInt(value)}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">
          {note}
        </div>
      </div>
    </article>
  );
}

function Detail({
  label,
  value,
  node,
  wide,
}: {
  label: string;
  value?: string;
  node?: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={cn("min-w-0", wide && "col-span-2")}>
      <dt className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </dt>
      <dd className="truncate text-[var(--text-primary)]">{node ?? value}</dd>
    </div>
  );
}
