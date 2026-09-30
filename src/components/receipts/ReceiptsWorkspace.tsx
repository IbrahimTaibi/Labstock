"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  History,
  Package,
  Pencil,
  Printer,
  RefreshCw,
  RotateCcw,
  Star,
  Trash2,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { cancelReceipt, receiveGoods } from "@/app/(app)/receipts/actions";
import { Td, Th } from "@/components/DataTable";
import { Field, Input, ReadOnlyValue } from "@/components/goods/Field";
import { FefoStatus } from "@/components/goods/FefoBadge";
import { packagePrice } from "@/lib/packaging";
import type { OrderLine, ReceiptsWorkspaceData } from "@/lib/types";
import { formatAmount, formatDate, formatDateTime, formatInt } from "@/lib/utils";
import { ComplianceChecks, type ComplianceCheck } from "./ComplianceChecks";
import { DeliveryBadge } from "./DeliveryBadge";
import { buildNotices, ReceiptNotices } from "./ReceiptNotices";

type Feedback = { message: string; ok: boolean } | null;

/** Réception validée dans cette session : cible de l'étiquette et de l'annulation. */
type LastReceipt = {
  receiptId: number;
  lotId: number;
  lotNumber: string;
  quantity: number;
  fefoRank: number | null;
  lotCreated: boolean;
  lineId: number;
  expiry: string;
};

const price3 = (value: number) => value.toFixed(3).replace(".", ",");

