"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Barcode,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Info,
  Loader2,
  LogOut,
  Plus,
  PlusCircle,
  Save,
  Search,
  SquarePen,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  createSubcontractor,
  deleteSubcontractorInvoice,
  saveSubcontractorInvoice,
} from "@/app/(app)/subcontracting/actions";
import { cn, formatDate, formatTnd } from "@/lib/utils";
import type {
  SubcontractorInvoiceData,
  SubcontractorInvoiceLine,
  SubcontractorLineKind,
} from "@/lib/types";

const VAT_RATES = [19, 13, 7, 0];
/* Timbre fiscal par défaut sur une facture tunisienne. */
const DEFAULT_STAMP = "1,000";
const NEW_SUBCONTRACTOR = "__new__";

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:opacity-60";
const CELL_INPUT =
  "h-9 w-full rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-[11px] text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]";

const KIND_LABEL: Record<SubcontractorLineKind, string> = {
  prestation: "Prestation",
  frais: "Frais",
};

type Feedback = { message: string; ok: boolean } | null;

type Line = {
  key: number;
  kind: SubcontractorLineKind;
  designation: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  vat_rate: number;
};

function todayIso() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseDecimal(raw: string) {
  return Number.parseFloat(raw.replace(/\s/g, "").replace(",", "."));
}

function toInput(n: number) {
  return String(Math.round(n * 1000) / 1000).replace(".", ",");
}

let lineKey = 0;
const nextKey = () => ++lineKey;

function emptyLine(vatRate: number, designation = ""): Line {
  return {
    key: nextKey(),
    kind: "prestation",
    designation,
    quantity: "1",
    unit_price: "",
    discount_pct: "0",
    vat_rate: vatRate,
  };
}

function lineFromEntry(entry: SubcontractorInvoiceLine): Line {
  return {
    key: nextKey(),
    kind: entry.kind,
    designation: entry.designation,
    quantity: String(entry.quantity),
    unit_price: toInput(entry.unit_price),
    discount_pct: toInput(entry.discount_pct),
    vat_rate: entry.vat_rate,
  };
}

/** Total ligne = Qté × PU × (1 − Remise%) × (1 + TVA%) — même formule que la base. */
function lineAmounts(line: Line) {
  const qty = Number.parseInt(line.quantity, 10);
  const price = parseDecimal(line.unit_price);
  const discount = line.discount_pct.trim() === "" ? 0 : parseDecimal(line.discount_pct);
  const valid =
    line.designation.trim() !== "" &&
    Number.isInteger(qty) &&
    qty > 0 &&
    Number.isFinite(price) &&
    price >= 0 &&
    Number.isFinite(discount) &&
    discount >= 0 &&
    discount <= 100;
  if (!valid) return { valid: false, net: 0, vat: 0, total: 0, priceOk: Number.isFinite(price) };
  const net = qty * price * (1 - discount / 100);
  const vat = (net * line.vat_rate) / 100;
  return { valid: true, net, vat, total: net + vat, priceOk: true };
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
    <label className={cn("flex min-w-0 flex-col gap-1.5", className)}>
      <span className="text-[11px] font-semibold text-[var(--text-primary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
      </span>
      {children}
    </label>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span className="tnum font-semibold text-[var(--text-primary)]">{value}</span>
    </div>
  );
}

/**
 * Facture sous-traitant — prestations d'analyse confiées à un laboratoire
 * externe. Module administratif et financier : rien ici ne touche le stock.
 */
