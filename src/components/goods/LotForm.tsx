"use client";

import { useActionState, useMemo, useState } from "react";
import { Info, RotateCcw, Save, X } from "lucide-react";
import { saveLot, type SaveLotState } from "@/app/(app)/goods/actions";
import { Field, Input, ReadOnlyValue, Select } from "./Field";
import type { Lot, ProductOption } from "@/lib/types";

const EMPTY: SaveLotState = { status: "idle", message: "" };

export function LotForm({
  lots,
  products,
  selected,
  onCancel,
}: {
  lots: Lot[];
  products: ProductOption[];
  selected: Lot | null;
  onCancel: () => void;
}) {
  const [state, formAction, pending] = useActionState(saveLot, EMPTY);

  const [productId, setProductId] = useState<string>(
    selected ? String(selected.product_id) : ""
  );
  const [expiry, setExpiry] = useState<string>(selected?.expiry_date ?? "");

  const product = products.find((p) => String(p.id) === productId) ?? null;

  /* Aperçu FEFO : rang qu'occuperait ce lot parmi les lots encore
     consommables du même produit, d'après la date saisie. */
  const preview = useMemo(() => {
    if (!productId || !expiry) return null;
    const expiryTime = new Date(expiry).getTime();
    const today = new Date().setHours(0, 0, 0, 0);
    const daysLeft = Math.round((expiryTime - today) / 86_400_000);

    if (daysLeft < 0) return { rank: null, daysLeft };

    const earlier = lots.filter(
      (lot) =>
        String(lot.product_id) === productId &&
        lot.id !== selected?.id &&
        !lot.is_expired &&
        lot.current_qty > 0 &&
        new Date(lot.expiry_date).getTime() < expiryTime
    ).length;

    return { rank: earlier + 1, daysLeft };
  }, [productId, expiry, lots, selected?.id]);

  const isActive = preview?.rank === 1;

  return (
    <form
      action={formAction}
      /* Repart d'un état propre quand la sélection change */
      key={selected?.id ?? "new"}
      className="card p-4"
    >
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {selected ? "Modifier une marchandise" : "Ajouter une marchandise"}
      </h2>

      {selected ? <input type="hidden" name="id" value={selected.id} /> : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Désignation" required>
          <Select
            name="product_id"
            value={productId}
            onChange={(event) => setProductId(event.target.value)}
            required
          >
            <option value="">Sélectionner un produit…</option>
            {products.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Référence interne">
          <Input
            name="internal_ref"
            defaultValue={selected?.internal_ref ?? ""}
            placeholder="PAR500"
          />
        </Field>

        <Field label="Catégorie">
          <ReadOnlyValue>{product?.category ?? "—"}</ReadOnlyValue>
        </Field>

        <Field label="Fournisseur">
          <ReadOnlyValue>{product?.supplier ?? "—"}</ReadOnlyValue>
        </Field>

        <Field label="Conditionnement">
          <Input
            name="packaging"
            defaultValue={selected?.packaging ?? ""}
            placeholder="Boîte de 20"
          />
        </Field>

        <Field label="Prix HT (DT)">
          <Input
            name="price_ht"
            type="number"
            step="0.01"
            min="0"
            defaultValue={selected?.price_ht ?? ""}
          />
        </Field>

        <Field label="Prix unitaire (DT)">
          <Input
            name="unit_price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={selected?.unit_price ?? product?.unit_price ?? ""}
          />
        </Field>

        <Field label="Lot" required>
          <Input
            name="lot_number"
            defaultValue={selected?.lot_number ?? ""}
            placeholder="LOT20260415"
            required
          />
        </Field>

        <Field label="Date de péremption" required>
          <Input
            name="expiry_date"
            type="date"
            value={expiry}
            onChange={(event) => setExpiry(event.target.value)}
            required
          />
        </Field>

        <Field label="Stock initial" required>
          <Input
            name="initial_qty"
            type="number"
            min="0"
            step="1"
            defaultValue={selected?.initial_qty ?? ""}
            required
          />
        </Field>

        <Field label="Statut FEFO">
          <ReadOnlyValue
            tone={!preview ? "default" : isActive ? "good" : "critical"}
          >
            {!preview
              ? "—"
              : isActive
                ? "Actif (prioritaire FEFO)"
                : "Inactif"}
          </ReadOnlyValue>
        </Field>

        <Field label="Jours avant péremption">
          <ReadOnlyValue
            tone={
              !preview
                ? "default"
                : preview.daysLeft < 0
                  ? "critical"
                  : preview.daysLeft < 30
                    ? "warning"
                    : "good"
            }
          >
            {preview ? `${preview.daysLeft} jours` : "—"}
          </ReadOnlyValue>
        </Field>
      </div>

      <Field label="Commentaire">
        <Input
          name="comment"
          defaultValue={selected?.comment ?? ""}
          placeholder="Remarque sur le lot (facultatif)"
        />
      </Field>

      <p className="mt-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
        <Info
          size={13}
          strokeWidth={2.2}
          className="mt-px shrink-0"
          style={{ color: "var(--series-1)" }}
          aria-hidden
        />
        <span>
          Le statut (actif / inactif) découle automatiquement de la méthode FEFO
          (<em>First Expired, First Out</em>) : parmi les lots encore consommables
          d&apos;un même produit, celui dont la péremption est la plus proche reste
          actif.
        </span>
      </p>

      {state.status !== "idle" ? (
        <p
          role="status"
          className="mt-3 rounded-lg px-3 py-2 text-[11px] font-medium"
          style={{
            color: state.status === "error" ? "var(--critical)" : "var(--good)",
            background: `color-mix(in srgb, ${
              state.status === "error" ? "var(--critical)" : "var(--good)"
            } 10%, transparent)`,
          }}
        >
          {state.message}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button
          type="submit"
          disabled={pending}
          className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
          style={{ background: "var(--series-1)" }}
        >
          <Save size={13} aria-hidden />
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        <button
          type="reset"
          className="card flex items-center gap-2 px-3.5 py-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
        >
          <RotateCcw size={13} aria-hidden />
          Réinitialiser
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="card flex items-center gap-2 px-3.5 py-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
        >
          <X size={13} aria-hidden />
          Annuler
        </button>
      </div>
    </form>
  );
}
