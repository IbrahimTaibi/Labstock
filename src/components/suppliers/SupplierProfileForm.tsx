"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { deleteSupplier, saveSupplier } from "@/app/(app)/suppliers/actions";
import type { SupplierState } from "@/app/(app)/suppliers/actions";
import type { SupplierRow } from "@/lib/types";

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

/** Fiche fournisseur : création, édition complète et suppression. */
export function SupplierProfileForm({
  supplier,
  pending,
  onRun,
  onCancel,
}: {
  supplier: SupplierRow | null;
  pending: boolean;
  onRun: (action: () => Promise<SupplierState>) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  /* La fiche suit la sélection ; les brouillons ne survivent pas au
     changement de fournisseur, c'est voulu. */
  useEffect(() => {
    setName(supplier?.name ?? "");
    setContactName(supplier?.contact_name ?? "");
    setEmail(supplier?.email ?? "");
    setPhone(supplier?.phone ?? "");
    setAddress(supplier?.address ?? "");
    setNotes(supplier?.notes ?? "");
    setConfirmDelete(false);
  }, [supplier]);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    onRun(() =>
      saveSupplier(supplier?.id ?? null, {
        name,
        contact_name: contactName,
        email,
        phone,
        address,
        notes,
      })
    );
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        {supplier ? "Fiche fournisseur" : "Nouveau fournisseur"}
      </h2>

      <form onSubmit={submit} className="flex flex-col gap-2.5">
        <Field label="Nom *">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex. Biomérieux"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Contact">
          <input
            type="text"
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            placeholder="Nom du contact commercial"
            className={INPUT_CLASS}
          />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="E-mail">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@…"
              className={INPUT_CLASS}
            />
          </Field>
          <Field label="Téléphone">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+216 …"
              className={INPUT_CLASS}
            />
          </Field>
        </div>
        <Field label="Adresse">
          <input
            type="text"
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Adresse postale"
            className={INPUT_CLASS}
          />
        </Field>
        <Field label="Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Conditions, délais, remarques…"
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 py-1.5 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]"
          />
        </Field>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending || name.trim() === ""}
            className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
            style={{ background: "var(--series-1)" }}
          >
            {supplier ? (
              <Save size={13} strokeWidth={2.4} aria-hidden />
            ) : (
              <Plus size={13} strokeWidth={2.4} aria-hidden />
            )}
            {supplier ? "Enregistrer" : "Créer"}
          </button>
          {supplier ? (
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

      {supplier ? (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          {confirmDelete ? (
            <div className="flex flex-col gap-2">
              <p className="text-[10px] leading-relaxed text-[var(--text-muted)]">
                Supprimer définitivement « {supplier.name} » ? Impossible
                s&apos;il a encore des produits, commandes ou factures.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => {
                    setConfirmDelete(false);
                    onRun(() => deleteSupplier(supplier.id));
                  }}
                  className="flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--critical)" }}
                >
                  <Trash2 size={12} strokeWidth={2.2} aria-hidden />
                  Confirmer la suppression
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="flex h-8 items-center rounded-lg border border-[var(--border)] px-2.5 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="inline-flex items-center gap-1.5 text-[10px] font-medium text-[var(--text-muted)] hover:text-[var(--critical)]"
            >
              <Trash2 size={12} strokeWidth={2.2} aria-hidden />
              Supprimer ce fournisseur
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
}
