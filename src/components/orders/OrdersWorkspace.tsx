"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Banknote,
  Bell,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  Hourglass,
  List,
  Loader2,
  Lock,
  Pencil,
  Percent,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  TriangleAlert,
  X,
  XCircle,
} from "lucide-react";
import {
  addManualLine,
  addRequestLine,
  cancelOrder,
  clearCart,
  createOrderDraft,
  deleteOrder,
  removeLine,
  sendOrder,
  updateLine,
  updateOrderHeader,
  validateOrder,
  type OrderHeader,
  type OrderState,
} from "@/app/(app)/orders/actions";
import { ExportCsvButton } from "@/components/ExportCsvButton";
import { Pagination } from "@/components/Pagination";
import { cn, formatDate, formatInt, formatTnd } from "@/lib/utils";
import type {
  AvailableRequest,
  OrderCartLine,
  OrderLifecycle,
  OrdersWorkspaceData,
} from "@/lib/types";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:opacity-60";

const DELIVERY_OPTIONS = [3, 7, 15, 30, 45, 60];
const PAYMENT_OPTIONS = ["Virement", "Chèque", "Espèces", "Carte"];
/* §4 — la devise est enregistrée telle quelle : aucune conversion n'est
   faite, les montants restent exprimés dans la devise de la commande. */
const CURRENCY_OPTIONS = ["TND", "EUR", "USD"];
const RECENT_PREVIEW = 5;

export const LIFECYCLE_CONFIG: Record<
  OrderLifecycle,
  { label: string; color: string; Icon: typeof Hourglass }
> = {
  draft: { label: "En préparation", color: "var(--warning)", Icon: Hourglass },
  approved: { label: "Validé", color: "var(--good)", Icon: CheckCircle2 },
  sent: { label: "Envoyé", color: "var(--series-1)", Icon: Send },
  cancelled: { label: "Annulé", color: "var(--critical)", Icon: Ban },
};

export function LifecycleBadge({ lifecycle }: { lifecycle: OrderLifecycle }) {
  const { label, color, Icon } = LIFECYCLE_CONFIG[lifecycle];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden />
      {label}
    </span>
  );
}

const today = () => new Date().toISOString().slice(0, 10);

