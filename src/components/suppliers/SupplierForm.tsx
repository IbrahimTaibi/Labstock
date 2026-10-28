"use client";

import { useEffect, useState } from "react";
import { FileText, Info, Mail, MapPin, Phone, Smartphone } from "lucide-react";
import type { SupplierProfileInput } from "@/app/(app)/suppliers/actions";
import { cn } from "@/lib/utils";
import type { SupplierProfile } from "@/lib/types";

export const SUPPLIER_FORM_ID = "supplier-form";

export const PAYMENT_TERMS = [
  { days: 0, label: "Comptant" },
  { days: 30, label: "30 jours" },
  { days: 45, label: "45 jours" },
  { days: 60, label: "60 jours" },
  { days: 90, label: "90 jours" },
];

const CURRENCIES = ["TND", "EUR", "USD"];

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:bg-[var(--page)] disabled:text-[var(--text-secondary)]";

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
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
    </label>
  );
}

/** Champ avec icône à droite, comme la maquette. */
function IconInput({
  icon,
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { icon: React.ReactNode }) {
  return (
    <span className="relative block">
      <input {...props} className={cn(INPUT_CLASS, "pr-9", className)} />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]">
        {icon}
      </span>
    </span>
  );
}

/**
 * Informations du fournisseur. Le bouton « Enregistrer » de la barre
 * d'actions vise ce formulaire par son `id`. En consultation, les champs
 * sont verrouillés jusqu'à « Modifier ».
 */
export function SupplierForm({
  supplier,
  nextCode,
  readOnly,
  categories,
  onSubmit,
  onValidityChange,
}: {
  supplier: SupplierProfile | null;
  nextCode: string;
  readOnly: boolean;
  categories: string[];
  onSubmit: (input: SupplierProfileInput) => void;
  onValidityChange: (valid: boolean) => void;
}) {
  const [name, setName] = useState(supplier?.name ?? "");
  const [taxId, setTaxId] = useState(supplier?.tax_id ?? "");
  const [email, setEmail] = useState(supplier?.email ?? "");
  const [createdOn, setCreatedOn] = useState(supplier?.created_on ?? todayIso());
  const [address, setAddress] = useState(supplier?.address ?? "");
  const [postalCode, setPostalCode] = useState(supplier?.postal_code ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [mobile, setMobile] = useState(supplier?.mobile ?? "");
  const [category, setCategory] = useState(supplier?.category ?? categories[0] ?? "");
  const [terms, setTerms] = useState<number | "">(supplier ? supplier.payment_terms_days ?? "" : 30);
  const [currency, setCurrency] = useState(supplier?.currency ?? "TND");
  const [active, setActive] = useState(supplier?.active ?? true);

  const emailOk = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = name.trim() !== "" && createdOn !== "" && emailOk;

  useEffect(() => {
    onValidityChange(valid);
  }, [valid, onValidityChange]);

  const termOptions =
    terms === "" || PAYMENT_TERMS.some((t) => t.days === terms)
      ? PAYMENT_TERMS
      : [...PAYMENT_TERMS, { days: terms, label: `${terms} jours` }].sort((a, b) => a.days - b.days);

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || readOnly) return;
    onSubmit({
      name,
      email,
      phone,
      mobile,
      address,
      postal_code: postalCode,
      tax_id: taxId,
      category,
      payment_terms_days: terms === "" ? null : terms,
      currency,
      active,
      created_on: createdOn,
    });
  }

  return (
    <section className="card p-4">
      <h2 className="mb-4 flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
        Informations du fournisseur
        <Info size={13} strokeWidth={2.2} className="text-[var(--text-muted)]" aria-hidden />
        {supplier && !readOnly ? (
          <span
            className="ml-1 rounded px-1.5 py-0.5 text-[9px] font-semibold normal-case tracking-normal"
            style={{ color: "var(--serious)", background: "color-mix(in srgb, var(--serious) 12%, transparent)" }}
          >
            Modification
          </span>
        ) : null}
      </h2>

      <form id={SUPPLIER_FORM_ID} onSubmit={submit}>
        <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
          <Field label="Code fournisseur (Auto)">
            <div className="flex h-10 items-center gap-2 px-1">
              <span className="text-[17px] font-bold tracking-tight text-[var(--text-primary)]">
                {supplier?.code ?? nextCode}
              </span>
              {supplier ? null : (
                <span
                  className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
                  style={{ color: "var(--good)", background: "color-mix(in srgb, var(--good) 12%, transparent)" }}
                >
                  Nouveau
                </span>
              )}
            </div>
          </Field>
          <Field label="Nom du fournisseur" required>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: BioLab Tunisie"
              className={cn(INPUT_CLASS, "font-semibold")}
            />
          </Field>
          <Field label="Matricule fiscal">
            <IconInput
              icon={<FileText size={14} strokeWidth={2} aria-hidden />}
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              placeholder="1234567/A/M/000"
              className="tnum"
            />
          </Field>
          <Field label="Email">
            <IconInput
              icon={<Mail size={14} strokeWidth={2} aria-hidden />}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contact@fournisseur.tn"
              className={emailOk ? undefined : "border-[var(--critical)]"}
            />
          </Field>

          <Field label="Date de création" required>
            <input
              type="date"
              value={createdOn}
              onChange={(e) => setCreatedOn(e.target.value)}
              className={cn(INPUT_CLASS, "tnum")}
            />
          </Field>
          <Field label="Adresse">
            <IconInput
              icon={<MapPin size={14} strokeWidth={2} aria-hidden />}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Rue, zone, ville"
            />
          </Field>
          <Field label="Code postal">
            <input
              value={postalCode}
              onChange={(e) => setPostalCode(e.target.value)}
              placeholder="2080"
              inputMode="numeric"
              className={cn(INPUT_CLASS, "tnum")}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Téléphone / Fax">
              <IconInput
                icon={<Phone size={13} strokeWidth={2} aria-hidden />}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="71 000 000"
                className="tnum"
              />
            </Field>
            <Field label="GSM">
              <IconInput
                icon={<Smartphone size={13} strokeWidth={2} aria-hidden />}
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                placeholder="98 000 000"
                className="tnum"
              />
            </Field>
          </div>

          <Field label="Catégorie principale">
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={INPUT_CLASS}>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Conditions de paiement">
            <select
              value={terms}
              onChange={(e) => setTerms(e.target.value === "" ? "" : Number(e.target.value))}
              className={INPUT_CLASS}
            >
              <option value="">— Non définies —</option>
              {termOptions.map((t) => (
                <option key={t.days} value={t.days}>
                  {t.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Devise par défaut">
            <select value={currency} onChange={(e) => setCurrency(e.target.value)} className={INPUT_CLASS}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Statut">
            <span className="relative block">
              <span
                className="pointer-events-none absolute left-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full"
                style={{ background: active ? "var(--good)" : "var(--critical)" }}
                aria-hidden
              />
              <select
                value={active ? "1" : "0"}
                onChange={(e) => setActive(e.target.value === "1")}
                className={cn(INPUT_CLASS, "pl-7 font-semibold")}
                style={{ color: active ? "var(--good)" : "var(--critical)" }}
              >
                <option value="1">Actif</option>
                <option value="0">Inactif</option>
              </select>
            </span>
          </Field>
        </fieldset>
      </form>
    </section>
  );
}
