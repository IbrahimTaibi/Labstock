"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Package,
  Printer,
  RotateCcw,
  TriangleAlert,
  Truck,
} from "lucide-react";
import { receiveGoods } from "@/app/(app)/receipts/actions";
import { Td, Th } from "@/components/DataTable";
import { Field, Input, ReadOnlyValue } from "@/components/goods/Field";
import type { OrderLine, ReceiptsWorkspaceData } from "@/lib/types";
import { formatAmount, formatDate, formatDateTime, formatInt } from "@/lib/utils";
import { ComplianceChecks, type ComplianceCheck } from "./ComplianceChecks";
import { DeliveryBadge } from "./DeliveryBadge";

type Feedback = { message: string; ok: boolean } | null;

export function ReceiptsWorkspace({ data }: { data: ReceiptsWorkspaceData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

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

  const parsedQuantity = Number.parseInt(quantity, 10);
  const value =
    selected && Number.isFinite(parsedQuantity)
      ? parsedQuantity * selected.unit_price
      : 0;

  const daysBeforeExpiry = useMemo(() => {
    if (!expiry) return null;
    const today = new Date().setHours(0, 0, 0, 0);
    return Math.round((new Date(expiry).getTime() - today) / 86_400_000);
  }, [expiry]);

  /* Aperçu du rang FEFO : le lot reçu se classe parmi les lots consommables
     du produit d'après la date saisie. Le serveur recalcule le rang réel. */
  const fefoPreview = useMemo(() => {
    if (!selected || daysBeforeExpiry === null || daysBeforeExpiry <= 0) return null;
    return { rank: null as number | null };
  }, [selected, daysBeforeExpiry]);

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
        detail: fefoPreview ? "Rang attribué par le serveur" : "Nécessite une date valide",
      },
      {
        label: "Traçabilité assurée",
        passed: quantityOk && lotNumber.trim().length > 0,
        detail: "Lot, mouvement d'entrée et opérateur enregistrés ensemble",
      },
    ];
  }, [selected, parsedQuantity, lotNumber, daysBeforeExpiry, fefoPreview]);

  const ready = checks.every((check) => check.passed) && Boolean(selected);

  function submit() {
    if (!selected) return;
    setFeedback(null);
    start(async () => {
      const result = await receiveGoods({
        orderLineId: selected.id,
        quantity: parsedQuantity,
        lotNumber,
        expiryDate: expiry,
      });
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") {
        clearFields();
        router.refresh();
      }
    });
  }

  const summary = {
    ordered: data.lines.length,
    received: data.lines.filter((line) => line.delivery_status === "received").length,
    outstanding: data.lines.filter((line) => line.delivery_status !== "received").length,
  };

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        {/* 1 — Bon de commande */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            1. Bon de commande
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Numéro de bon de commande" required>
              <select
                value={data.selectedOrder?.number ?? ""}
                onChange={(event) =>
                  router.push(`/receipts?order=${encodeURIComponent(event.target.value)}`)
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
            <Field label="Fournisseur">
              <ReadOnlyValue>{data.selectedOrder?.supplier ?? "—"}</ReadOnlyValue>
            </Field>
            <Field label="Date de la commande">
              <ReadOnlyValue>
                {data.selectedOrder ? formatDate(data.selectedOrder.ordered_at) : "—"}
              </ReadOnlyValue>
            </Field>
            <Field label="Articles commandés">
              <ReadOnlyValue>{formatInt(summary.ordered)}</ReadOnlyValue>
            </Field>
          </div>
        </section>

        {/* 2 — Lignes de la commande */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            2. Articles du bon de commande
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-[11px]">
              <thead>
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
                <Field label="Référence">
                  <ReadOnlyValue>{selected.reference}</ReadOnlyValue>
                </Field>
                <Field label="Désignation">
                  <ReadOnlyValue>{selected.product_name}</ReadOnlyValue>
                </Field>
                <Field label="Quantité attendue">
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
                <Field label="Catégorie">
                  <ReadOnlyValue>{selected.category}</ReadOnlyValue>
                </Field>
                <Field label="Conditionnement">
                  <ReadOnlyValue>{selected.packaging ?? "—"}</ReadOnlyValue>
                </Field>

                <Field label="Fournisseur">
                  <ReadOnlyValue>{selected.supplier}</ReadOnlyValue>
                </Field>
                <Field label="Prix unitaire (DT)">
                  <ReadOnlyValue>
                    {selected.unit_price.toFixed(3).replace(".", ",")}
                  </ReadOnlyValue>
                </Field>
                <Field label="Jours avant péremption">
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
                <Field label="Valeur de la réception (DT)">
                  <ReadOnlyValue tone={value > 0 ? "good" : "default"}>
                    {value > 0
                      ? `${formatAmount(value)} DT`
                      : "—"}
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

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={reset}
                  className="card flex items-center gap-2 px-3.5 py-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
                >
                  <RotateCcw size={13} aria-hidden />
                  Réinitialiser
                </button>
                <button
                  type="button"
                  disabled
                  title="Génération d'étiquettes non implémentée"
                  className="card flex cursor-not-allowed items-center gap-2 px-3.5 py-2 text-[11px] font-medium text-[var(--text-muted)]"
                >
                  <Printer size={13} aria-hidden />
                  Imprimer l&apos;étiquette
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={pending || !ready}
                  title={ready ? undefined : "Les contrôles ISO doivent tous passer."}
                  className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--series-1)" }}
                >
                  <Truck size={13} aria-hidden />
                  {pending ? "Enregistrement…" : "Valider la réception"}
                </button>
              </div>
            </>
          )}
        </section>
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
          <SummaryRow label="Valeur saisie">
            {value > 0 ? `${formatAmount(value)} DT` : "—"}
          </SummaryRow>
          <SummaryRow label="Statut de la commande">
            {data.selectedOrder ? (
              <DeliveryBadge status={data.selectedOrder.status} />
            ) : (
              "—"
            )}
          </SummaryRow>
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
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-[var(--text-primary)]">
                      {entry.reference}
                    </span>
                    <span className="tnum font-medium text-[var(--text-primary)]">
                      +{formatInt(entry.quantity)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 text-[var(--text-muted)]">
                    <span className="truncate">{entry.lot_number ?? "—"}</span>
                    <span className="tnum shrink-0">
                      {entry.received_at ? formatDateTime(entry.received_at) : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
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
