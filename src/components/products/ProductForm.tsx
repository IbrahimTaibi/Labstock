"use client";

import { useEffect, useState } from "react";
import { saveProduct } from "@/app/(app)/products/actions";
import type { ProductState } from "@/app/(app)/products/actions";
import { cn, formatTnd } from "@/lib/utils";
import type { ProductRow } from "@/lib/types";

export const PRODUCT_FORM_ID = "article-form";

const VAT_RATES = [19, 13, 7, 0];

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** Date locale AAAA-MM-JJ d'un horodatage. */
function toDateInput(iso: string) {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function Field({
  label,
  required,
  hint,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={cn("flex min-w-0 flex-col gap-1", className)}>
      <span className="text-[10px] font-semibold text-[var(--text-secondary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="text-[9px] text-[var(--text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

/**
 * Section 1 — fiche article, en création comme en modification. Le bouton
 * d'enregistrement vit dans le panneau « Actions rapides » et vise ce
 * formulaire par son `id`. Le stock n'est pas saisi ici : il vient des
 * réceptions, sorties et inventaires.
 */
export function ProductForm({
  product,
  nextReference,
  categories,
  suppliers,
  onRun,
  onValidityChange,
}: {
  product: ProductRow | null;
  nextReference: string;
  categories: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  onRun: (action: () => Promise<ProductState>) => void;
  /** Informe le parent pour activer ou non le bouton d'enregistrement. */
  onValidityChange: (valid: boolean) => void;
}) {
  /* Le parent remonte le composant via `key` à chaque changement d'article :
     les champs repartent de la fiche sélectionnée. */
  const [manufacturerRef, setManufacturerRef] = useState(product?.manufacturer_ref ?? "");
  const [name, setName] = useState(product?.name ?? "");
  const [packaging, setPackaging] = useState(product?.packaging ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(product?.category_id ?? "");
  const [supplierId, setSupplierId] = useState<number | "">(
    product?.supplier_id ?? (suppliers.length === 1 ? suppliers[0].id : "")
  );
  const [unitPrice, setUnitPrice] = useState(
    product ? String(product.unit_price).replace(".", ",") : ""
  );
  const [vatRate, setVatRate] = useState(product?.vat_rate ?? 19);
  const [createdOn, setCreatedOn] = useState(
    product ? toDateInput(product.created_at) : todayIso()
  );

  const price = Number.parseFloat(unitPrice.replace(/\s/g, "").replace(",", "."));
  const priceOk = Number.isFinite(price) && price >= 0;
  const ttc = priceOk ? price * (1 + vatRate / 100) : null;

  const valid =
    name.trim() !== "" &&
    packaging.trim() !== "" &&
    categoryId !== "" &&
    supplierId !== "" &&
    priceOk &&
    createdOn !== "";

  useEffect(() => {
    onValidityChange(valid);
  }, [valid, onValidityChange]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    onRun(() =>
      saveProduct(product?.id ?? null, {
        name,
        reference: product?.reference ?? null,
        manufacturer_ref: manufacturerRef,
        packaging,
        category_id: categoryId as number,
        supplier_id: supplierId as number,
        unit_price: price,
        vat_rate: vatRate,
        created_on: createdOn,
      })
    );
  }

  return (
    <section className="card p-4">
      <h2 className="mb-4 text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
        1. Informations de l&apos;article
        {product ? (
          <span className="ml-2 rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal"
            style={{
              color: "var(--series-1)",
              background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
            }}
          >
            Modification
          </span>
        ) : null}
      </h2>

      <form id={PRODUCT_FORM_ID} onSubmit={submit} className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)]">
          <Field
            label={product ? "Référence article" : "Référence article (Auto)"}
            hint={product ? undefined : "Générée automatiquement"}
          >
            <div className="flex h-10 items-center rounded-lg bg-[var(--page)] px-3 text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
              {product?.display_reference ?? nextReference}
            </div>
          </Field>

          <Field label="Référence fabricant">
            <input
              value={manufacturerRef}
              onChange={(e) => setManufacturerRef(e.target.value)}
              placeholder="Ex: ROCHE-12345"
              className={INPUT_CLASS}
            />
          </Field>

          <Field label="Désignation de l'article" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Réactif Glucose GOD-PAP"
              className={cn(INPUT_CLASS, "font-semibold")}
            />
          </Field>

          <Field label="Conditionnement" required>
            <input
              value={packaging}
              onChange={(e) => setPackaging(e.target.value)}
              placeholder="Ex: Boîte de 100"
              className={INPUT_CLASS}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Catégorie" required>
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value === "" ? "" : Number(e.target.value))}
              className={cn(INPUT_CLASS, "font-semibold uppercase")}
            >
              <option value="">— Choisir —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Fournisseur" required>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value === "" ? "" : Number(e.target.value))}
              className={INPUT_CLASS}
            >
              <option value="">— Choisir —</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Prix HT (TND)" required>
            <input
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0,000"
              className={cn(INPUT_CLASS, "tnum font-semibold")}
            />
          </Field>

          <Field label="TVA (%)" required>
            <select
              value={vatRate}
              onChange={(e) => setVatRate(Number(e.target.value))}
              className={cn(INPUT_CLASS, "tnum")}
            >
              {VAT_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </Field>

          <Field label="Date de création" required>
            <input
              type="date"
              value={createdOn}
              onChange={(e) => setCreatedOn(e.target.value)}
              className={cn(INPUT_CLASS, "tnum")}
            />
          </Field>

          <Field label="Prix TTC (TND)" hint="Calculé automatiquement">
            <div
              className="tnum flex h-10 items-center rounded-lg px-3 text-[17px] font-bold"
              style={{
                color: "var(--good)",
                background: "color-mix(in srgb, var(--good) 8%, transparent)",
              }}
            >
              {ttc === null ? "—" : formatTnd(ttc)}
            </div>
          </Field>
        </div>
      </form>
    </section>
  );
}