export function SubcontractorInvoiceWorkspace({
  data,
  notice,
}: {
  data: SubcontractorInvoiceData;
  /** Message laissé par l'action précédente, qui a changé d'URL. */
  notice: string | null;
}) {
  const router = useRouter();
  const invoice = data.invoice;
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(
    notice ? { message: notice, ok: true } : null
  );

  const [subcontractors, setSubcontractors] = useState(data.subcontractors);
  const [subcontractorId, setSubcontractorId] = useState<number | "">(
    invoice?.subcontractor_id ?? ""
  );
  const [addingSubcontractor, setAddingSubcontractor] = useState(false);
  const [newSubcontractor, setNewSubcontractor] = useState("");

  const [issueDate, setIssueDate] = useState(invoice?.issue_date ?? todayIso());
  const [stamp, setStamp] = useState(invoice ? toInput(invoice.stamp_duty) : DEFAULT_STAMP);
  const [description, setDescription] = useState(invoice?.description ?? "");
  const [vatRate, setVatRate] = useState(invoice?.default_vat_rate ?? 19);
  const [lines, setLines] = useState<Line[]>(() =>
    invoice ? invoice.lines.map(lineFromEntry) : [emptyLine(19)]
  );
  const entryDate = invoice?.entry_date ?? todayIso();

  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const computed = lines.map((line) => ({ line, ...lineAmounts(line) }));
  const totals = computed.reduce(
    (acc, c) => ({ net: acc.net + c.net, vat: acc.vat + c.vat }),
    { net: 0, vat: 0 }
  );
  const stampValue = stamp.trim() === "" ? 0 : parseDecimal(stamp);
  const stampOk = Number.isFinite(stampValue) && stampValue >= 0;
  const ttc = totals.net + totals.vat + (stampOk ? stampValue : 0);
  /* « Montant TVA (19%) » quand toutes les lignes partagent un taux. */
  const rates = new Set(lines.map((l) => l.vat_rate));
  const vatLabel = rates.size === 1 ? `Montant TVA (${[...rates][0]}%)` : "Montant TVA";

  const canSave =
    !pending &&
    subcontractorId !== "" &&
    issueDate !== "" &&
    description.trim() !== "" &&
    stampOk &&
    lines.length > 0 &&
    computed.every((c) => c.valid);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return data.invoices;
    return data.invoices.filter((i) =>
      [i.number, i.subcontractor, i.description].some((v) => v.toLowerCase().includes(q))
    );
  }, [data.invoices, query]);

  /* ------------------------------------------------------------ Lignes */

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  /* La première ligne reprend la description tant qu'on ne l'a pas
     réécrite à la main : sur une facture à une seule prestation, c'est
     une saisie de moins. */
  function changeDescription(value: string) {
    setLines((current) =>
      current.map((l, index) =>
        index === 0 && (l.designation === "" || l.designation === description)
          ? { ...l, designation: value }
          : l
      )
    );
    setDescription(value);
  }

  /* Le taux de l'en-tête est celui des nouvelles lignes ; le changer
     l'applique aussi aux lignes existantes, qui restent modifiables une à
     une ensuite. */
  function changeVat(rate: number) {
    setVatRate(rate);
    setLines((current) => current.map((l) => ({ ...l, vat_rate: rate })));
  }

  /* ---------------------------------------------------- Sous-traitants */

  function addSubcontractor() {
    const name = newSubcontractor.trim();
    if (!name) return;
    setFeedback(null);
    start(async () => {
      const result = await createSubcontractor(name);
      setFeedback({ ok: result.status === "success", message: result.message });
      if (result.status !== "success") return;
      setSubcontractors((current) =>
        [...current, result.subcontractor].sort((a, b) => a.name.localeCompare(b.name, "fr"))
      );
      setSubcontractorId(result.subcontractor.id);
      setAddingSubcontractor(false);
      setNewSubcontractor("");
    });
  }

  /* --------------------------------------------------------- Actions */

  function save() {
    if (subcontractorId === "") return;
    setFeedback(null);
    start(async () => {
      const result = await saveSubcontractorInvoice({
        invoice_id: invoice?.id ?? null,
        header: {
          subcontractor_id: subcontractorId,
          subcontractor_number: invoice?.subcontractor_number ?? "",
          issue_date: issueDate,
          description,
          default_vat_rate: vatRate,
          stamp_duty: stampOk ? stampValue : 0,
        },
        lines: lines.map((line) => ({
          kind: line.kind,
          designation: line.designation,
          quantity: Number.parseInt(line.quantity, 10),
          unit_price: parseDecimal(line.unit_price),
          discount_pct: line.discount_pct.trim() === "" ? 0 : parseDecimal(line.discount_pct),
          vat_rate: line.vat_rate,
        })),
      });
      setFeedback({ ok: result.status === "success", message: result.message });
      if (result.status !== "success") return;
      if (invoice) router.refresh();
      else
        router.replace(
          `/subcontracting?facture=${result.invoice_id}&info=${encodeURIComponent(result.message)}`
        );
    });
  }

  function remove() {
    if (!invoice) return;
    setFeedback(null);
    start(async () => {
      const result = await deleteSubcontractorInvoice(invoice.id);
      setConfirmDelete(false);
      setFeedback({ ok: result.status === "success", message: result.message });
      if (result.status === "success")
        router.replace(
          `/subcontracting?n=${invoice.id}&info=${encodeURIComponent(result.message)}`
        );
    });
  }

  const actionButton =
    "flex h-11 min-w-[150px] flex-1 items-center justify-center gap-2 rounded-lg px-4 text-[12px] font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45";

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h2 className="text-[20px] font-extrabold uppercase tracking-wide text-[var(--text-primary)]">
          Facture sous-traitant
        </h2>
        <p className="text-[11px] text-[var(--text-muted)]">
          Gestion des prestations de sous-traitance de laboratoire
        </p>
      </div>

      {feedback ? (
        <div
          role="status"
          className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium"
          style={{ color: feedback.ok ? "var(--good)" : "var(--critical)" }}
        >
          {feedback.ok ? (
            <CheckCircle2 size={14} strokeWidth={2.2} aria-hidden />
          ) : (
            <TriangleAlert size={14} strokeWidth={2.2} aria-hidden />
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

      {/* En-tête */}
      <section className="card p-4 md:p-5">
        <div className="grid grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="N° Facture" required>
            <div className="relative">
              <input
                value={invoice?.number ?? data.next_number}
                readOnly
                title={invoice ? undefined : "Numéro attribué à l'enregistrement"}
                className={cn(INPUT_CLASS, "tnum pr-10 font-semibold")}
              />
              <Barcode
                size={16}
                strokeWidth={2}
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-secondary)]"
                aria-hidden
              />
            </div>
          </Field>
          <Field label="Date de facture" required>
            <input
              type="date"
              value={issueDate}
              onChange={(e) => setIssueDate(e.target.value)}
              className={cn(INPUT_CLASS, "tnum font-semibold")}
            />
          </Field>
          <Field label="Laboratoire / Sous-traitant" required>
            <select
              value={addingSubcontractor ? NEW_SUBCONTRACTOR : subcontractorId}
              onChange={(e) => {
                if (e.target.value === NEW_SUBCONTRACTOR) {
                  setAddingSubcontractor(true);
                  return;
                }
                setAddingSubcontractor(false);
                setSubcontractorId(e.target.value === "" ? "" : Number(e.target.value));
              }}
              className={cn(INPUT_CLASS, "font-semibold uppercase")}
            >
              <option value="">— Choisir —</option>
              {subcontractors.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value={NEW_SUBCONTRACTOR}>+ Nouveau sous-traitant…</option>
            </select>
          </Field>
          <Field label="Timbre fiscal (TND)">
            <input
              inputMode="decimal"
              value={stamp}
              onChange={(e) => setStamp(e.target.value)}
              className={cn(
                INPUT_CLASS,
                "tnum font-semibold",
                stampOk ? null : "border-[var(--critical)]"
              )}
            />
          </Field>

          {addingSubcontractor ? (
            <div className="flex flex-wrap items-center gap-2 rounded-lg bg-[var(--page)] p-2.5 sm:col-span-2 lg:col-span-4">
              <input
                autoFocus
                value={newSubcontractor}
                onChange={(e) => setNewSubcontractor(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addSubcontractor();
                  }
                }}
                placeholder="Nom du laboratoire sous-traitant"
                className={cn(INPUT_CLASS, "h-9 min-w-[220px] flex-1")}
              />
              <button
                type="button"
                disabled={pending || newSubcontractor.trim() === ""}
                onClick={addSubcontractor}
                className="flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--series-1)" }}
              >
                <Plus size={13} strokeWidth={2.4} aria-hidden />
                Ajouter
              </button>
              <button
                type="button"
                onClick={() => {
                  setAddingSubcontractor(false);
                  setNewSubcontractor("");
                }}
                className="flex h-9 items-center rounded-lg px-3 text-[11px] font-medium text-[var(--text-secondary)] hover:bg-[var(--surface)]"
              >
                Annuler
              </button>
            </div>
          ) : null}

          <Field label="Date de saisie" className="self-start">
            <div className="tnum flex h-10 items-center justify-between rounded-lg bg-[var(--page)] px-3 text-[12px] text-[var(--text-secondary)]">
              {formatDate(entryDate)}
              <CalendarDays size={14} strokeWidth={2} aria-hidden />
            </div>
          </Field>
          <Field label="Description de la prestation" required>
            <textarea
              value={description}
              onChange={(e) => changeDescription(e.target.value)}
              rows={5}
              placeholder="Ex : Analyse spécialisée de biologie moléculaire - PCR"
              className="min-h-[120px] w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
            />
          </Field>
          <Field label="TVA" required className="self-start">
            <select
              value={vatRate}
              onChange={(e) => changeVat(Number(e.target.value))}
              className={cn(INPUT_CLASS, "tnum font-semibold")}
            >
              {VAT_RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}%
                </option>
              ))}
            </select>
          </Field>

          {/* Récapitulatif */}
          <div className="self-start overflow-hidden rounded-lg border border-[var(--border)]">
            <div
              className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[var(--surface)]"
              style={{ background: "var(--text-primary)" }}
            >
              Récapitulatif
            </div>
            <div className="divide-y divide-[var(--border)]">
              <SummaryRow label="Prix HT" value={`${formatTnd(totals.net)} TND`} />
              <SummaryRow label={vatLabel} value={`${formatTnd(totals.vat)} TND`} />
              <SummaryRow
                label="Timbre fiscal"
                value={`${formatTnd(stampOk ? stampValue : 0)} TND`}
              />
            </div>
            <div
              className="flex items-center justify-between gap-3 px-3 py-2.5 text-[var(--surface)]"
              style={{ background: "var(--text-primary)" }}
            >
              <span className="text-[11px] font-semibold">Prix TTC</span>
              <span className="tnum text-[20px] font-extrabold leading-none">
                {formatTnd(ttc)} <span className="text-[11px] font-semibold">TND</span>
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Détail de la prestation */}
      <section className="card min-w-0 p-4 md:p-5">
        <h3 className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wide text-[var(--text-primary)]">
          <ClipboardList size={16} strokeWidth={2.2} aria-hidden />
          Détail de la prestation
        </h3>

        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[900px] border-collapse text-[11px]">
            <thead style={{ background: "var(--text-primary)" }}>
              <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                <th className="w-8 rounded-l-lg px-3 py-2.5">#</th>
                <th className="w-[120px] px-2 py-2.5">Type</th>
                <th className="px-2 py-2.5">Désignation / Prestation</th>
                <th className="w-[80px] px-2 py-2.5 text-center">Quantité</th>
                <th className="w-[120px] px-2 py-2.5 text-center">Prix unitaire (TND)</th>
                <th className="w-[84px] px-2 py-2.5 text-center">Remise (%)</th>
                <th className="w-[84px] px-2 py-2.5 text-center">TVA</th>
                <th className="w-[120px] px-2 py-2.5 text-right">Total ligne (TND)</th>
                <th className="w-[44px] rounded-r-lg px-2 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {computed.map((c, index) => {
                const { line } = c;
                return (
                  <tr key={line.key} className="border-b border-[var(--border)]">
                    <td className="tnum px-3 py-2 font-semibold text-[var(--text-primary)]">
                      {index + 1}
                    </td>
                    <td className="px-1 py-2">
                      <select
                        value={line.kind}
                        onChange={(e) =>
                          updateLine(line.key, { kind: e.target.value as SubcontractorLineKind })
                        }
                        aria-label="Type de ligne"
                        className="h-7 cursor-pointer rounded-md border-0 px-2 text-[10px] font-bold uppercase tracking-wide outline-none"
                        style={{
                          color: line.kind === "prestation" ? "var(--series-1)" : "var(--serious)",
                          background: `color-mix(in srgb, ${
                            line.kind === "prestation" ? "var(--series-1)" : "var(--serious)"
                          } 12%, transparent)`,
                        }}
                      >
                        {(Object.keys(KIND_LABEL) as SubcontractorLineKind[]).map((kind) => (
                          <option key={kind} value={kind}>
                            {KIND_LABEL[kind]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-1 py-2">
                      <input
                        value={line.designation}
                        onChange={(e) => updateLine(line.key, { designation: e.target.value })}
                        placeholder="Désignation de la prestation"
                        className={CELL_INPUT}
                      />
                    </td>
                    <td className="px-1 py-2">
                      <input
                        inputMode="numeric"
                        value={line.quantity}
                        onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                        className={cn(CELL_INPUT, "tnum text-center")}
                        aria-label="Quantité"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <input
                        inputMode="decimal"
                        value={line.unit_price}
                        onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                        onBlur={() => {
                          const price = parseDecimal(line.unit_price);
                          if (Number.isFinite(price))
                            updateLine(line.key, { unit_price: formatTnd(price) });
                        }}
                        placeholder="0,000"
                        className={cn(CELL_INPUT, "tnum text-center")}
                        aria-label="Prix unitaire"
                      />
                    </td>
                    <td className="px-1 py-2">
                      <div className="relative">
                        <input
                          inputMode="decimal"
                          value={line.discount_pct}
                          onChange={(e) => updateLine(line.key, { discount_pct: e.target.value })}
                          className={cn(CELL_INPUT, "tnum pr-5 text-center")}
                          aria-label="Remise"
                        />
                        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-[var(--text-muted)]">
                          %
                        </span>
                      </div>
                    </td>
                    <td className="px-1 py-2">
                      <select
                        value={line.vat_rate}
                        onChange={(e) => updateLine(line.key, { vat_rate: Number(e.target.value) })}
                        className={cn(CELL_INPUT, "tnum")}
                        aria-label="TVA"
                      >
                        {VAT_RATES.map((rate) => (
                          <option key={rate} value={rate}>
                            {rate}%
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="tnum px-2 py-2 text-right text-[12px] font-bold text-[var(--text-primary)]">
                      {c.valid ? formatTnd(c.total) : "—"}
                    </td>
                    <td className="px-1 py-2 text-center">
                      <button
                        type="button"
                        disabled={lines.length === 1}
                        onClick={() =>
                          setLines((current) => current.filter((l) => l.key !== line.key))
                        }
                        title={lines.length === 1 ? "Une facture a au moins une ligne" : "Retirer la ligne"}
                        className="grid h-8 w-8 place-items-center rounded-md hover:bg-[var(--page)] disabled:opacity-35"
                        style={{ color: "var(--critical)" }}
                      >
                        <Trash2 size={14} strokeWidth={2.2} aria-hidden />
                        <span className="sr-only">Retirer la ligne</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <button
          type="button"
          onClick={() => setLines((current) => [...current, emptyLine(vatRate)])}
          className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-[var(--border)] text-[11px] font-semibold text-[var(--series-1)] hover:bg-[var(--page)]"
        >
          <PlusCircle size={15} strokeWidth={2.2} aria-hidden />
          Ajouter une ligne de prestation
        </button>

        <p
          className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2.5 text-[11px] text-[var(--text-secondary)]"
          style={{ background: "color-mix(in srgb, var(--series-1) 8%, transparent)" }}
        >
          <Info size={14} strokeWidth={2.2} style={{ color: "var(--series-1)" }} aria-hidden />
          Le calcul du prix TTC inclut le timbre fiscal.
        </p>
      </section>

      {/* Actions */}
      <div className="card flex flex-wrap items-center gap-2.5 p-3">
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className={cn(
            actionButton,
            "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--page)]"
          )}
        >
          <Search size={15} strokeWidth={2.2} aria-hidden />
          Rechercher facture
        </button>
        <button
          type="button"
          disabled={invoice !== null || !canSave}
          onClick={save}
          title={invoice ? "Facture déjà enregistrée : utilisez « Mettre à jour »" : undefined}
          className={cn(actionButton, "text-white")}
          style={{ background: "var(--series-1)" }}
        >
          {pending && !invoice ? (
            <Loader2 size={15} strokeWidth={2.4} className="animate-spin" aria-hidden />
          ) : (
            <Save size={15} strokeWidth={2.2} aria-hidden />
          )}
          Enregistrer facture
        </button>
        <button
          type="button"
          disabled={invoice === null || !canSave}
          onClick={save}
          title={invoice ? undefined : "Ouvrez d'abord une facture via « Rechercher facture »"}
          className={cn(actionButton, "text-white")}
          style={{ background: "var(--warning)" }}
        >
          {pending && invoice && !confirmDelete ? (
            <Loader2 size={15} strokeWidth={2.4} className="animate-spin" aria-hidden />
          ) : (
            <SquarePen size={15} strokeWidth={2.2} aria-hidden />
          )}
          Mettre à jour
        </button>
        {confirmDelete ? (
          <div className="flex min-w-[150px] flex-1 items-center gap-1.5">
            <button
              type="button"
              disabled={pending}
              onClick={remove}
              className={cn(actionButton, "min-w-0 text-white")}
              style={{ background: "var(--critical)" }}
            >
              {pending ? (
                <Loader2 size={15} strokeWidth={2.4} className="animate-spin" aria-hidden />
              ) : null}
              Confirmer
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => setConfirmDelete(false)}
              className="flex h-11 items-center rounded-lg border border-[var(--border)] px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
            >
              Non
            </button>
          </div>
        ) : (
          <button
            type="button"
            disabled={invoice === null || pending}
            onClick={() => setConfirmDelete(true)}
            className={cn(actionButton, "text-white")}
            style={{ background: "var(--critical)" }}
          >
            <Trash2 size={15} strokeWidth={2.2} aria-hidden />
            Supprimer
          </button>
        )}
        <Link
          href="/invoices"
          className={cn(
            actionButton,
            "border border-[var(--border)] bg-[var(--surface)] text-[var(--text-primary)] hover:bg-[var(--page)]"
          )}
        >
          <LogOut size={15} strokeWidth={2.2} aria-hidden />
          Quitter
        </Link>
      </div>

      {/* Rechercher facture */}
      {searchOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 pt-[10vh]"
          onClick={() => setSearchOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Rechercher une facture sous-traitant"
            className="card flex max-h-[75vh] w-full max-w-[720px] flex-col p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-2">
              <div className="relative flex-1">
                <Search
                  size={14}
                  strokeWidth={2.2}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]"
                  aria-hidden
                />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") setSearchOpen(false);
                  }}
                  placeholder="N° de facture, sous-traitant ou prestation"
                  className={cn(INPUT_CLASS, "pl-9")}
                />
              </div>
              <button
                type="button"
                onClick={() => setSearchOpen(false)}
                className="grid h-10 w-10 place-items-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--page)]"
              >
                <X size={16} strokeWidth={2.2} aria-hidden />
                <span className="sr-only">Fermer</span>
              </button>
            </div>

            <div className="-mx-1 overflow-y-auto">
              {results.length === 0 ? (
                <p className="py-8 text-center text-[11px] text-[var(--text-muted)]">
                  {data.invoices.length === 0
                    ? "Aucune facture sous-traitant enregistrée."
                    : "Aucune facture ne correspond à la recherche."}
                </p>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {results.map((row) => (
                    <li key={row.id}>
                      <Link
                        href={`/subcontracting?facture=${row.id}`}
                        onClick={() => setSearchOpen(false)}
                        className={cn(
                          "flex items-center gap-3 rounded-md px-2 py-2.5 text-[11px] hover:bg-[var(--page)]",
                          row.id === invoice?.id && "bg-[var(--page)]"
                        )}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="tnum block font-semibold text-[var(--text-primary)]">
                            {row.number}
                            <span className="ml-2 font-normal uppercase text-[var(--text-secondary)]">
                              {row.subcontractor}
                            </span>
                          </span>
                          <span className="block truncate text-[10px] text-[var(--text-muted)]">
                            {row.description}
                          </span>
                        </span>
                        <span className="tnum shrink-0 text-[10px] text-[var(--text-secondary)]">
                          {formatDate(row.issue_date)}
                        </span>
                        <span className="tnum w-[100px] shrink-0 text-right font-bold text-[var(--text-primary)]">
                          {formatTnd(row.total_ttc)} TND
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {invoice ? (
              <Link
                href={`/subcontracting?n=${invoice.id}`}
                onClick={() => setSearchOpen(false)}
                className="mt-3 inline-flex items-center gap-1.5 self-start text-[11px] font-semibold text-[var(--series-1)] hover:underline"
              >
                <Plus size={13} strokeWidth={2.4} aria-hidden />
                Nouvelle facture
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
