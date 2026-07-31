"use client";

import { useState } from "react";
import { Plus, Save, X } from "lucide-react";
import { saveProduct } from "@/app/(app)/products/actions";
import type { ProductState } from "@/app/(app)/products/actions";
import { cn } from "@/lib/utils";
import type { ProductRow } from "@/lib/types";

const INPUT_CLASS =
  "h-8 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

/** Fiche produit : création et édition. Le stock, lui, vient des mouvements. */
export function ProductForm({
  product,
  categories,
  suppliers,
  pending,
  onRun,
  onCancel,
  onCreateNew,
}: {
  product: ProductRow | null;
  categories: { id: number; name: string }[];
  suppliers: { id: number; name: string }[];
  pending: boolean;
  onRun: (action: () => Promise<ProductState>) => void;
  onCancel: () => void;
  /** Repasse le formulaire en création depuis le mode édition. */
  onCreateNew: () => void;
}) {
  /* Les champs sont initialisés depuis le produit sélectionné. Le parent
     remonte le composant via `key` quand la sélection change, ce qui repart
     d'un état neuf : les brouillons ne survivent pas au changement de
     produit, c'est voulu. */
  const [name, setName] = useState(product?.name ?? "");
  const [reference, setReference] = useState(product?.reference ?? "");
  const [categoryId, setCategoryId] = useState<number | "">(
    product?.category_id ?? ""
  );
  const [supplierId, setSupplierId] = useState<number | "">(
    product?.supplier_id ?? ""
  );
  const [unitPrice, setUnitPrice] = useState(
    product ? String(product.unit_price) : ""
  );
  const [minStock, setMinStock] = useState(
    product ? String(product.min_stock) : "5"
  );

  const price = Number.parseFloat(unitPrice.replace(",", "."));
  const minimum = Number.parseInt(minStock, 10);
  const valid =
    name.trim() !== "" &&
    categoryId !== "" &&
    supplierId !== "" &&
    Number.isFinite(price) &&
    price >= 0 &&
    Number.isInteger(minimum) &&
    minimum >= 0;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid) return;
    onRun(() =>
      saveProduct(product?.id ?? null, {
        name,
        reference: reference.trim() || null,
        category_id: categoryId as number,
        supplier_id: supplierId as number,
        unit_price: price,
        min_stock: minimum,
      })
    );
  }

  return (
    <section className="card p-4">
      <header className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          {product ? "Fiche produit" : "Nouveau produit"}
        </h2>
        {product ? (
          <button
            type="button"
            onClick={onCreateNew}
            className="inline-flex items-center gap-1 text-[10px] font-medium text-[var(--series-1)] hover:underline"
          >
            <Plus size={12} strokeWidth={2.4} aria-hidden />
            Nouveau produit
          </button>
        ) : null}
      </header>

      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <Field label="Désignation *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Tubes EDTA 5 mL"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Référence">
          <input
            type="text"
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="Laissée vide : générée (REF-…)"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Catégorie *">
            <select
              value={categoryId}
              onChange={(e) =>
                setCategoryId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
              className={INPUT_CLASS}
            >
              <option value="">— Choisir —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Fournisseur *">
            <select
              value={supplierId}
              onChange={(e) =>
                setSupplierId(
                  e.target.value === "" ? "" : Number(e.target.value)
                )
              }
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
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Prix unitaire (DT) *">
            <input
              type="text"
              inputMode="decimal"
              value={unitPrice}
              onChange={(e) => setUnitPrice(e.target.value)}
              placeholder="0,00"
              className={cn(INPUT_CLASS, "tnum text-right")}
            />
          </Field>
          <Field label="Seuil minimum *">
            <input
              type="number"
              min={0}
              value={minStock}
              onChange={(e) => setMinStock(e.target.value)}
              className={cn(INPUT_CLASS, "tnum text-right")}
            />
          </Field>
        </div>

        <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
          Le stock n&apos;est pas saisi ici : il évolue par les réceptions, les
          sorties et les inventaires. Sous le seuil minimum, le produit passe en
          alerte.
        </p>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || !valid}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--series-1)" }}
          >
            {product ? (
              <Save size={13} strokeWidth={2.4} aria-hidden />
            ) : (
              <Plus size={13} strokeWidth={2.4} aria-hidden />
            )}
            {product ? "Enregistrer" : "Créer le produit"}
          </button>
          {product ? (
            <button
              type="button"
              onClick={onCancel}
              className="flex h-8 items-center gap-1 rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
            >
              <X size={12} strokeWidth={2.2} aria-hidden />
              Fermer
            </button>
          ) : null}
        </div>
      </form>
    </section>
  );
}