export function OrdersWorkspace({ data }: { data: OrdersWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<OrderState | null>(null);

  const current = data.current;
  const isDraft = current?.lifecycle === "draft";
  const editable = current === null || isDraft;

  const [header, setHeader] = useState({
    supplierId: current?.supplier_id ?? ("" as number | ""),
    orderDate: current?.order_date ?? today(),
    deliveryDays: current?.delivery_days ?? (7 as number | null),
    paymentMethod: current?.payment_method ?? "Virement",
    currency: current?.currency ?? "TND",
  });

  const [search, setSearch] = useState("");
  const [poolPage, setPoolPage] = useState(0);
  const [poolSize, setPoolSize] = useState(10);
  const [showManual, setShowManual] = useState(false);
  const [manual, setManual] = useState({ productId: "" as number | "", qty: "1" });
  const [cancelReason, setCancelReason] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "cancel" | "clear" | null>(
    null
  );
  const [showAllRecent, setShowAllRecent] = useState(false);

  /* Le réservoir suit le fournisseur ENREGISTRÉ du B.C. quand il existe :
     un fournisseur choisi dans la liste mais pas encore sauvé ne doit pas
     laisser verser des D.A. que la base refuserait ensuite. Sans B.C. ni
     fournisseur, toutes les D.A. sont proposées : en ajouter une crée le
     B.C. pour son fournisseur. */
  const supplierForPool = current ? current.supplier_id : header.supplierId;
  const supplierNames = useMemo(
    () => new Map(data.suppliers.map((s) => [s.id, s.name])),
    [data.suppliers]
  );
  const supplierName = (id: number) => supplierNames.get(id) ?? "—";

  const pool = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.available.filter((request) => {
      if (supplierForPool !== "" && request.supplier_id !== supplierForPool)
        return false;
      if (!needle) return true;
      return (
        request.number.toLowerCase().includes(needle) ||
        (request.reference ?? "").toLowerCase().includes(needle) ||
        request.designation.toLowerCase().includes(needle) ||
        request.requester.toLowerCase().includes(needle) ||
        (supplierNames.get(request.supplier_id) ?? "").toLowerCase().includes(needle)
      );
    });
  }, [data.available, supplierNames, supplierForPool, search]);

  const poolPages = Math.max(1, Math.ceil(pool.length / poolSize));
  const poolCurrent = Math.min(poolPage, poolPages - 1);
  const poolRows = pool.slice(poolCurrent * poolSize, poolCurrent * poolSize + poolSize);

  const supplierProducts = data.products.filter(
    (product) => product.supplier_id === supplierForPool
  );

  function run(action: () => Promise<OrderState>, after?: (r: OrderState) => void) {
    setFeedback(null);
    start(async () => {
      const result = await action();
      setFeedback(result);
      if (result.status === "success") {
        setConfirm(null);
        after?.(result);
        router.refresh();
      }
    });
  }

  function headerInput(supplierId = Number(header.supplierId)): OrderHeader {
    return {
      supplierId,
      orderDate: header.orderDate,
      deliveryDays: header.deliveryDays,
      paymentMethod: header.paymentMethod,
      currency: header.currency,
    };
  }

  /* « + » sur une D.A. : dans le B.C. ouvert, ou — sans B.C. — création du
     B.C. pour le fournisseur de la demande, puis ajout. Un seul geste pour
     démarrer une commande. */
  function addFromPool(request: AvailableRequest) {
    if (current) {
      run(() => addRequestLine(current.id, request.id));
      return;
    }
    setFeedback(null);
    start(async () => {
      const created = await createOrderDraft(headerInput(request.supplier_id));
      if (created.status !== "success" || !created.orderId) {
        setFeedback(created);
        return;
      }
      const added = await addRequestLine(created.orderId, request.id);
      setFeedback(
        added.status === "success"
          ? { ...added, message: `${created.message} ${request.number} ajoutée au panier.` }
          : added
      );
      router.push(`/orders?order=${created.orderId}`);
    });
  }

  function poolActionState(request: AvailableRequest) {
    if (!current) return { enabled: true, title: `Créer le B.C. ${supplierName(request.supplier_id)} et ajouter` };
    if (!isDraft) return { enabled: false, title: "Ce B.C. n'est plus en préparation" };
    if (request.supplier_id !== current.supplier_id)
      return { enabled: false, title: "D.A. d'un autre fournisseur" };
    return { enabled: true, title: "Ajouter au panier" };
  }

  /* §7 — contrôles calculés sur l'état réel du B.C., pas cochés d'office. */
  const lines = data.lines;
  const manualLines = lines.filter((line) => line.request_id === null).length;
  const checks: { label: string; state: "ok" | "warn" | "fail"; note: string }[] = [
    {
      label: "Traçabilité",
      state: lines.length === 0 ? "fail" : manualLines > 0 ? "warn" : "ok",
      note:
        lines.length === 0
          ? "Panier vide"
          : manualLines > 0
            ? `${manualLines} ligne(s) sans D.A.`
            : "Chaque ligne provient d'une D.A.",
    },
    {
      label: "Références validées",
      state: lines.every((line) => line.reference) && lines.length > 0 ? "ok" : "fail",
      note: lines.length === 0 ? "Aucune ligne" : "Référence sur chaque ligne",
    },
    {
      label: "Fournisseur identifié",
      state: supplierForPool === "" ? "fail" : "ok",
      note: supplierForPool === "" ? "À sélectionner" : "Renseigné",
    },
    {
      label: "Quantités validées",
      state:
        lines.length > 0 && lines.every((line) => line.quantity_ordered > 0)
          ? "ok"
          : "fail",
      note: "Strictement positives",
    },
    {
      label: "Calculs vérifiés",
      state:
        lines.length > 0 && lines.every((line) => line.unit_price > 0)
          ? "ok"
          : "fail",
      note: lines.some((line) => line.unit_price <= 0)
        ? "Prix manquant"
        : "Prix renseignés",
    },
    {
      label: "Délai cohérent",
      state: header.deliveryDays === null ? "warn" : "ok",
      note:
        header.deliveryDays === null
          ? "Non renseigné"
          : `${header.deliveryDays} jours`,
    },
  ];
  const blocking = checks.some((check) => check.state === "fail");

  const currency = current?.currency ?? header.currency;
  const totals = current ?? {
    line_count: 0,
    total_quantity: 0,
    total_ht: 0,
    total_vat: 0,
    total_ttc: 0,
  };
  const rates = new Set(lines.map((line) => line.vat_rate));
  const vatLabel = rates.size === 1 ? `Total TVA (${[...rates][0]}%)` : "Total TVA";
  const availableCount =
    supplierForPool === ""
      ? data.available.length
      : data.available.filter((r) => r.supplier_id === supplierForPool).length;

  const sectionTitle = "text-[12px] font-bold uppercase tracking-wide text-[var(--text-primary)]";
  const barButton =
    "flex h-11 items-center justify-center gap-2 rounded-lg px-3 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";
  const recent = showAllRecent ? data.recent : data.recent.slice(0, RECENT_PREVIEW);

  return (
    <>
      {/* -------------------------------------------------- §3 — 5 cartes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="D.A. validées disponibles"
          value={formatInt(availableCount)}
          note={supplierForPool === "" ? "Prêtes à être commandées" : "Pour ce fournisseur"}
          color="var(--series-1)"
          icon={<FileText size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Articles dans le panier"
          value={formatInt(totals.line_count)}
          note="Articles sélectionnés"
          color="var(--series-1)"
          icon={<ShoppingCart size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Total HT"
          value={formatTnd(totals.total_ht)}
          unit={currency}
          note="Montant hors taxes"
          color="var(--series-2)"
          icon={<Banknote size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Montant TVA"
          value={formatTnd(totals.total_vat)}
          unit={currency}
          note="TVA totale"
          color="var(--series-1)"
          icon={<Percent size={18} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Total TTC"
          value={formatTnd(totals.total_ttc)}
          unit={currency}
          note="Montant toutes taxes comprises"
          color="var(--series-1)"
          icon={<Banknote size={18} strokeWidth={2.2} aria-hidden />}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {feedback ? (
            <div
              role="status"
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
              style={{
                color: feedback.status === "success" ? "var(--good)" : "var(--critical)",
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

          {/* -------------------------------- 1. Informations du B.C. */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className={sectionTitle}>1. Informations du bon de commande</h2>
              {current ? <LifecycleBadge lifecycle={current.lifecycle} /> : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="N° Bon de commande">
                <div className="tnum flex h-10 items-center justify-between rounded-lg bg-[var(--page)] px-3 text-[12px] font-semibold text-[var(--text-primary)]">
                  <span className={cn("truncate", !current && "font-normal text-[var(--text-muted)]")}>
                    {current?.number ?? "Attribué à l'enregistrement"}
                  </span>
                  <Lock size={13} strokeWidth={2.2} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
                </div>
              </Field>
              <Field label="Date du B.C.">
                <input
                  type="date"
                  value={header.orderDate}
                  disabled={!editable}
                  onChange={(event) => setHeader({ ...header, orderDate: event.target.value })}
                  className={cn(INPUT_CLASS, "tnum font-semibold")}
                />
              </Field>
              <Field label="Fournisseur" required>
                <select
                  value={header.supplierId}
                  disabled={!editable}
                  onChange={(event) => {
                    setHeader({
                      ...header,
                      supplierId: event.target.value === "" ? "" : Number(event.target.value),
                    });
                    setPoolPage(0);
                  }}
                  className={cn(INPUT_CLASS, "font-semibold")}
                >
                  <option value="">— Choisir —</option>
                  {data.suppliers.map((supplier) => (
                    <option key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Délai de livraison">
                <select
                  value={header.deliveryDays ?? ""}
                  disabled={!editable}
                  onChange={(event) =>
                    setHeader({
                      ...header,
                      deliveryDays: event.target.value === "" ? null : Number(event.target.value),
                    })
                  }
                  className={INPUT_CLASS}
                >
                  <option value="">—</option>
                  {DELIVERY_OPTIONS.map((days) => (
                    <option key={days} value={days}>
                      {days} jours
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Mode de paiement">
                <select
                  value={header.paymentMethod}
                  disabled={!editable}
                  onChange={(event) => setHeader({ ...header, paymentMethod: event.target.value })}
                  className={INPUT_CLASS}
                >
                  {PAYMENT_OPTIONS.map((method) => (
                    <option key={method}>{method}</option>
                  ))}
                </select>
              </Field>
              <Field label="Devise">
                <select
                  value={header.currency}
                  disabled={!editable}
                  onChange={(event) => setHeader({ ...header, currency: event.target.value })}
                  className={INPUT_CLASS}
                >
                  {CURRENCY_OPTIONS.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <div className="grid gap-3 2xl:grid-cols-2">
            {/* ------------------------------ 2. D.A. validées disponibles */}
            <section className="card min-w-0 p-4">
              <h2 className={cn(sectionTitle, "mb-3")}>2. D.A. validées disponibles</h2>

              <div className="relative mb-3">
                <input
                  value={search}
                  onChange={(event) => {
                    setSearch(event.target.value);
                    setPoolPage(0);
                  }}
                  placeholder="Rechercher (Réf, Désignation, Demandeur…)"
                  aria-label="Rechercher une D.A."
                  className={cn(INPUT_CLASS, "h-9 pr-8 text-[11px]")}
                />
                <Search
                  size={14}
                  className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
              </div>

              {!current && supplierForPool === "" && data.available.length > 0 ? (
                <p className="mb-2 text-[10px] text-[var(--text-secondary)]">
                  Cliquez « + » sur une D.A. : le B.C. est créé pour son fournisseur.
                </p>
              ) : null}

              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[11px]">
                  <thead style={{ background: "var(--text-primary)" }}>
                    <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                      <th className="rounded-l-lg px-2 py-2.5">Date D.A.</th>
                      <th className="px-2 py-2.5">N° D.A.</th>
                      <th className="px-2 py-2.5">Référence</th>
                      <th className="px-2 py-2.5">Désignation</th>
                      <th className="px-2 py-2.5 text-right">Qté validée</th>
                      <th className="px-2 py-2.5">Demandeur</th>
                      <th className="w-9 rounded-r-lg px-2 py-2.5">
                        <span className="sr-only">Ajouter</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                          {supplierForPool === ""
                            ? "Aucune D.A. validée en attente de commande."
                            : "Aucune D.A. validée disponible pour ce fournisseur."}
                        </td>
                      </tr>
                    ) : (
                      poolRows.map((request) => {
                        const action = poolActionState(request);
                        return (
                          <tr key={request.id} className="border-b border-[var(--border)]">
                            <td className="tnum whitespace-nowrap px-2 py-2">
                              {formatDate(request.requested_at)}
                            </td>
                            <td className="tnum whitespace-nowrap px-2 py-2 font-semibold">
                              {request.number}
                            </td>
                            <td className="tnum px-2 py-2 text-[var(--text-secondary)]">
                              {request.reference ?? "—"}
                            </td>
                            <td className="max-w-[170px] px-2 py-2">
                              <span className="block truncate">{request.designation}</span>
                              {supplierForPool === "" ? (
                                <span className="block truncate text-[9px] text-[var(--text-muted)]">
                                  {supplierName(request.supplier_id)}
                                </span>
                              ) : null}
                            </td>
                            <td className="tnum px-2 py-2 text-right">{formatInt(request.quantity)}</td>
                            <td className="max-w-[110px] truncate px-2 py-2">{request.requester}</td>
                            <td className="px-2 py-2 text-center">
                              <button
                                type="button"
                                disabled={!action.enabled || pending}
                                onClick={() => addFromPool(request)}
                                title={action.title}
                                aria-label={`Ajouter ${request.number} au panier`}
                                className="inline-grid h-7 w-7 place-items-center rounded-md text-white disabled:opacity-35"
                                style={{ background: "var(--series-1)" }}
                              >
                                <Plus size={14} strokeWidth={2.6} aria-hidden />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <Pagination
                page={poolCurrent}
                pageCount={poolPages}
                pageSize={poolSize}
                total={pool.length}
                onPage={setPoolPage}
                onPageSize={(size) => {
                  setPoolSize(size);
                  setPoolPage(0);
                }}
              />
              <button
                type="button"
                onClick={() => start(() => router.refresh())}
                className="mx-auto mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--series-1)] hover:underline"
              >
                <RefreshCw size={13} strokeWidth={2.2} className={cn(pending && "animate-spin")} aria-hidden />
                Actualiser la liste
              </button>
            </section>

            {/* ------------------------- 3. Articles sélectionnés (panier) */}
            <section className="card min-w-0 p-4">
              <h2 className={cn(sectionTitle, "mb-3")}>3. Articles sélectionnés pour le B.C.</h2>

              <div className="-mx-1 overflow-x-auto">
                <table className="w-full min-w-[560px] border-collapse text-[11px]">
                  <thead style={{ background: "var(--text-primary)" }}>
                    <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                      <th className="rounded-l-lg px-2 py-2.5">Référence</th>
                      <th className="px-2 py-2.5">Désignation</th>
                      <th className="px-2 py-2.5 text-right">Qté</th>
                      <th className="px-2 py-2.5 text-right">Prix unitaire (HT)</th>
                      <th className="px-2 py-2.5 text-right">Total HT</th>
                      <th className={cn("px-2 py-2.5 text-right", !isDraft && "rounded-r-lg")}>TVA</th>
                      {isDraft ? (
                        <th className="w-9 rounded-r-lg px-2 py-2.5">
                          <span className="sr-only">Retirer</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-[var(--text-muted)]">
                          {current
                            ? "Panier vide : ajoutez des D.A. depuis la liste."
                            : "Ajoutez une D.A. ou enregistrez le B.C. pour commencer le panier."}
                        </td>
                      </tr>
                    ) : (
                      lines.map((line) => (
                        <CartRow
                          key={`${line.id}-${line.quantity_ordered}-${line.unit_price}-${line.vat_rate}`}
                          line={line}
                          editable={isDraft}
                          pending={pending}
                          onSave={(fields) => run(() => updateLine(line.id, fields))}
                          onRemove={() => run(() => removeLine(line.id))}
                        />
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* §6.2 « Ajouter manuellement » — exception documentée (§10.5). */}
              {isDraft && showManual ? (
                <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-[var(--page)] p-2.5">
                  <Field label="Article du fournisseur (sans D.A.)" className="min-w-[200px] flex-1">
                    <select
                      value={manual.productId}
                      onChange={(event) =>
                        setManual({
                          ...manual,
                          productId: event.target.value === "" ? "" : Number(event.target.value),
                        })
                      }
                      className={cn(INPUT_CLASS, "h-9 text-[11px]")}
                    >
                      <option value="">— Choisir —</option>
                      {supplierProducts.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Qté" className="w-20">
                    <input
                      type="number"
                      min={1}
                      value={manual.qty}
                      onChange={(event) => setManual({ ...manual, qty: event.target.value })}
                      className={cn(INPUT_CLASS, "h-9 text-[11px]")}
                    />
                  </Field>
                  <button
                    type="button"
                    disabled={pending || manual.productId === ""}
                    onClick={() =>
                      run(
                        () =>
                          addManualLine(
                            current!.id,
                            Number(manual.productId),
                            Number.parseInt(manual.qty, 10)
                          ),
                        () => setManual({ productId: "", qty: "1" })
                      )
                    }
                    className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--series-1)" }}
                  >
                    <Plus size={13} strokeWidth={2.4} aria-hidden />
                    Ajouter
                  </button>
                </div>
              ) : null}

              {isDraft ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                  <button
                    type="button"
                    disabled={lines.length === 0 || pending}
                    onClick={() =>
                      confirm === "clear" ? run(() => clearCart(current!.id)) : setConfirm("clear")
                    }
                    onBlur={() => confirm === "clear" && setConfirm(null)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold disabled:opacity-40"
                    style={{ color: "var(--critical)" }}
                  >
                    <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                    {confirm === "clear" ? "Confirmer le vidage ?" : "Vider le panier"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowManual((v) => !v)}
                    className="flex items-center gap-1.5 text-[11px] font-semibold text-[var(--series-1)] hover:underline"
                  >
                    {showManual ? <X size={13} aria-hidden /> : <Plus size={13} strokeWidth={2.4} aria-hidden />}
                    {showManual ? "Fermer l'ajout manuel" : "Ajouter manuellement"}
                  </button>
                </div>
              ) : null}
            </section>
          </div>

          {/* ------------------------- §7 Vérifications & contrôles */}
          <section className="card p-4">
            <h2 className={cn(sectionTitle, "mb-3")}>Vérifications &amp; contrôles (ISO 15189)</h2>
            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {checks.map((check) => {
                const color =
                  check.state === "ok"
                    ? "var(--good)"
                    : check.state === "warn"
                      ? "var(--warning)"
                      : "var(--critical)";
                const Icon =
                  check.state === "ok" ? CheckCircle2 : check.state === "warn" ? TriangleAlert : CircleAlert;
                return (
                  <li key={check.label} className="flex items-start gap-2" title={check.note}>
                    <Icon size={18} strokeWidth={2.2} style={{ color }} className="shrink-0" aria-hidden />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold text-[var(--text-primary)]">
                        {check.label}
                      </span>
                      <span className="block text-[10px]" style={{ color }}>
                        {check.state === "ok" ? "Conforme" : check.state === "warn" ? "À vérifier" : "Non conforme"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>

        {/* ------------------------------------------ §8 Panneau droit */}
        <aside className="space-y-3">
          <section className="card p-4">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
              Résumé du B.C.
            </h2>
            <dl className="space-y-2 text-[11px]">
              <Line label="Total HT" value={`${formatTnd(totals.total_ht)} ${currency}`} />
              <Line label={vatLabel} value={`${formatTnd(totals.total_vat)} ${currency}`} />
              <Line label="Nombre d'articles" value={formatInt(totals.line_count)} />
              <Line label="Total quantité" value={formatInt(totals.total_quantity)} />
            </dl>
            <div
              className="mt-3 flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-[var(--surface)]"
              style={{ background: "var(--text-primary)" }}
            >
              <span className="text-[12px] font-bold">Total TTC</span>
              <span className="tnum text-[17px] font-extrabold">
                {formatTnd(totals.total_ttc)} <span className="text-[10px] font-semibold">{currency}</span>
              </span>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--page)] px-3 py-2">
              <span className="text-[11px] text-[var(--text-secondary)]">Statut du B.C.</span>
              {current ? (
                <LifecycleBadge lifecycle={current.lifecycle} />
              ) : (
                <span className="text-[10px] text-[var(--text-muted)]">Non enregistré</span>
              )}
            </div>
            {current?.cancellation_reason ? (
              <p className="mt-2 text-[10px] text-[var(--critical)]">
                Motif : {current.cancellation_reason}
              </p>
            ) : null}

            {/* Suite du cycle de vie après validation. */}
            {current?.lifecycle === "approved" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => sendOrder(current.id))}
                className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-60"
                style={{ background: "var(--series-1)" }}
              >
                <Send size={13} strokeWidth={2.2} aria-hidden />
                Marquer comme envoyé
              </button>
            ) : null}
            {current?.lifecycle === "approved" || current?.lifecycle === "sent" ? (
              confirm === "cancel" ? (
                <div className="mt-2 space-y-1.5">
                  <input
                    value={cancelReason}
                    onChange={(event) => setCancelReason(event.target.value)}
                    placeholder="Motif d'annulation"
                    className={cn(INPUT_CLASS, "h-9 text-[11px]")}
                  />
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => cancelOrder(current.id, cancelReason))}
                      className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white"
                      style={{ background: "var(--critical)" }}
                    >
                      <Ban size={13} strokeWidth={2.2} aria-hidden />
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(null)}
                      className="flex h-8 items-center rounded-lg border border-[var(--border)] px-3 text-[11px] text-[var(--text-secondary)]"
                    >
                      Renoncer
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirm("cancel")}
                  className="mt-2 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] text-[11px] font-semibold text-[var(--critical)] hover:bg-[var(--page)]"
                >
                  <Ban size={13} strokeWidth={2.2} aria-hidden />
                  Annuler le B.C.
                </button>
              )
            ) : null}
          </section>

          <section className="card p-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[11px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
                Historique des B.C. récents
              </h2>
              <Link
                href="/orders"
                className="inline-flex items-center gap-1 text-[10px] font-semibold text-[var(--series-1)] hover:underline"
              >
                <Plus size={11} strokeWidth={2.6} aria-hidden />
                Nouveau
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">Aucun bon de commande.</p>
            ) : (
              <ul className="divide-y divide-[var(--border)]">
                {recent.map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/orders?order=${order.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-md px-1.5 py-2 transition-colors hover:bg-[var(--page)]",
                        current?.id === order.id && "bg-[var(--page)]"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="tnum block truncate text-[11px] font-semibold text-[var(--text-primary)]">
                          {order.number}
                        </span>
                        <span className="tnum block truncate text-[9px] text-[var(--text-muted)]">
                          {formatDate(order.order_date)} · {order.supplier ?? "—"}
                        </span>
                      </span>
                      <LifecycleBadge lifecycle={order.lifecycle} />
                      <ChevronRight size={13} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {data.recent.length > RECENT_PREVIEW ? (
              <button
                type="button"
                onClick={() => setShowAllRecent((v) => !v)}
                className="mx-auto mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-[var(--series-1)] hover:underline"
              >
                <List size={13} strokeWidth={2.2} aria-hidden />
                {showAllRecent ? "Réduire" : "Voir tout l'historique"}
              </button>
            ) : null}
          </section>
        </aside>
      </div>

      {/* ---------------------------------------------- Barre d'actions */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <button
          type="button"
          disabled={current !== null || header.supplierId === "" || pending}
          onClick={() =>
            run(
              () => createOrderDraft(headerInput()),
              (result) => {
                if (result.orderId) router.push(`/orders?order=${result.orderId}`);
              }
            )
          }
          title={
            current
              ? "B.C. déjà enregistré : utilisez « Modifier »"
              : header.supplierId === ""
                ? "Choisissez un fournisseur"
                : "Créer le B.C. en préparation"
          }
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-1)" }}
        >
          {pending && !current ? (
            <Loader2 size={16} className="animate-spin" aria-hidden />
          ) : (
            <Save size={16} strokeWidth={2.2} aria-hidden />
          )}
          Enregistrer le B.C.
        </button>
        <button
          type="button"
          disabled={!isDraft || blocking || pending}
          onClick={() => current && run(() => validateOrder(current.id))}
          title={
            !isDraft
              ? "Seul un B.C. en préparation se valide"
              : blocking
                ? "Des contrôles sont non conformes"
                : "Figer le B.C. et convertir ses D.A."
          }
          className={cn(barButton, "text-white")}
          style={{ background: "var(--good)" }}
        >
          <CheckCircle2 size={16} strokeWidth={2.2} aria-hidden />
          Valider le B.C.
        </button>
        <button
          type="button"
          disabled={!isDraft || header.supplierId === "" || pending}
          onClick={() => current && run(() => updateOrderHeader(current.id, headerInput()))}
          title={isDraft ? "Enregistrer les informations du B.C." : "Seul un B.C. en préparation se modifie"}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--series-2)" }}
        >
          <Pencil size={16} strokeWidth={2.2} aria-hidden />
          Modifier
        </button>
        <button
          type="button"
          disabled={!isDraft || pending}
          onClick={() =>
            current &&
            (confirm === "delete"
              ? run(() => deleteOrder(current.id), () => router.push("/orders"))
              : setConfirm("delete"))
          }
          onBlur={() => confirm === "delete" && setConfirm(null)}
          title={isDraft ? undefined : "Seul un B.C. en préparation se supprime ; sinon, annulez-le"}
          className={cn(barButton, "text-white")}
          style={{ background: "var(--critical)" }}
        >
          <Trash2 size={16} strokeWidth={2.2} aria-hidden />
          {confirm === "delete" ? "Confirmer ?" : "Supprimer"}
        </button>
        <button
          type="button"
          disabled={!current}
          onClick={() => current && window.open(`/orders/${current.id}/print`, "_blank")}
          className={cn(barButton, "card text-[var(--text-primary)] hover:bg-[var(--page)] hover:opacity-100")}
        >
          <Printer size={16} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Imprimer B.C.
        </button>
        <ExportCsvButton
          kind="orders"
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
          title="ISO 15189:2022"
          text="Traçabilité complète des commandes. Enregistrement conforme aux exigences."
        />
        <Assurance
          icon={<Lock size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Sécurité & Droits"
          text="Accès contrôlé selon les permissions. Un B.C. validé ne se réécrit plus."
        />
        <Assurance
          icon={<ClipboardList size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Données sécurisées"
          text="Chaque ligne garde le lien vers sa demande d'achat d'origine."
        />
        <Assurance
          icon={<Bell size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-2)"
          title="Contrôles automatiques"
          text="Les anomalies (prix, références, quantités) bloquent la validation."
        />
        <Assurance
          icon={<CalendarDays size={18} strokeWidth={2.2} aria-hidden />}
          color="var(--series-1)"
          title="Documents liés"
          text="Génération PDF du B.C. et export Excel des commandes."
        />
      </div>
    </>
  );
}

/* Ligne du panier. L'état local est réinitialisé par la `key` parente à
   chaque rafraîchissement : ce qu'on voit est toujours ce que la base a. */
function CartRow({
  line,
  editable,
  pending,
  onSave,
  onRemove,
}: {
  line: OrderCartLine;
  editable: boolean;
  pending: boolean;
  onSave: (fields: { quantity: number; unitPrice: number; vatRate: number }) => void;
  onRemove: () => void;
}) {
  const [qty, setQty] = useState(String(line.quantity_ordered));
  const [price, setPrice] = useState(String(line.unit_price).replace(".", ","));
  const [vat, setVat] = useState(String(line.vat_rate));

  const parsed = {
    quantity: Number.parseInt(qty, 10),
    unitPrice: Number.parseFloat(price.replace(/\s/g, "").replace(",", ".")),
    vatRate: Number.parseFloat(vat.replace(",", ".")),
  };
  const dirty =
    parsed.quantity !== line.quantity_ordered ||
    parsed.unitPrice !== line.unit_price ||
    parsed.vatRate !== line.vat_rate;

  function commit() {
    if (dirty) onSave(parsed);
  }

  const cell =
    "h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 text-right text-[11px] tnum outline-none focus:border-[var(--series-1)]";

  return (
    <tr className="border-b border-[var(--border)]">
      <td className="tnum px-2 py-1.5 text-[var(--text-secondary)]">{line.reference ?? "—"}</td>
      <td className="max-w-[170px] px-2 py-1.5">
        <span className="block truncate">{line.product_name}</span>
        <span className="block text-[9px]">
          {line.request_number ? (
            <span className="text-[var(--text-muted)]" title={line.requester ?? undefined}>
              {line.request_number}
            </span>
          ) : (
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--warning)" }}
              title="Ligne ajoutée sans demande d'achat : traçabilité amont non garantie"
            >
              <TriangleAlert size={10} strokeWidth={2.6} aria-hidden />
              Manuelle
            </span>
          )}
        </span>
      </td>
      <td className="px-1 py-1.5 text-right">
        {editable ? (
          <input
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            onBlur={commit}
            inputMode="numeric"
            aria-label="Quantité"
            className={cn(cell, "w-16")}
          />
        ) : (
          <span className="tnum">{formatInt(line.quantity_ordered)}</span>
        )}
      </td>
      <td className="px-1 py-1.5 text-right">
        {editable ? (
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            onBlur={commit}
            inputMode="decimal"
            aria-label="Prix unitaire HT"
            className={cn(cell, "w-24")}
          />
        ) : (
          <span className="tnum">{formatTnd(line.unit_price)}</span>
        )}
      </td>
      <td className="tnum px-2 py-1.5 text-right font-semibold">{formatTnd(line.line_total_ht)}</td>
      <td className="px-1 py-1.5 text-right">
        {editable ? (
          <span className="inline-flex items-center gap-0.5">
            <input
              value={vat}
              onChange={(event) => setVat(event.target.value)}
              onBlur={commit}
              inputMode="decimal"
              aria-label="Taux de TVA"
              className={cn(cell, "w-11")}
            />
            <span className="text-[10px] text-[var(--text-muted)]">%</span>
          </span>
        ) : (
          <span className="tnum">{line.vat_rate}%</span>
        )}
      </td>
      {editable ? (
        <td className="px-1 py-1.5 text-center">
          <button
            type="button"
            disabled={pending}
            onClick={onRemove}
            title="Retirer du panier"
            aria-label={`Retirer ${line.product_name}`}
            className="inline-grid h-7 w-7 place-items-center rounded-md hover:bg-[var(--page)]"
            style={{ color: "var(--critical)" }}
          >
            <Trash2 size={13} strokeWidth={2.2} aria-hidden />
          </button>
        </td>
      ) : null}
    </tr>
  );
}

function Kpi({
  label,
  value,
  unit,
  note,
  color,
  icon,
}: {
  label: string;
  value: string;
  unit?: string;
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
          {unit ? <span className="ml-1 text-[11px] font-semibold">{unit}</span> : null}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">{note}</div>
      </div>
    </article>
  );
}

function Field({
  label,
  required,
  children,
  className,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
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

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd className="tnum shrink-0 font-semibold text-[var(--text-primary)]">{value}</dd>
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
