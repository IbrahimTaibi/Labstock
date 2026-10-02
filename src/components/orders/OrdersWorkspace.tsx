"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Ban,
  Banknote,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileText,
  Hourglass,
  Loader2,
  Plus,
  Printer,
  Receipt,
  Save,
  Search,
  Send,
  ShoppingCart,
  Trash2,
  TriangleAlert,
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
import { DataTable, Td, Th } from "@/components/DataTable";
import { cn, formatAmount, formatDate, formatInt } from "@/lib/utils";
import type {
  OrderCartLine,
  OrderLifecycle,
  OrdersWorkspaceData,
} from "@/lib/types";

const INPUT_CLASS =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)] disabled:opacity-60";

const DELIVERY_OPTIONS = [3, 7, 15, 30, 45, 60];
const PAYMENT_OPTIONS = ["Virement", "Chèque", "Espèces", "Carte"];
/* §4 — la devise est enregistrée telle quelle : aucune conversion n'est
   faite, les montants restent exprimés dans la devise de la commande. */
const CURRENCY_OPTIONS = ["TND", "EUR", "USD"];
const AVAILABLE_PAGE = 6;

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
  const [availablePage, setAvailablePage] = useState(0);
  const [manual, setManual] = useState({ productId: "" as number | "", qty: "1" });
  const [cancelReason, setCancelReason] = useState("");
  const [confirm, setConfirm] = useState<"delete" | "cancel" | "clear" | null>(
    null
  );

  /* Le réservoir suit le fournisseur ENREGISTRÉ du B.C. quand il existe :
     un fournisseur choisi dans la liste mais pas encore sauvé ne doit pas
     laisser verser des D.A. que la base refuserait ensuite. */
  const supplierForPool = current ? current.supplier_id : header.supplierId;

  const pool = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return data.available.filter((request) => {
      if (supplierForPool === "" || request.supplier_id !== supplierForPool)
        return false;
      if (!needle) return true;
      return (
        request.number.toLowerCase().includes(needle) ||
        (request.reference ?? "").toLowerCase().includes(needle) ||
        request.designation.toLowerCase().includes(needle) ||
        request.requester.toLowerCase().includes(needle)
      );
    });
  }, [data.available, supplierForPool, search]);

  const poolPages = Math.max(1, Math.ceil(pool.length / AVAILABLE_PAGE));
  const poolPage = Math.min(availablePage, poolPages - 1);
  const poolRows = pool.slice(
    poolPage * AVAILABLE_PAGE,
    poolPage * AVAILABLE_PAGE + AVAILABLE_PAGE
  );

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

  function headerInput(): OrderHeader {
    return {
      supplierId: Number(header.supplierId),
      orderDate: header.orderDate,
      deliveryDays: header.deliveryDays,
      paymentMethod: header.paymentMethod,
      currency: header.currency,
    };
  }

  /* §7 — contrôles calculés sur l'état réel du B.C., pas cochés d'office. */
  const lines = data.lines;
  const manualLines = lines.filter((line) => line.request_id === null).length;
  const checks: { label: string; state: "ok" | "warn" | "fail"; note: string }[] = [
    {
      label: "Traçabilité",
      state:
        lines.length === 0 ? "fail" : manualLines > 0 ? "warn" : "ok",
      note:
        lines.length === 0
          ? "Panier vide"
          : manualLines > 0
            ? `${manualLines} ligne(s) sans D.A.`
            : "Chaque ligne provient d'une D.A.",
    },
    {
      label: "Références",
      state: lines.every((line) => line.reference) && lines.length > 0 ? "ok" : "fail",
      note: lines.length === 0 ? "Aucune ligne" : "Référence sur chaque ligne",
    },
    {
      label: "Fournisseur identifié",
      state: supplierForPool === "" ? "fail" : "ok",
      note: supplierForPool === "" ? "À sélectionner" : "Renseigné",
    },
    {
      label: "Quantités",
      state:
        lines.length > 0 && lines.every((line) => line.quantity_ordered > 0)
          ? "ok"
          : "fail",
      note: "Strictement positives",
    },
    {
      label: "Calculs / prix",
      state:
        lines.length > 0 && lines.every((line) => line.unit_price > 0)
          ? "ok"
          : "fail",
      note: lines.some((line) => line.unit_price <= 0)
        ? "Prix manquant"
        : "Prix renseignés",
    },
    {
      label: "Délai de livraison",
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

  return (
    <>
      {/* -------------------------------------------------- §3 — 5 cartes */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="D.A. validées disponibles"
          value={formatInt(
            supplierForPool === ""
              ? data.available.length
              : data.available.filter((r) => r.supplier_id === supplierForPool)
                  .length
          )}
          note={
            supplierForPool === ""
              ? "Tous fournisseurs"
              : "Pour ce fournisseur"
          }
          color="var(--series-1)"
          icon={<FileText size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Articles dans le panier"
          value={formatInt(totals.line_count)}
          note="Lignes du B.C."
          color="var(--series-2)"
          icon={<ShoppingCart size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Total HT"
          value={formatAmount(totals.total_ht)}
          note={`Hors taxes · ${currency}`}
          color="var(--warning)"
          icon={<Banknote size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Montant TVA"
          value={formatAmount(totals.total_vat)}
          note="TVA totale"
          color="var(--series-5)"
          icon={<Receipt size={17} strokeWidth={2.2} aria-hidden />}
        />
        <Kpi
          label="Total TTC"
          value={formatAmount(totals.total_ttc)}
          note={`Toutes taxes · ${currency}`}
          color="var(--series-1)"
          icon={<Banknote size={17} strokeWidth={2.2} aria-hidden />}
        />
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          {/* -------------------------------- 1. Informations du B.C. */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                1. Informations du bon de commande
              </h2>
              {current ? <LifecycleBadge lifecycle={current.lifecycle} /> : null}
            </div>

            <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
              <Field label="N° Bon de commande">
                <input
                  value={current?.number ?? "Attribué à l'enregistrement"}
                  readOnly
                  aria-readonly
                  className={cn(INPUT_CLASS, "text-[var(--text-muted)]")}
                />
              </Field>
              <Field label="Date du B.C.">
                <input
                  type="date"
                  value={header.orderDate}
                  disabled={!editable}
                  onChange={(event) =>
                    setHeader({ ...header, orderDate: event.target.value })
                  }
                  className={INPUT_CLASS}
                />
              </Field>
              <Field label="Fournisseur *">
                <select
                  value={header.supplierId}
                  disabled={!editable}
                  onChange={(event) => {
                    setHeader({
                      ...header,
                      supplierId:
                        event.target.value === ""
                          ? ""
                          : Number(event.target.value),
                    });
                    setAvailablePage(0);
                  }}
                  className={INPUT_CLASS}
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
                      deliveryDays:
                        event.target.value === ""
                          ? null
                          : Number(event.target.value),
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
                  onChange={(event) =>
                    setHeader({ ...header, paymentMethod: event.target.value })
                  }
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
                  onChange={(event) =>
                    setHeader({ ...header, currency: event.target.value })
                  }
                  className={INPUT_CLASS}
                >
                  {CURRENCY_OPTIONS.map((code) => (
                    <option key={code}>{code}</option>
                  ))}
                </select>
              </Field>
            </div>

            {editable ? (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pending || header.supplierId === ""}
                  onClick={() =>
                    current
                      ? run(() => updateOrderHeader(current.id, headerInput()))
                      : run(
                          () => createOrderDraft(headerInput()),
                          (result) => {
                            if (result.orderId)
                              router.push(`/orders?order=${result.orderId}`);
                          }
                        )
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium text-white disabled:opacity-50"
                  style={{ background: "var(--series-1)" }}
                >
                  {pending ? (
                    <Loader2 size={13} className="animate-spin" aria-hidden />
                  ) : (
                    <Save size={13} strokeWidth={2.2} aria-hidden />
                  )}
                  {current ? "Enregistrer l'en-tête" : "Enregistrer le B.C."}
                </button>
                {!current ? (
                  <span className="self-center text-[10px] text-[var(--text-muted)]">
                    Le B.C. est créé en préparation ; le panier se remplit ensuite.
                  </span>
                ) : null}
              </div>
            ) : null}
          </section>

          {/* ------------------------------ 2. D.A. validées disponibles */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                2. D.A. validées disponibles
                <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                  ({formatInt(pool.length)})
                </span>
              </h2>
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
                    setAvailablePage(0);
                  }}
                  placeholder="Réf, désignation, demandeur…"
                  aria-label="Rechercher une D.A."
                  className={cn(INPUT_CLASS, "w-[210px] pl-7")}
                />
              </div>
            </div>

            {supplierForPool === "" ? (
              <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                Choisissez un fournisseur : seules ses D.A. validées sont proposées.
              </p>
            ) : (
              <>
                <DataTable>
                  <thead>
                    <tr>
                      <Th>Date D.A.</Th>
                      <Th>N° D.A.</Th>
                      <Th>Référence</Th>
                      <Th>Désignation</Th>
                      <Th align="right">Qté validée</Th>
                      <Th>Demandeur</Th>
                      <Th align="right">Action</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {poolRows.length === 0 ? (
                      <tr>
                        <Td className="py-6 text-center text-[var(--text-muted)]">
                          Aucune D.A. validée disponible pour ce fournisseur.
                        </Td>
                      </tr>
                    ) : (
                      poolRows.map((request) => (
                        <tr key={request.id}>
                          <Td nowrap>{formatDate(request.requested_at)}</Td>
                          <Td nowrap className="font-medium">
                            {request.number}
                          </Td>
                          <Td className="text-[var(--text-muted)]">
                            {request.reference ?? "—"}
                          </Td>
                          <Td className="max-w-[180px] truncate">
                            {request.designation}
                          </Td>
                          <Td align="right">{formatInt(request.quantity)}</Td>
                          <Td className="max-w-[120px] truncate">
                            {request.requester}
                          </Td>
                          <Td align="right">
                            <button
                              type="button"
                              disabled={!isDraft || pending}
                              onClick={() =>
                                current &&
                                run(() => addRequestLine(current.id, request.id))
                              }
                              title={
                                isDraft
                                  ? "Ajouter au panier"
                                  : "Enregistrez d'abord le B.C."
                              }
                              aria-label={`Ajouter ${request.number} au panier`}
                              className="inline-grid h-6 w-6 place-items-center rounded text-white disabled:opacity-40"
                              style={{ background: "var(--series-1)" }}
                            >
                              <Plus size={13} strokeWidth={2.6} aria-hidden />
                            </button>
                          </Td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </DataTable>

                {pool.length > AVAILABLE_PAGE ? (
                  <div className="mt-2 flex items-center justify-end gap-2 text-[10px] text-[var(--text-muted)]">
                    <span className="tnum">
                      {poolPage * AVAILABLE_PAGE + 1} –{" "}
                      {Math.min((poolPage + 1) * AVAILABLE_PAGE, pool.length)} sur{" "}
                      {formatInt(pool.length)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAvailablePage(Math.max(0, poolPage - 1))}
                      disabled={poolPage === 0}
                      aria-label="Page précédente"
                      className="card grid h-7 w-7 place-items-center disabled:opacity-40"
                    >
                      <ChevronLeft size={13} aria-hidden />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setAvailablePage(Math.min(poolPages - 1, poolPage + 1))
                      }
                      disabled={poolPage >= poolPages - 1}
                      aria-label="Page suivante"
                      className="card grid h-7 w-7 place-items-center disabled:opacity-40"
                    >
                      <ChevronRight size={13} aria-hidden />
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </section>

          {/* ------------------------- 3. Articles sélectionnés (panier) */}
          <section className="card p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                3. Articles sélectionnés pour le B.C.
                <span className="ml-1.5 font-normal text-[var(--text-muted)]">
                  ({formatInt(lines.length)})
                </span>
              </h2>
              {isDraft && lines.length > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    confirm === "clear"
                      ? run(() => clearCart(current!.id))
                      : setConfirm("clear")
                  }
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium"
                  style={{
                    color: confirm === "clear" ? "#fff" : "var(--critical)",
                    background:
                      confirm === "clear" ? "var(--critical)" : "transparent",
                    boxShadow:
                      confirm === "clear"
                        ? undefined
                        : "inset 0 0 0 1px var(--border)",
                  }}
                >
                  <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                  {confirm === "clear" ? "Confirmer le vidage" : "Vider le panier"}
                </button>
              ) : null}
            </div>

            {lines.length === 0 ? (
              <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
                {current
                  ? "Panier vide : ajoutez des D.A. depuis la liste ci-dessus."
                  : "Enregistrez le B.C. pour commencer à remplir le panier."}
              </p>
            ) : (
              <DataTable>
                <thead>
                  <tr>
                    <Th>Référence</Th>
                    <Th>Désignation</Th>
                    <Th>Origine</Th>
                    <Th align="right">Qté</Th>
                    <Th align="right">P.U. HT</Th>
                    <Th align="right">TVA %</Th>
                    <Th align="right">Total HT</Th>
                    {isDraft ? <Th align="right">Action</Th> : null}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <CartRow
                      key={`${line.id}-${line.quantity_ordered}-${line.unit_price}-${line.vat_rate}`}
                      line={line}
                      editable={isDraft}
                      pending={pending}
                      onSave={(fields) => run(() => updateLine(line.id, fields))}
                      onRemove={() => run(() => removeLine(line.id))}
                    />
                  ))}
                </tbody>
              </DataTable>
            )}

            {/* §6.2 « Ajouter manuellement » — exception documentée (§10.5). */}
            {isDraft ? (
              <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-[var(--border)] pt-3">
                <Field label="Ajout manuel (sans D.A.)" className="min-w-[220px] flex-1">
                  <select
                    value={manual.productId}
                    onChange={(event) =>
                      setManual({
                        ...manual,
                        productId:
                          event.target.value === ""
                            ? ""
                            : Number(event.target.value),
                      })
                    }
                    className={INPUT_CLASS}
                  >
                    <option value="">— Article du fournisseur —</option>
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
                    onChange={(event) =>
                      setManual({ ...manual, qty: event.target.value })
                    }
                    className={INPUT_CLASS}
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
                  className="card inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium text-[var(--series-1)] disabled:opacity-50"
                >
                  <Plus size={13} strokeWidth={2.4} aria-hidden />
                  Ajouter manuellement
                </button>
              </div>
            ) : null}
          </section>

          {/* ------------------------- §7 Vérifications & contrôles */}
          <section className="card p-4">
            <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
              Vérifications &amp; contrôles (ISO 15189)
            </h2>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {checks.map((check) => {
                const color =
                  check.state === "ok"
                    ? "var(--good)"
                    : check.state === "warn"
                      ? "var(--warning)"
                      : "var(--critical)";
                const Icon =
                  check.state === "ok"
                    ? CheckCircle2
                    : check.state === "warn"
                      ? TriangleAlert
                      : CircleAlert;
                return (
                  <li
                    key={check.label}
                    className="flex items-start gap-2 rounded-lg bg-[var(--page)] px-2.5 py-2"
                  >
                    <Icon
                      size={14}
                      strokeWidth={2.4}
                      style={{ color }}
                      className="mt-px shrink-0"
                      aria-hidden
                    />
                    <span className="min-w-0">
                      <span className="block text-[11px] font-medium text-[var(--text-primary)]">
                        {check.label}
                      </span>
                      <span className="block text-[9px]" style={{ color }}>
                        {check.state === "ok"
                          ? "Conforme"
                          : check.state === "warn"
                            ? "À vérifier"
                            : "Non conforme"}{" "}
                        · {check.note}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* ------------------------------------- §9 Barre d'actions */}
          {current ? (
            <section className="card flex flex-wrap items-center gap-2 p-3">
              {isDraft ? (
                <button
                  type="button"
                  disabled={pending || blocking}
                  title={
                    blocking
                      ? "Des contrôles sont non conformes"
                      : "Figer le B.C. et convertir ses D.A."
                  }
                  onClick={() => run(() => validateOrder(current.id))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium text-white disabled:opacity-40"
                  style={{ background: "var(--good)" }}
                >
                  <CheckCircle2 size={13} strokeWidth={2.2} aria-hidden />
                  Valider le B.C.
                </button>
              ) : null}

              {current.lifecycle === "approved" ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => run(() => sendOrder(current.id))}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-medium text-white disabled:opacity-60"
                  style={{ background: "var(--series-1)" }}
                >
                  <Send size={13} strokeWidth={2.2} aria-hidden />
                  Marquer comme envoyé
                </button>
              ) : null}

              <Link
                href={`/orders/${current.id}/print`}
                target="_blank"
                className="card inline-flex h-8 items-center gap-1.5 px-2.5 text-[11px] font-medium text-[var(--text-primary)]"
              >
                <Printer size={13} strokeWidth={2.2} aria-hidden />
                Imprimer B.C.
              </Link>

              {isDraft ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    confirm === "delete"
                      ? run(
                          () => deleteOrder(current.id),
                          () => router.push("/orders")
                        )
                      : setConfirm("delete")
                  }
                  className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium"
                  style={{
                    color: confirm === "delete" ? "#fff" : "var(--critical)",
                    background:
                      confirm === "delete" ? "var(--critical)" : "transparent",
                    boxShadow:
                      confirm === "delete"
                        ? undefined
                        : "inset 0 0 0 1px var(--border)",
                  }}
                >
                  <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                  {confirm === "delete" ? "Confirmer la suppression" : "Supprimer"}
                </button>
              ) : null}

              {current.lifecycle === "approved" || current.lifecycle === "sent" ? (
                confirm === "cancel" ? (
                  <div className="ml-auto flex flex-wrap items-center gap-1.5">
                    <input
                      value={cancelReason}
                      onChange={(event) => setCancelReason(event.target.value)}
                      placeholder="Motif d'annulation"
                      className={cn(INPUT_CLASS, "w-[200px]")}
                    />
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(() => cancelOrder(current.id, cancelReason))}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-white"
                      style={{ background: "var(--critical)" }}
                    >
                      <Ban size={13} strokeWidth={2.2} aria-hidden />
                      Confirmer
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirm(null)}
                      className="card inline-flex h-8 items-center px-2.5 text-[11px] text-[var(--text-secondary)]"
                    >
                      Renoncer
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirm("cancel")}
                    className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-medium text-[var(--critical)]"
                    style={{ boxShadow: "inset 0 0 0 1px var(--border)" }}
                  >
                    <Ban size={13} strokeWidth={2.2} aria-hidden />
                    Annuler le B.C.
                  </button>
                )
              ) : null}
            </section>
          ) : null}

          {feedback ? (
            <p
              role="status"
              className="rounded-lg px-2.5 py-2 text-[11px]"
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
        </div>

        {/* ------------------------------------------ §8 Panneau droit */}
        <aside className="space-y-3">
          <section className="card p-4">
            <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
              Résumé du B.C.
            </h2>
            <dl className="space-y-1.5 text-[11px]">
              <Line label="Nombre d'articles" value={formatInt(totals.line_count)} />
              <Line label="Total quantité" value={formatInt(totals.total_quantity)} />
              <Line label="Total HT" value={formatAmount(totals.total_ht)} />
              <Line label="Total TVA" value={formatAmount(totals.total_vat)} />
              <div className="mt-1 border-t border-[var(--border)] pt-1.5">
                <Line
                  label={`Total TTC (${currency})`}
                  value={formatAmount(totals.total_ttc)}
                  strong
                />
              </div>
            </dl>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-[var(--page)] px-2.5 py-2">
              <span className="text-[10px] text-[var(--text-secondary)]">
                Statut du B.C.
              </span>
              {current ? (
                <LifecycleBadge lifecycle={current.lifecycle} />
              ) : (
                <span className="text-[10px] text-[var(--text-muted)]">
                  Non enregistré
                </span>
              )}
            </div>
            {current?.cancellation_reason ? (
              <p className="mt-2 text-[10px] text-[var(--critical)]">
                Motif : {current.cancellation_reason}
              </p>
            ) : null}
          </section>

          <section className="card p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h2 className="text-[12px] font-semibold text-[var(--text-primary)]">
                B.C. récents
              </h2>
              <Link
                href="/orders"
                className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--series-1)] hover:underline"
              >
                <Plus size={11} strokeWidth={2.6} aria-hidden />
                Nouveau
              </Link>
            </div>
            {data.recent.length === 0 ? (
              <p className="py-3 text-center text-[11px] text-[var(--text-muted)]">
                Aucun bon de commande.
              </p>
            ) : (
              <ul className="space-y-1">
                {data.recent.slice(0, 12).map((order) => (
                  <li key={order.id}>
                    <Link
                      href={`/orders?order=${order.id}`}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-[var(--page)]",
                        current?.id === order.id && "bg-[var(--page)]"
                      )}
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[11px] font-medium text-[var(--text-primary)]">
                          {order.number}
                        </span>
                        <span className="block truncate text-[9px] text-[var(--text-muted)]">
                          {formatDate(order.order_date)} · {order.supplier ?? "—"}
                        </span>
                      </span>
                      <LifecycleBadge lifecycle={order.lifecycle} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
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
  const [price, setPrice] = useState(String(line.unit_price));
  const [vat, setVat] = useState(String(line.vat_rate));

  const parsed = {
    quantity: Number.parseInt(qty, 10),
    unitPrice: Number.parseFloat(price.replace(",", ".")),
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
    "h-7 w-20 rounded border border-[var(--border)] bg-[var(--page)] px-1.5 text-right text-[11px] tnum outline-none focus:border-[var(--series-1)]";

  return (
    <tr>
      <Td className="text-[var(--text-muted)]">{line.reference ?? "—"}</Td>
      <Td className="max-w-[170px] truncate">{line.product_name}</Td>
      <Td nowrap>
        {line.request_number ? (
          <span title={line.requester ?? undefined}>{line.request_number}</span>
        ) : (
          <span
            className="inline-flex items-center gap-1 text-[10px] font-medium"
            style={{ color: "var(--warning)" }}
            title="Ligne ajoutée sans demande d'achat : traçabilité amont non garantie"
          >
            <TriangleAlert size={11} strokeWidth={2.6} aria-hidden />
            Manuelle
          </span>
        )}
      </Td>
      <Td align="right">
        {editable ? (
          <input
            value={qty}
            onChange={(event) => setQty(event.target.value)}
            onBlur={commit}
            inputMode="numeric"
            aria-label="Quantité"
            className={cell}
          />
        ) : (
          formatInt(line.quantity_ordered)
        )}
      </Td>
      <Td align="right">
        {editable ? (
          <input
            value={price}
            onChange={(event) => setPrice(event.target.value)}
            onBlur={commit}
            inputMode="decimal"
            aria-label="Prix unitaire HT"
            className={cell}
          />
        ) : (
          formatAmount(line.unit_price)
        )}
      </Td>
      <Td align="right">
        {editable ? (
          <input
            value={vat}
            onChange={(event) => setVat(event.target.value)}
            onBlur={commit}
            inputMode="decimal"
            aria-label="Taux de TVA"
            className={cn(cell, "w-14")}
          />
        ) : (
          `${line.vat_rate} %`
        )}
      </Td>
      <Td align="right" className="font-semibold">
        {formatAmount(line.line_total_ht)}
      </Td>
      {editable ? (
        <Td align="right">
          <button
            type="button"
            disabled={pending}
            onClick={onRemove}
            title="Retirer du panier"
            aria-label={`Retirer ${line.product_name}`}
            className="inline-grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] hover:text-[var(--critical)]"
          >
            <Trash2 size={13} strokeWidth={2.2} aria-hidden />
          </button>
        </Td>
      ) : null}
    </tr>
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
        <div className="truncate text-[20px] font-semibold leading-tight text-[var(--text-primary)]">
          {value}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]">{note}</div>
      </div>
    </article>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("min-w-0", className)}>
      <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Line({
  label,
  value,
  strong,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-[var(--text-secondary)]">{label}</dt>
      <dd
        className={cn(
          "tnum shrink-0 text-[var(--text-primary)]",
          strong && "text-[13px] font-semibold"
        )}
      >
        {value}
      </dd>
    </div>
  );
}