export function ReceiptsWorkspace({ data }: { data: ReceiptsWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [lastReceipt, setLastReceipt] = useState<LastReceipt | null>(null);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);

  const firstOpen =
    data.lines.find((line) => line.quantity_remaining > 0) ?? data.lines[0] ?? null;
  const [selectedId, setSelectedId] = useState<number | null>(firstOpen?.id ?? null);

  const selected =
    data.lines.find((line) => line.id === selectedId) ?? firstOpen ?? null;

  const [quantity, setQuantity] = useState<string>("");
  const [lotNumber, setLotNumber] = useState("");
  const [expiry, setExpiry] = useState("");

  function clearFields() {
    setQuantity("");
    setLotNumber("");
    setExpiry("");
  }

  function selectLine(line: OrderLine) {
    setSelectedId(line.id);
    clearFields();
    setFeedback(null);
  }

  /* Bouton « Réinitialiser » : vide aussi le message. Après un succès on ne
     vide que les champs, sinon la confirmation disparaîtrait aussitôt. */
  function reset() {
    clearFields();
    setFeedback(null);
  }

  const parsedQuantity = Number(quantity);
  const value =
    selected && Number.isFinite(parsedQuantity)
      ? parsedQuantity * selected.unit_price
      : 0;

  const priceHt = selected
    ? packagePrice(selected.unit_price, selected.packaging)
    : null;

  const daysBeforeExpiry = useMemo(() => {
    if (!expiry) return null;
    const today = new Date().setHours(0, 0, 0, 0);
    return Math.round((new Date(expiry).getTime() - today) / 86_400_000);
  }, [expiry]);

  /* Aperçu du rang FEFO : le lot reçu se classe parmi les lots consommables
     du produit d'après la date saisie. Le serveur recalcule le rang réel. */
  const fefoPreview = useMemo(() => {
    if (!selected || !expiry || daysBeforeExpiry === null || daysBeforeExpiry <= 0)
      return null;
    const existingLotIndex = selected.fefoLots.findIndex(
      (lot) => lot.lot_number === lotNumber.trim() && lot.expiry_date === expiry
    );
    const rank =
      existingLotIndex >= 0
        ? existingLotIndex + 1
        : selected.fefoLots.filter((lot) => lot.expiry_date <= expiry).length + 1;
    return { rank };
  }, [selected, expiry, daysBeforeExpiry, lotNumber]);

  const checks: ComplianceCheck[] = useMemo(() => {
    const remaining = selected?.quantity_remaining ?? 0;
    const quantityOk =
      Number.isInteger(parsedQuantity) &&
      parsedQuantity > 0 &&
      parsedQuantity <= remaining;

    return [
      {
        label: "Date de péremption valide",
        passed: daysBeforeExpiry !== null && daysBeforeExpiry > 0,
        detail:
          daysBeforeExpiry === null
            ? "Date non renseignée"
            : daysBeforeExpiry > 0
              ? `${formatInt(daysBeforeExpiry)} jours avant péremption`
              : "La date est déjà atteinte",
      },
      {
        label: "Numéro de lot renseigné",
        passed: lotNumber.trim().length > 0,
        detail: lotNumber.trim() ? undefined : "Obligatoire pour la traçabilité",
      },
      {
        label: "Quantité conforme au reste à recevoir",
        passed: quantityOk,
        detail: quantityOk
          ? `${formatInt(parsedQuantity)} sur ${formatInt(remaining)} attendus`
          : `Doit être entre 1 et ${formatInt(remaining)}`,
      },
      {
        label: "Fournisseur identifié",
        passed: Boolean(selected?.supplier && selected.supplier !== "—"),
        detail: selected?.supplier,
      },
      {
        label: "Priorité FEFO recalculée à l'enregistrement",
        passed: Boolean(fefoPreview),
        detail: fefoPreview
          ? `Rang prévisionnel ${fefoPreview.rank} · confirmé à l'enregistrement`
          : "Nécessite une date valide",
      },
      {
        label: "Traçabilité assurée",
        passed: quantityOk && lotNumber.trim().length > 0,
        detail: "Lot, mouvement d'entrée et opérateur enregistrés ensemble",
      },
      {
        label: "Réception conforme",
        passed:
          daysBeforeExpiry !== null &&
          daysBeforeExpiry > 0 &&
          lotNumber.trim().length > 0 &&
          quantityOk &&
          Boolean(selected?.supplier && selected.supplier !== "—") &&
          Boolean(fefoPreview),
        detail: "Tous les contrôles requis doivent être validés",
      },
    ];
  }, [selected, parsedQuantity, lotNumber, daysBeforeExpiry, fefoPreview]);

  const ready = checks.every((check) => check.passed) && Boolean(selected);

  function submit() {
    if (!selected) return;
    setFeedback(null);
    const submitted = { lineId: selected.id, expiry, lotNumber };
    start(async () => {
      const result = await receiveGoods({
        orderLineId: selected.id,
        quantity: parsedQuantity,
        lotNumber,
        expiryDate: expiry,
      });
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success" && result.receipt) {
        setLastReceipt({
          receiptId: result.receipt.receiptId,
          lotId: result.receipt.lotId,
          lotNumber: result.receipt.lotNumber,
          quantity: result.receipt.quantity,
          fefoRank: result.receipt.fefoRank,
          lotCreated: result.receipt.lotCreated,
          lineId: submitted.lineId,
          expiry: submitted.expiry,
        });
        clearFields();
        router.refresh();
      }
    });
  }

  /**
   * « Annuler la réception » et « Modifier » partagent la même écriture
   * inverse. La seule différence est ce qu'on fait ensuite : repartir de
   * zéro, ou recharger la saisie pour la corriger.
   */
  function reverse(
    receiptId: number,
    options: { refill?: LastReceipt; reason?: string } = {}
  ) {
    setConfirmCancel(null);
    setFeedback(null);
    start(async () => {
      const result = await cancelReceipt(
        receiptId,
        options.reason ?? (options.refill ? "Correction de saisie" : undefined)
      );
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status !== "success") return;

      if (options.refill) {
        setSelectedId(options.refill.lineId);
        setQuantity(String(options.refill.quantity));
        setLotNumber(options.refill.lotNumber);
        setExpiry(options.refill.expiry);
      }
      setLastReceipt(null);
      router.refresh();
    });
  }

  const summary = {
    ordered: data.lines.length,
    received: data.lines.filter((line) => line.delivery_status === "received").length,
    outstanding: data.lines.filter((line) => line.delivery_status !== "received")
      .length,
    unitsRemaining: data.lines.reduce(
      (sum, line) => sum + line.quantity_remaining,
      0
    ),
  };

  const notices = buildNotices({
    outstandingLines: summary.outstanding,
    unitsRemaining: summary.unitsRemaining,
    lastReceipt,
  });

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        {/* 1 — Bon de commande */}
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              1. Bon de commande
            </h2>
            <div className="flex items-center gap-2">
              {data.selectedOrder ? (
                <DeliveryBadge status={data.selectedOrder.status} />
              ) : null}
              <SyncBadge lastReceiptAt={data.totals.lastReceiptAt} />
              {data.selectedOrder ? (
                <a
                  href={`/orders/${data.selectedOrder.id}/print`}
                  target="_blank"
                  rel="noopener"
                  title="Consulter le bon de commande"
                  className="grid h-[26px] w-[26px] place-items-center rounded-lg border border-[var(--border)] text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
                >
                  <FileText size={13} aria-hidden />
                  <span className="sr-only">Consulter le bon de commande</span>
                </a>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Numéro de bon de commande" required>
              <select
                value={data.selectedOrder?.number ?? ""}
                onChange={(event) =>
                  router.push(
                    `/receipts?order=${encodeURIComponent(event.target.value)}`
                  )
                }
                className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]"
              >
                {data.orders.map((order) => (
                  <option key={order.id} value={order.number}>
                    {order.number}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fournisseur" locked>
              <ReadOnlyValue>{data.selectedOrder?.supplier ?? "—"}</ReadOnlyValue>
            </Field>
            <Field label="Date de la commande" locked>
              <ReadOnlyValue>
                {data.selectedOrder ? formatDate(data.selectedOrder.ordered_at) : "—"}
              </ReadOnlyValue>
            </Field>
            <Field label="Articles commandés" locked>
              <ReadOnlyValue>{formatInt(summary.ordered)}</ReadOnlyValue>
            </Field>
          </div>
        </section>

        {/* 2 — Lignes de la commande */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            2. Articles du bon de commande
          </h2>
          {/* Défilement vertical : un BC de 50 lignes ne doit pas repousser
              le formulaire de saisie hors de l'écran. */}
          <div className="max-h-[260px] overflow-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]">
              <thead className="sticky top-0 z-10 bg-[var(--surface)]">
                <tr>
                  <Th>Référence</Th>
                  <Th>Désignation</Th>
                  <Th align="right">Commandée</Th>
                  <Th align="right">Déjà reçue</Th>
                  <Th align="right">Reste</Th>
                  <Th>Livraison</Th>
                </tr>
              </thead>
              <tbody>
                {data.lines.map((line) => (
                  <tr
                    key={line.id}
                    onClick={() => selectLine(line)}
                    className="cursor-pointer transition-colors hover:bg-[var(--page)]"
                    style={
                      line.id === selected?.id
                        ? {
                            background:
                              "color-mix(in srgb, var(--series-1) 8%, transparent)",
                          }
                        : undefined
                    }
                  >
                    <Td nowrap className="font-medium">
                      {line.reference}
                    </Td>
                    <Td>
                      <span className="block max-w-[220px] truncate">
                        {line.product_name}
                      </span>
                    </Td>
                    <Td align="right">{formatInt(line.quantity_ordered)}</Td>
                    <Td align="right">{formatInt(line.quantity_received)}</Td>
                    <Td align="right">{formatInt(line.quantity_remaining)}</Td>
                    <Td>
                      <DeliveryBadge status={line.delivery_status} />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* 3 — Saisie de la réception */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            3. Réception de la ligne sélectionnée
          </h2>

          {!selected ? (
            <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
              Sélectionnez une ligne du bon de commande.
            </p>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Référence" locked>
                  <ReadOnlyValue>{selected.reference}</ReadOnlyValue>
                </Field>
                <Field label="Désignation" locked>
                  <ReadOnlyValue>{selected.product_name}</ReadOnlyValue>
                </Field>
                <Field label="Quantité attendue" locked>
                  <ReadOnlyValue>
                    {formatInt(selected.quantity_remaining)}
                  </ReadOnlyValue>
                </Field>
                <Field label="Quantité reçue" required>
                  <Input
                    type="number"
                    min={1}
                    max={selected.quantity_remaining}
                    step={1}
                    value={quantity}
                    onChange={(event) => setQuantity(event.target.value)}
                    placeholder={String(selected.quantity_remaining)}
                  />
                </Field>

                <Field label="Numéro de lot" required>
                  <Input
                    value={lotNumber}
                    onChange={(event) => setLotNumber(event.target.value)}
                    placeholder="LOT20260626-01"
                  />
                </Field>
                <Field label="Date de péremption" required>
                  <Input
                    type="date"
                    value={expiry}
                    onChange={(event) => setExpiry(event.target.value)}
                  />
                </Field>
                <Field label="Catégorie" locked>
                  <ReadOnlyValue>{selected.category}</ReadOnlyValue>
                </Field>
                <Field label="Conditionnement" locked>
                  <ReadOnlyValue>{selected.packaging ?? "—"}</ReadOnlyValue>
                </Field>

                <Field label="Fournisseur" locked>
                  <ReadOnlyValue>{selected.supplier}</ReadOnlyValue>
                </Field>
                <Field
                  label="Prix HT (DT)"
                  locked
                  hint={
                    priceHt === null
                      ? "Conditionnement non chiffré"
                      : "Prix du conditionnement"
                  }
                >
                  <ReadOnlyValue>
                    {priceHt === null ? "—" : price3(priceHt)}
                  </ReadOnlyValue>
                </Field>
                <Field label="Prix unitaire (DT)" locked>
                  <ReadOnlyValue>{price3(selected.unit_price)}</ReadOnlyValue>
                </Field>
                <Field label="Jours avant péremption" locked>
                  <ReadOnlyValue
                    tone={
                      daysBeforeExpiry === null
                        ? "default"
                        : daysBeforeExpiry <= 0
                          ? "critical"
                          : daysBeforeExpiry < 30
                            ? "warning"
                            : "good"
                    }
                  >
                    {daysBeforeExpiry === null
                      ? "—"
                      : `${formatInt(daysBeforeExpiry)} jours`}
                  </ReadOnlyValue>
                </Field>

                <Field label="Statut FEFO" locked>
                  <ReadOnlyValue>
                    {fefoPreview ? <FefoStatus rank={fefoPreview.rank} /> : "—"}
                  </ReadOnlyValue>
                </Field>
                <Field label="Priorité FEFO" locked>
                  <ReadOnlyValue tone={fefoPreview ? "good" : "default"}>
                    {fefoPreview ? (
                      <span className="inline-flex items-center gap-1">
                        <Star size={12} aria-hidden /> Rang {fefoPreview.rank}
                      </span>
                    ) : (
                      "—"
                    )}
                  </ReadOnlyValue>
                </Field>
                <Field label="Valeur de la réception (DT)" locked>
                  <ReadOnlyValue tone={value > 0 ? "good" : "default"}>
                    {value > 0 ? `${formatAmount(value)} DT` : "—"}
                    {value > 0 ? (
                      <span className="ml-1 text-[9px] text-[var(--text-muted)]">
                        ({formatInt(parsedQuantity)} × {price3(selected.unit_price)})
                      </span>
                    ) : null}
                  </ReadOnlyValue>
                </Field>
              </div>

              {feedback ? (
                <p
                  role="status"
                  className="mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
                  style={{
                    color: feedback.ok ? "var(--good)" : "var(--critical)",
                    background: `color-mix(in srgb, ${
                      feedback.ok ? "var(--good)" : "var(--critical)"
                    } 10%, transparent)`,
                  }}
                >
                  {feedback.ok ? (
                    <CheckCircle2
                      size={13}
                      strokeWidth={2.4}
                      className="mt-px shrink-0"
                      aria-hidden
                    />
                  ) : (
                    <TriangleAlert
                      size={13}
                      strokeWidth={2.4}
                      className="mt-px shrink-0"
                      aria-hidden
                    />
                  )}
                  {feedback.message}
                </p>
              ) : null}

              {/* §7 — barre d'actions */}
              <div className="mt-3 flex flex-wrap items-stretch justify-end gap-2">
                <ActionButton
                  onClick={submit}
                  disabled={pending || !ready}
                  title={ready ? undefined : "Les contrôles ISO doivent tous passer."}
                  primary
                  icon={<Truck size={13} aria-hidden />}
                  label={pending ? "Enregistrement…" : "Valider la réception"}
                  hint="Enregistrer et mettre à jour le stock"
                />
                <ActionButton
                  onClick={() =>
                    lastReceipt &&
                    reverse(lastReceipt.receiptId, { refill: lastReceipt })
                  }
                  disabled={pending || !lastReceipt}
                  title={
                    lastReceipt
                      ? "Annule la dernière réception et recharge sa saisie"
                      : "Disponible après une validation : les champs sont déjà modifiables."
                  }
                  icon={<Pencil size={13} aria-hidden />}
                  label="Modifier"
                  hint="Corriger la dernière réception"
                />
                <ActionButton
                  onClick={() =>
                    lastReceipt && setConfirmCancel(lastReceipt.receiptId)
                  }
                  disabled={pending || !lastReceipt}
                  danger
                  title={
                    lastReceipt
                      ? "Contre-passe la dernière réception validée"
                      : "Aucune réception validée dans cette session."
                  }
                  icon={<Trash2 size={13} aria-hidden />}
                  label="Annuler la réception"
                  hint="Écriture inverse, tracée"
                />
                <ActionButton
                  onClick={reset}
                  disabled={pending}
                  icon={<RotateCcw size={13} aria-hidden />}
                  label="Réinitialiser"
                  hint="Vider les champs"
                />
                <ActionButton
                  href={
                    lastReceipt
                      ? `/goods/barcodes/print?ids=${lastReceipt.lotId}`
                      : undefined
                  }
                  disabled={!lastReceipt}
                  title={
                    lastReceipt
                      ? `Étiquette GS1-128 du lot ${lastReceipt.lotNumber}`
                      : "Disponible après validation de la réception."
                  }
                  icon={<Printer size={13} aria-hidden />}
                  label="Imprimer l'étiquette"
                  hint="Code-barres du lot"
                />
              </div>
            </>
          )}
        </section>

        {/* 8 — bandeau d'état système */}
        <ReceiptNotices notices={notices} />
      </div>

      {/* Colonne latérale */}
      <div className="flex flex-col gap-3">
        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Package size={13} aria-hidden />
            Résumé de la réception
          </h2>
          <SummaryRow label="Articles commandés">
            {formatInt(summary.ordered)}
          </SummaryRow>
          <SummaryRow label="Lignes soldées">{formatInt(summary.received)}</SummaryRow>
          <SummaryRow label="Reste à recevoir">
            {formatInt(summary.outstanding)} ligne
            {summary.outstanding > 1 ? "s" : ""}
          </SummaryRow>
          <SummaryRow label="Valeur réceptionnée">
            {data.totals.receivedValue > 0
              ? `${formatAmount(data.totals.receivedValue)} DT`
              : "—"}
          </SummaryRow>
          <SummaryRow label="Lots alimentés">
            {formatInt(data.totals.lotsCreated)}
          </SummaryRow>
          <SummaryRow label="Statut de la commande">
            {data.selectedOrder ? (
              <DeliveryBadge status={data.selectedOrder.status} />
            ) : (
              "—"
            )}
          </SummaryRow>
          {value > 0 ? (
            <p className="mt-2 text-[9px] leading-relaxed text-[var(--text-muted)]">
              Saisie en cours : {formatAmount(value)} DT, non encore validée.
            </p>
          ) : null}
        </aside>

        <ComplianceChecks checks={checks} />

        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <FileText size={13} aria-hidden />
            Dernières réceptions
          </h2>
          {data.history.length === 0 ? (
            <p className="py-3 text-center text-[10px] text-[var(--text-muted)]">
              Aucune réception enregistrée.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.history.map((entry) => (
                <li
                  key={entry.id}
                  className="border-b border-[var(--border)] pb-1.5 text-[10px] last:border-0 last:pb-0"
                  style={entry.reversed_at ? { opacity: 0.6 } : undefined}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {entry.reference}
                    </span>
                    <span
                      className="tnum font-medium"
                      style={{
                        color: entry.reversed_at
                          ? "var(--text-muted)"
                          : "var(--text-primary)",
                        textDecoration: entry.reversed_at
                          ? "line-through"
                          : undefined,
                      }}
                    >
                      +{formatInt(entry.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[var(--text-muted)]">
                    <span className="truncate">{entry.lot_number ?? "—"}</span>
                    <span className="tnum shrink-0">
                      {entry.received_at ? formatDateTime(entry.received_at) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-[9px] text-[var(--text-muted)]">
                      {entry.operator}
                    </span>
                    {entry.reversed_at ? (
                      <span
                        className="shrink-0 text-[9px] font-semibold"
                        style={{ color: "var(--critical)" }}
                      >
                        Annulée
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => setConfirmCancel(entry.receipt_id)}
                        className="shrink-0 text-[9px] font-medium text-[var(--text-muted)] hover:text-[var(--critical)] disabled:opacity-50"
                      >
                        Contre-passer
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}

          <Link
            href="/receipts/history"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-2 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
          >
            <History size={12} aria-hidden />
            Voir tout l&apos;historique
          </Link>
        </aside>
      </div>

      {confirmCancel !== null ? (
        <CancelDialog
          onCancel={() => setConfirmCancel(null)}
          onConfirm={(reason) => reverse(confirmCancel, { reason })}
        />
      ) : null}
    </div>
  );
}

/** Badge de synchronisation du stock (§3). */
function SyncBadge({ lastReceiptAt }: { lastReceiptAt: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        color: "var(--good)",
        background: "color-mix(in srgb, var(--good) 12%, transparent)",
      }}
      /* Il n'y a pas d'ERP tiers : « synchronisé » décrit le fait que le
         stock reflète bien les réceptions enregistrées. */
      title={
        lastReceiptAt
          ? `Dernière écriture de stock : ${formatDateTime(lastReceiptAt)}`
          : "Aucune réception enregistrée sur cette commande"
      }
    >
      <RefreshCw size={10} strokeWidth={2.6} aria-hidden />
      Synchronisé
    </span>
  );
}

function ActionButton({
  onClick,
  href,
  disabled,
  title,
  icon,
  label,
  hint,
  primary,
  danger,
}: {
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  title?: string;
  icon: React.ReactNode;
  label: string;
  hint: string;
  primary?: boolean;
  danger?: boolean;
}) {
  const body = (
    <>
      <span className="flex items-center gap-1.5 text-[11px] font-semibold">
        {icon}
        {label}
      </span>
      <span className="text-[9px] font-normal opacity-70">{hint}</span>
    </>
  );

  const base =
    "flex flex-col items-start gap-0.5 rounded-lg px-3 py-1.5 transition-opacity disabled:cursor-not-allowed disabled:opacity-50";

  if (href && !disabled) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener"
        title={title}
        className={`${base} border border-[var(--border)] text-[var(--text-primary)] hover:bg-[var(--page)]`}
      >
        {body}
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={base}
      style={
        primary
          ? { background: "var(--series-1)", color: "#fff" }
          : danger
            ? {
                border: "1px solid color-mix(in srgb, var(--critical) 40%, transparent)",
                color: "var(--critical)",
              }
            : { border: "1px solid var(--border)", color: "var(--text-primary)" }
      }
    >
      {body}
    </button>
  );
}

/** Contre-passation : irréversible côté stock, donc jamais en un seul clic. */
function CancelDialog({
  onCancel,
  onConfirm,
}: {
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onCancel();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cancel-receipt-title"
        onClick={(event) => event.stopPropagation()}
        className="card w-full max-w-sm p-4"
      >
        <h3
          id="cancel-receipt-title"
          className="mb-2 flex items-center gap-2 text-[12px] font-semibold text-[var(--text-primary)]"
        >
          <TriangleAlert
            size={15}
            strokeWidth={2.4}
            style={{ color: "var(--critical)" }}
            aria-hidden
          />
          Annuler cette réception ?
        </h3>

        <p className="text-[11px] leading-relaxed text-[var(--text-secondary)]">
          Le stock et le bon de commande seront ramenés à leur état antérieur
          par une écriture inverse.
        </p>
        <p className="mt-2 text-[10px] leading-relaxed text-[var(--text-muted)]">
          La réception d&apos;origine n&apos;est pas effacée : elle reste
          horodatée et signée, marquée comme annulée. Si une partie des
          marchandises a déjà été consommée, l&apos;annulation sera refusée.
        </p>

        <label className="mt-3 block">
          <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
            Motif (facultatif)
          </span>
          <input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Erreur de saisie, colis refusé…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] outline-none focus:border-[var(--series-1)]"
          />
        </label>

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => onConfirm(reason)}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white"
            style={{ background: "var(--critical)" }}
          >
            <Trash2 size={12} strokeWidth={2.2} aria-hidden />
            Contre-passer
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex h-8 items-center rounded-lg border border-[var(--border)] px-3 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
          >
            Retour
          </button>
        </div>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[7px] text-[11px] last:border-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}
