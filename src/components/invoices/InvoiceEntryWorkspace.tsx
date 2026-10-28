"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  CircleDot,
  Expand,
  FileText,
  FileUp,
  Loader2,
  Plus,
  Printer,
  Save,
  Search,
  Trash2,
  TriangleAlert,
  X,
} from "lucide-react";
import {
  createArticleFromLine,
  extractInvoice,
  saveSupplierInvoice,
} from "@/app/(app)/invoices/actions";
import type { ExtractedInvoice } from "@/app/(app)/invoices/actions";
import { cn, formatDate, formatInt, formatTnd } from "@/lib/utils";
import type {
  InvoiceEntryData,
  InvoiceEntryLine,
  InvoiceEntryProduct,
} from "@/lib/types";

const VAT_RATES = [19, 13, 7, 0];
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
/* Timbre fiscal par défaut sur une facture tunisienne. */
const DEFAULT_STAMP = "1,000";

const TERMS = [
  { days: 0, label: "Comptant" },
  { days: 30, label: "À 30 jours" },
  { days: 45, label: "À 45 jours" },
  { days: 60, label: "À 60 jours" },
  { days: 90, label: "À 90 jours" },
];

const INPUT_CLASS =
  "h-10 w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]";
const CELL_INPUT =
  "h-8 w-full rounded-md border border-transparent bg-transparent px-1.5 text-[11px] text-[var(--text-primary)] outline-none hover:border-[var(--border)] focus:border-[var(--series-1)] focus:bg-[var(--surface)]";

type Feedback = { message: string; ok: boolean } | null;

type Line = {
  key: number;
  product_id: number | null;
  manufacturer_ref: string;
  description: string;
  quantity: string;
  unit_price: string;
  discount_pct: string;
  vat_rate: number;
  /** Ajoutée à la main plutôt que lue sur le document. */
  manual: boolean;
};

type LineStatus = "matched" | "price_changed" | "new_product" | "manual";

type Analysis =
  | { state: "idle" }
  | { state: "running" }
  | { state: "done"; lines: number }
  | { state: "error"; message: string };

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

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`;
}

function normalize(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/**
 * Rapprochement d'une ligne lue avec le référentiel : référence fabricant,
 * puis référence interne, puis désignation exacte. À égalité, les articles
 * du fournisseur de la facture passent devant.
 */
function matchProduct(
  products: InvoiceEntryProduct[],
  supplierId: number | "",
  reference: string | null,
  designation: string
): InvoiceEntryProduct | null {
  const ref = normalize(reference);
  const name = normalize(designation);
  const ordered =
    supplierId === ""
      ? products
      : [
          ...products.filter((p) => p.supplier_id === supplierId),
          ...products.filter((p) => p.supplier_id !== supplierId),
        ];
  if (ref) {
    const byManufacturer = ordered.find((p) => normalize(p.manufacturer_ref) === ref);
    if (byManufacturer) return byManufacturer;
    const byReference = ordered.find((p) => normalize(p.reference) === ref);
    if (byReference) return byReference;
  }
  if (name) return ordered.find((p) => normalize(p.name) === name) ?? null;
  return null;
}

let lineKey = 0;
const nextKey = () => ++lineKey;

function lineFromEntry(entry: InvoiceEntryLine): Line {
  return {
    key: nextKey(),
    product_id: entry.product_id,
    manufacturer_ref: entry.manufacturer_ref ?? "",
    description: entry.description,
    quantity: String(entry.quantity),
    unit_price: toInput(entry.unit_price),
    discount_pct: toInput(entry.discount_pct),
    vat_rate: entry.vat_rate,
    manual: entry.match_status === "manual",
  };
}

function lineAmounts(line: Line) {
  const qty = Number.parseInt(line.quantity, 10);
  const price = parseDecimal(line.unit_price);
  const discount = line.discount_pct.trim() === "" ? 0 : parseDecimal(line.discount_pct);
  const valid =
    Number.isInteger(qty) &&
    qty > 0 &&
    Number.isFinite(price) &&
    price >= 0 &&
    Number.isFinite(discount) &&
    discount >= 0 &&
    discount <= 100;
  if (!valid) return { valid: false, gross: 0, discount: 0, net: 0, vat: 0, total: 0 };
  const gross = qty * price;
  const discountAmount = (gross * discount) / 100;
  const net = gross - discountAmount;
  const vat = (net * line.vat_rate) / 100;
  return { valid: true, gross, discount: discountAmount, net, vat, total: net + vat };
}

const STATUS_CONFIG: Record<LineStatus, { label: string; color: string; Icon: typeof Check }> = {
  matched: { label: "Correspondant", color: "var(--good)", Icon: Check },
  price_changed: { label: "Prix modifié", color: "var(--serious)", Icon: AlertTriangle },
  new_product: { label: "Nouvel article", color: "var(--warning)", Icon: CircleDot },
  manual: { label: "Saisie manuelle", color: "var(--series-1)", Icon: Plus },
};

function StatusBadge({ status }: { status: LineStatus }) {
  const { label, color, Icon } = STATUS_CONFIG[status];
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
    >
      <Icon size={11} strokeWidth={2.6} aria-hidden />
      {label}
    </span>
  );
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

function Step({
  index,
  title,
  detail,
  state,
}: {
  index: number;
  title: string;
  detail: string;
  state: "done" | "active" | "todo";
}) {
  const color =
    state === "done" ? "var(--good)" : state === "active" ? "var(--serious)" : "var(--text-muted)";
  return (
    <div className="flex items-center gap-2.5">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold"
        style={
          state === "todo"
            ? { color, boxShadow: `inset 0 0 0 1.5px ${color}` }
            : { color: "white", background: color }
        }
      >
        {state === "done" ? <Check size={13} strokeWidth={3} aria-hidden /> : index}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-bold text-[var(--text-primary)]">{title}</span>
        <span className="block text-[10px] text-[var(--text-muted)]">{detail}</span>
      </span>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  color,
  strong,
}: {
  label: string;
  value: string;
  color?: string;
  strong?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-[11px]">
      <span className="text-[var(--text-secondary)]">{label}</span>
      <span
        className={cn("tnum", strong ? "font-bold" : "font-semibold")}
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

function confidenceBadge(confidence: number | null) {
  if (confidence === null) return null;
  if (confidence >= 90) return { label: `Haute confiance (${confidence}%)`, color: "var(--good)" };
  if (confidence >= 70) return { label: `Confiance moyenne (${confidence}%)`, color: "var(--warning)" };
  return { label: `Faible confiance (${confidence}%)`, color: "var(--critical)" };
}

/**
 * Facture fournisseur — saisie intelligente : import du document, lecture
 * automatique, vérification ligne à ligne contre le référentiel, puis
 * enregistrement en brouillon ou validation.
 */
export function InvoiceEntryWorkspace({ data }: { data: InvoiceEntryData }) {
  const router = useRouter();
  const draft = data.draft;
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);

  const [products, setProducts] = useState(data.products);
  const [invoiceId, setInvoiceId] = useState<number | null>(draft?.id ?? null);
  const [internalNumber, setInternalNumber] = useState<string | null>(draft?.number ?? null);
  const [validated, setValidated] = useState(false);

  /* En-tête */
  const [supplierNumber, setSupplierNumber] = useState(draft?.supplier_number ?? "");
  const [issueDate, setIssueDate] = useState(draft?.issue_date ?? todayIso());
  const [supplierId, setSupplierId] = useState<number | "">(draft?.supplier_id ?? "");
  const [orderId, setOrderId] = useState<number | "">(draft?.order_id ?? "");
  const [termsDays, setTermsDays] = useState<number>(draft?.payment_terms_days ?? 30);
  const [stamp, setStamp] = useState(draft ? toInput(draft.stamp_duty) : DEFAULT_STAMP);
  const [confidence, setConfidence] = useState<number | null>(draft?.ocr_confidence ?? null);
  const entryDate = todayIso();

  /* Document importé : le fichier local tant qu'il n'est pas envoyé, sinon
     l'URL signée du brouillon. */
  const [file, setFile] = useState<File | null>(null);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [preview, setPreview] = useState<{
    url: string;
    type: string;
    name: string;
    size: number | null;
  } | null>(
    draft?.document_url
      ? {
          url: draft.document_url,
          type: draft.document_type ?? "",
          name: draft.document_name ?? "Document",
          size: draft.document_size,
        }
      : null
  );
  const objectUrl = useRef<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis>(
    draft?.document_url ? { state: "done", lines: draft.lines.length } : { state: "idle" }
  );

  const [lines, setLines] = useState<Line[]>(() => (draft?.lines ?? []).map(lineFromEntry));
  const [showPriceDetails, setShowPriceDetails] = useState(false);
  const [creatingKey, setCreatingKey] = useState<number | null>(null);

  useEffect(
    () => () => {
      if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    },
    []
  );

  const productById = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const supplierOrders = useMemo(
    () => (supplierId === "" ? [] : data.orders.filter((o) => o.supplier_id === supplierId)),
    [data.orders, supplierId]
  );

  /* Articles proposés dans la colonne « Référence article » : ceux du
     fournisseur d'abord, le reste ensuite. */
  const productOptions = useMemo(() => {
    const label = (p: InvoiceEntryProduct) =>
      `${p.manufacturer_ref || p.reference || "—"} · ${p.name}`;
    const own = products.filter((p) => supplierId !== "" && p.supplier_id === supplierId);
    const others = products.filter((p) => supplierId === "" || p.supplier_id !== supplierId);
    return { own, others, label };
  }, [products, supplierId]);

  function statusOf(line: Line): LineStatus {
    if (line.product_id === null) return line.manual ? "manual" : "new_product";
    const product = productById.get(line.product_id);
    const price = parseDecimal(line.unit_price);
    if (product && Number.isFinite(price) && Math.abs(product.unit_price - price) > 0.0005)
      return "price_changed";
    return "matched";
  }

  const computed = lines.map((line) => ({ line, status: statusOf(line), ...lineAmounts(line) }));
  const totals = computed.reduce(
    (acc, c) => ({
      gross: acc.gross + c.gross,
      discount: acc.discount + c.discount,
      net: acc.net + c.net,
      vat: acc.vat + c.vat,
    }),
    { gross: 0, discount: 0, net: 0, vat: 0 }
  );
  const stampValue = stamp.trim() === "" ? 0 : parseDecimal(stamp);
  const stampOk = Number.isFinite(stampValue) && stampValue >= 0;
  const ttc = totals.net + totals.vat + (stampOk ? stampValue : 0);

  const counts = {
    matched: computed.filter((c) => c.status === "matched" || c.status === "price_changed").length,
    newProducts: computed.filter((c) => c.status === "new_product").length,
    priceChanged: computed.filter((c) => c.status === "price_changed"),
  };

  const linesValid = computed.every(
    (c) => c.valid && (c.line.product_id !== null || c.line.description.trim() !== "")
  );
  const canDraft = !pending && !validated && supplierId !== "" && issueDate !== "" && linesValid && stampOk;
  const canValidate = canDraft && supplierNumber.trim() !== "" && lines.length > 0;

  const step: 1 | 2 | 3 = validated ? 3 : lines.length > 0 ? 2 : 1;
  const stepState = (n: number) => (n < step ? "done" : n === step ? "active" : "todo") as
    | "done"
    | "active"
    | "todo";

  /* ------------------------------------------------------------ Lignes */

  function updateLine(key: number, patch: Partial<Line>) {
    setLines((current) => current.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  }

  function addManualLine() {
    setLines((current) => [
      ...current,
      {
        key: nextKey(),
        product_id: null,
        manufacturer_ref: "",
        description: "",
        quantity: "1",
        unit_price: "",
        discount_pct: "0",
        vat_rate: 19,
        manual: true,
      },
    ]);
  }

  function chooseProduct(line: Line, value: string) {
    if (value === "") {
      updateLine(line.key, { product_id: null });
      return;
    }
    const product = productById.get(Number(value));
    if (!product) return;
    updateLine(line.key, {
      product_id: product.id,
      manufacturer_ref: line.manufacturer_ref || product.manufacturer_ref || "",
      description: line.description.trim() === "" ? product.name : line.description,
      unit_price: line.unit_price.trim() === "" ? toInput(product.unit_price) : line.unit_price,
    });
  }

  /** Relance le rapprochement sur les lignes encore sans article. */
  function verifyMatches() {
    let found = 0;
    const next = lines.map((line) => {
      if (line.product_id !== null) return line;
      const product = matchProduct(products, supplierId, line.manufacturer_ref, line.description);
      if (!product) return line;
      found += 1;
      return { ...line, product_id: product.id };
    });
    setLines(next);
    const remaining = next.filter((l) => l.product_id === null).length;
    setFeedback({
      ok: true,
      message:
        found > 0
          ? `${found} nouvelle(s) correspondance(s) trouvée(s).${remaining > 0 ? ` ${remaining} ligne(s) restent sans article.` : ""}`
          : remaining > 0
            ? `Aucune nouvelle correspondance : ${remaining} ligne(s) sans article au référentiel.`
            : "Toutes les lignes sont rapprochées du référentiel.",
    });
  }

  async function createArticle(line: Line) {
    if (supplierId === "") {
      setFeedback({ ok: false, message: "Sélectionnez d'abord le fournisseur." });
      return;
    }
    setCreatingKey(line.key);
    setFeedback(null);
    const result = await createArticleFromLine({
      name: line.description,
      manufacturer_ref: line.manufacturer_ref || null,
      supplier_id: supplierId,
      unit_price: Math.max(0, parseDecimal(line.unit_price) || 0),
      vat_rate: line.vat_rate,
    });
    setCreatingKey(null);
    if (result.status === "error") {
      setFeedback({ ok: false, message: result.message });
      return;
    }
    setProducts((current) => [...current, result.product]);
    updateLine(line.key, { product_id: result.product.id });
    setFeedback({ ok: true, message: result.message });
  }

  /* ---------------------------------------------------------- Document */

  function applyExtraction(invoice: ExtractedInvoice) {
    let supplier: number | "" = supplierId;
    if (invoice.supplier_name) {
      const wanted = normalize(invoice.supplier_name);
      const hit = data.suppliers.find((s) => {
        const name = normalize(s.name);
        return name === wanted || wanted.includes(name) || name.includes(wanted);
      });
      if (hit) supplier = hit.id;
    }
    setSupplierId(supplier);
    if (invoice.invoice_number) setSupplierNumber(invoice.invoice_number);
    if (invoice.invoice_date) setIssueDate(invoice.invoice_date);
    if (invoice.payment_terms_days !== null) setTermsDays(invoice.payment_terms_days);
    if (invoice.stamp_duty !== null) setStamp(toInput(invoice.stamp_duty));
    setConfidence(invoice.confidence);

    if (invoice.order_reference && supplier !== "") {
      const ref = normalize(invoice.order_reference);
      const order = data.orders.find(
        (o) => o.supplier_id === supplier && normalize(o.number) === ref
      );
      if (order) setOrderId(order.id);
    }

    setLines(
      invoice.lines.map((l) => ({
        key: nextKey(),
        product_id: matchProduct(products, supplier, l.reference, l.designation)?.id ?? null,
        manufacturer_ref: l.reference ?? "",
        description: l.designation,
        quantity: String(l.quantity),
        unit_price: toInput(l.unit_price),
        discount_pct: toInput(l.discount_pct),
        vat_rate: VAT_RATES.includes(l.vat_rate) ? l.vat_rate : 19,
        manual: false,
      }))
    );
  }

  function acceptFile(selected: File | undefined) {
    if (!selected) return;
    if (!ACCEPTED_TYPES.includes(selected.type)) {
      setAnalysis({ state: "error", message: "Format non pris en charge : PDF, JPG ou PNG." });
      return;
    }
    if (selected.size > MAX_FILE_SIZE) {
      setAnalysis({ state: "error", message: "Fichier trop volumineux (10 Mo maximum)." });
      return;
    }

    if (objectUrl.current) URL.revokeObjectURL(objectUrl.current);
    const url = URL.createObjectURL(selected);
    objectUrl.current = url;
    setFile(selected);
    setFileUploaded(false);
    setPreview({ url, type: selected.type, name: selected.name, size: selected.size });
    setAnalysis({ state: "running" });
    setFeedback(null);

    const form = new FormData();
    form.set("file", selected);
    extractInvoice(form)
      .then((result) => {
        if (result.status === "error") {
          setAnalysis({ state: "error", message: result.message });
          return;
        }
        applyExtraction(result.invoice);
        setAnalysis({ state: "done", lines: result.invoice.lines.length });
      })
      .catch(() =>
        setAnalysis({ state: "error", message: "La lecture du document a échoué. Réessayez." })
      );
  }

  /* ------------------------------------------------------- Enregistrement */

  function save(asDraft: boolean) {
    if (supplierId === "") return;
    setFeedback(null);
    const form = new FormData();
    form.set(
      "payload",
      JSON.stringify({
        invoice_id: invoiceId,
        draft: asDraft,
        header: {
          supplier_id: supplierId,
          supplier_number: supplierNumber,
          issue_date: issueDate,
          order_id: orderId === "" ? null : orderId,
          payment_terms_days: termsDays,
          stamp_duty: stampOk ? stampValue : 0,
          ocr_confidence: confidence,
        },
        lines: lines.map(
          (line): InvoiceEntryLine => ({
            product_id: line.product_id,
            manufacturer_ref: line.manufacturer_ref.trim() || null,
            description: line.description.trim(),
            quantity: Number.parseInt(line.quantity, 10),
            unit_price: parseDecimal(line.unit_price),
            discount_pct: line.discount_pct.trim() === "" ? 0 : parseDecimal(line.discount_pct),
            vat_rate: line.vat_rate,
            match_status: line.manual
              ? "manual"
              : line.product_id === null
                ? "new_product"
                : "matched",
          })
        ),
      })
    );
    if (file && !fileUploaded) form.set("file", file);

    start(async () => {
      const result = await saveSupplierInvoice(form);
      setFeedback({ ok: result.status === "success", message: result.message });
      if (result.status !== "success") return;
      setInvoiceId(result.invoice_id);
      setInternalNumber(result.number);
      setFileUploaded(true);
      if (!result.draft) setValidated(true);
      router.refresh();
    });
  }

  const badge = confidenceBadge(confidence);
  const supplierName = data.suppliers.find((s) => s.id === supplierId)?.name ?? "";
  const termOptions = TERMS.some((t) => t.days === termsDays)
    ? TERMS
    : [...TERMS, { days: termsDays, label: `À ${termsDays} jours` }].sort((a, b) => a.days - b.days);

  return (
    <div className="flex flex-col gap-3">
      <div className="text-center">
        <h2 className="text-[20px] font-extrabold uppercase tracking-wide text-[var(--text-primary)]">
          Facture fournisseur
        </h2>
        <p className="text-[11px] text-[var(--text-muted)]">Saisie intelligente et automatisée</p>
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

      <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-3">
          {/* En-tête + import */}
          <section className="card p-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
              <div className="grid grid-cols-1 content-start gap-4 sm:grid-cols-3">
                <Field label="N° Facture" required>
                  <input
                    value={supplierNumber}
                    onChange={(e) => setSupplierNumber(e.target.value)}
                    placeholder="Ex: FAC-2026-056"
                    disabled={validated}
                    className={cn(INPUT_CLASS, "font-semibold")}
                  />
                </Field>
                <Field label="Date de facture" required>
                  <input
                    type="date"
                    value={issueDate}
                    onChange={(e) => setIssueDate(e.target.value)}
                    disabled={validated}
                    className={cn(INPUT_CLASS, "tnum font-semibold")}
                  />
                </Field>
                <Field label="Fournisseur" required>
                  <select
                    value={supplierId}
                    onChange={(e) => {
                      setSupplierId(e.target.value === "" ? "" : Number(e.target.value));
                      setOrderId("");
                    }}
                    disabled={validated}
                    className={cn(INPUT_CLASS, "font-semibold")}
                  >
                    <option value="">— Choisir —</option>
                    {data.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field label="Date de saisie">
                  <div className="tnum flex h-10 items-center justify-between rounded-lg bg-[var(--page)] px-3 text-[12px] text-[var(--text-secondary)]">
                    {formatDate(entryDate)}
                    <CalendarDays size={14} strokeWidth={2} aria-hidden />
                  </div>
                </Field>
                <Field label="Référence commande">
                  <select
                    value={orderId}
                    onChange={(e) => setOrderId(e.target.value === "" ? "" : Number(e.target.value))}
                    disabled={validated || supplierId === ""}
                    className={cn(INPUT_CLASS, "tnum")}
                  >
                    <option value="">
                      {supplierId === "" ? "Choisir le fournisseur" : "— Aucune —"}
                    </option>
                    {supplierOrders.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.number} · {formatDate(o.ordered_at)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Conditions de paiement">
                  <select
                    value={termsDays}
                    onChange={(e) => setTermsDays(Number(e.target.value))}
                    disabled={validated}
                    className={INPUT_CLASS}
                  >
                    {termOptions.map((t) => (
                      <option key={t.days} value={t.days}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                </Field>

                {internalNumber ? (
                  <p className="text-[10px] text-[var(--text-muted)] sm:col-span-3">
                    Référence interne{" "}
                    <span className="font-semibold text-[var(--text-primary)]">{internalNumber}</span>
                    {validated ? " — facture validée" : " — brouillon"}
                  </p>
                ) : null}
              </div>

              {/* Zone d'import */}
              <div className="flex flex-col gap-2">
                <div
                  onDragOver={(e) => {
                    e.preventDefault();
                    if (!validated) setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    if (!validated) acceptFile(e.dataTransfer.files[0]);
                  }}
                  className={cn(
                    "flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-3 py-4 text-center transition-colors",
                    dragging ? "border-[var(--series-1)] bg-[var(--page)]" : "border-[var(--border)]"
                  )}
                >
                  <FileUp size={26} strokeWidth={1.6} className="text-[var(--text-muted)]" aria-hidden />
                  <button
                    type="button"
                    disabled={validated || analysis.state === "running"}
                    onClick={() => fileInput.current?.click()}
                    className="flex h-9 items-center gap-2 rounded-lg px-4 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                    style={{ background: "var(--text-primary)" }}
                  >
                    <Search size={13} strokeWidth={2.4} aria-hidden />
                    Parcourir la facture
                  </button>
                  <span className="text-[10px] text-[var(--text-muted)]">
                    ou glisser-déposer le fichier ici
                    <br />
                    PDF, JPG, PNG (Max. 10 Mo)
                  </span>
                  <input
                    ref={fileInput}
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      acceptFile(e.target.files?.[0]);
                      e.target.value = "";
                    }}
                  />
                </div>

                {analysis.state === "running" ? (
                  <div className="flex items-center gap-2 rounded-lg bg-[var(--page)] px-3 py-2 text-[11px] font-medium text-[var(--text-secondary)]">
                    <Loader2 size={14} strokeWidth={2.4} className="animate-spin" aria-hidden />
                    Analyse de la facture en cours…
                  </div>
                ) : analysis.state === "done" ? (
                  <div
                    className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px]"
                    style={{ background: "color-mix(in srgb, var(--good) 10%, transparent)" }}
                  >
                    <CheckCircle2 size={16} strokeWidth={2.4} style={{ color: "var(--good)" }} aria-hidden />
                    <span>
                      <span className="block font-semibold" style={{ color: "var(--good)" }}>
                        Facture analysée avec succès !
                      </span>
                      <span className="text-[var(--text-secondary)]">
                        {formatInt(analysis.lines)} ligne(s) détectée(s)
                      </span>
                    </span>
                  </div>
                ) : analysis.state === "error" ? (
                  <div
                    className="flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]"
                    style={{
                      color: "var(--critical)",
                      background: "color-mix(in srgb, var(--critical) 8%, transparent)",
                    }}
                  >
                    <TriangleAlert size={14} strokeWidth={2.4} className="mt-0.5 shrink-0" aria-hidden />
                    {analysis.message}
                  </div>
                ) : null}
              </div>
            </div>

            {/* Étapes */}
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-[var(--border)] pt-4">
              <Step index={1} title="Import / OCR" detail="Lecture de la facture" state={stepState(1)} />
              <ArrowRight size={16} className="text-[var(--text-muted)]" aria-hidden />
              <Step index={2} title="Vérification" detail="Contrôle des données" state={stepState(2)} />
              <ArrowRight size={16} className="text-[var(--text-muted)]" aria-hidden />
              <Step index={3} title="Validation" detail="Enregistrement de la facture" state={stepState(3)} />
              <button
                type="button"
                onClick={verifyMatches}
                disabled={lines.length === 0 || validated}
                className="ml-auto flex h-9 items-center gap-2 rounded-lg border border-[var(--border)] px-3 text-[11px] font-semibold text-[var(--series-1)] transition-colors hover:bg-[var(--page)] disabled:opacity-50"
              >
                <Search size={13} strokeWidth={2.4} aria-hidden />
                Vérifier les correspondances
              </button>
            </div>
          </section>

          {/* Lignes */}
          <section className="card min-w-0 p-4">
            <h3 className="mb-3 text-[12px] font-bold text-[var(--text-primary)]">
              Détails des articles détectés ({formatInt(lines.length)})
            </h3>

            <div className="-mx-1 overflow-x-auto">
              <table className="w-full min-w-[980px] border-collapse text-[11px]">
                <thead style={{ background: "var(--text-primary)" }}>
                  <tr className="text-left text-[10px] font-semibold text-[var(--surface)]">
                    <th className="w-8 rounded-l-lg px-2 py-2.5">#</th>
                    <th className="w-[170px] px-2 py-2.5">Référence article</th>
                    <th className="px-2 py-2.5">Désignation</th>
                    <th className="w-[72px] px-2 py-2.5 text-right">Quantité</th>
                    <th className="w-[100px] px-2 py-2.5 text-right">Prix unitaire (TND)</th>
                    <th className="w-[70px] px-2 py-2.5 text-right">Remise (%)</th>
                    <th className="w-[76px] px-2 py-2.5">TVA</th>
                    <th className="w-[100px] px-2 py-2.5 text-right">Total ligne (TND)</th>
                    <th className="w-[120px] px-2 py-2.5">Statut</th>
                    <th className="w-[64px] rounded-r-lg px-2 py-2.5 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {computed.length === 0 ? (
                    <tr>
                      <td colSpan={10} className="py-8 text-center text-[11px] text-[var(--text-muted)]">
                        Importez une facture pour lire ses lignes automatiquement, ou ajoutez-les
                        manuellement.
                      </td>
                    </tr>
                  ) : null}
                  {computed.map((c, index) => {
                    const { line, status } = c;
                    const selectedProduct =
                      line.product_id === null ? null : productById.get(line.product_id) ?? null;
                    return (
                      <tr key={line.key} className="border-b border-[var(--border)]">
                        <td className="tnum px-2 py-1 text-[var(--text-muted)]">{index + 1}</td>
                        <td className="px-1 py-1">
                          <select
                            value={line.product_id ?? ""}
                            onChange={(e) => chooseProduct(line, e.target.value)}
                            disabled={validated}
                            title={
                              selectedProduct
                                ? productOptions.label(selectedProduct)
                                : line.manufacturer_ref || "Non rapproché"
                            }
                            className={cn(CELL_INPUT, "font-semibold")}
                          >
                            <option value="">
                              {line.manufacturer_ref ? `${line.manufacturer_ref} (inconnu)` : "— Aucun article —"}
                            </option>
                            {productOptions.own.length > 0 ? (
                              <optgroup label={supplierName}>
                                {productOptions.own.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {productOptions.label(p)}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                            {productOptions.others.length > 0 ? (
                              <optgroup label={supplierId === "" ? "Articles" : "Autres fournisseurs"}>
                                {productOptions.others.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {productOptions.label(p)}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null}
                          </select>
                        </td>
                        <td className="px-1 py-1">
                          <input
                            value={line.description}
                            onChange={(e) => updateLine(line.key, { description: e.target.value })}
                            placeholder="Désignation"
                            disabled={validated}
                            className={CELL_INPUT}
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            inputMode="numeric"
                            value={line.quantity}
                            onChange={(e) => updateLine(line.key, { quantity: e.target.value })}
                            disabled={validated}
                            className={cn(CELL_INPUT, "tnum text-right")}
                            aria-label="Quantité"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            inputMode="decimal"
                            value={line.unit_price}
                            onChange={(e) => updateLine(line.key, { unit_price: e.target.value })}
                            placeholder="0,000"
                            disabled={validated}
                            className={cn(CELL_INPUT, "tnum text-right")}
                            aria-label="Prix unitaire"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            inputMode="decimal"
                            value={line.discount_pct}
                            onChange={(e) => updateLine(line.key, { discount_pct: e.target.value })}
                            disabled={validated}
                            className={cn(CELL_INPUT, "tnum text-right")}
                            aria-label="Remise"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <select
                            value={line.vat_rate}
                            onChange={(e) => updateLine(line.key, { vat_rate: Number(e.target.value) })}
                            disabled={validated}
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
                        <td className="tnum px-2 py-1 text-right font-semibold text-[var(--text-primary)]">
                          {c.valid ? formatTnd(c.net) : "—"}
                        </td>
                        <td className="px-2 py-1">
                          <span
                            title={
                              status === "price_changed" && selectedProduct
                                ? `Prix référentiel : ${formatTnd(selectedProduct.unit_price)} TND`
                                : undefined
                            }
                          >
                            <StatusBadge status={status} />
                          </span>
                        </td>
                        <td className="px-1 py-1">
                          <div className="flex items-center justify-center gap-0.5">
                            {status === "new_product" || (status === "manual" && line.description.trim()) ? (
                              <button
                                type="button"
                                disabled={validated || creatingKey !== null || line.description.trim() === ""}
                                onClick={() => createArticle(line)}
                                title="Créer l'article au référentiel"
                                className="grid h-7 w-7 place-items-center rounded-md text-[var(--series-1)] hover:bg-[var(--page)] disabled:opacity-40"
                              >
                                {creatingKey === line.key ? (
                                  <Loader2 size={13} strokeWidth={2.4} className="animate-spin" aria-hidden />
                                ) : (
                                  <Plus size={14} strokeWidth={2.6} aria-hidden />
                                )}
                                <span className="sr-only">Créer l&apos;article</span>
                              </button>
                            ) : null}
                            <button
                              type="button"
                              disabled={validated}
                              onClick={() => setLines((current) => current.filter((l) => l.key !== line.key))}
                              title="Retirer la ligne"
                              className="grid h-7 w-7 place-items-center rounded-md text-[var(--text-muted)] hover:bg-[var(--page)] hover:text-[var(--critical)] disabled:opacity-40"
                            >
                              <Trash2 size={13} strokeWidth={2.2} aria-hidden />
                              <span className="sr-only">Retirer la ligne</span>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <button
              type="button"
              onClick={addManualLine}
              disabled={validated}
              className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-[var(--series-1)] hover:underline disabled:opacity-50"
            >
              <Plus size={14} strokeWidth={2.6} aria-hidden />
              Ajouter une ligne manuellement
            </button>

            {/* Totaux */}
            <div className="mt-4 grid grid-cols-2 items-stretch gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                { label: "Total HT", value: totals.gross },
                { label: "Total remise", value: totals.discount },
                { label: "HT Net", value: totals.net },
                { label: "Total TVA", value: totals.vat },
              ].map((item) => (
                <div key={item.label} className="flex flex-col justify-center">
                  <span className="text-[10px] text-[var(--text-muted)]">{item.label}</span>
                  <span className="tnum text-[14px] font-bold text-[var(--text-primary)]">
                    {formatTnd(item.value)} <span className="text-[10px] font-semibold">TND</span>
                  </span>
                </div>
              ))}
              <label className="flex flex-col justify-center">
                <span className="text-[10px] text-[var(--text-muted)]">Timbre fiscal</span>
                <span className="flex items-baseline gap-1">
                  <input
                    inputMode="decimal"
                    value={stamp}
                    onChange={(e) => setStamp(e.target.value)}
                    disabled={validated}
                    className={cn(
                      "tnum h-7 w-20 rounded-md border bg-transparent px-1.5 text-[14px] font-bold text-[var(--text-primary)] outline-none focus:border-[var(--series-1)]",
                      stampOk ? "border-[var(--border)]" : "border-[var(--critical)]"
                    )}
                  />
                  <span className="text-[10px] font-semibold text-[var(--text-primary)]">TND</span>
                </span>
              </label>
              <div
                className="flex flex-col justify-center rounded-xl px-4 py-2.5 text-white"
                style={{ background: "var(--text-primary)" }}
              >
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--surface)] opacity-80">
                  Total TTC
                </span>
                <span className="tnum text-[19px] font-extrabold leading-tight text-[var(--surface)]">
                  {formatTnd(ttc)} <span className="text-[11px] font-semibold">TND</span>
                </span>
              </div>
            </div>
          </section>

          {/* Actions */}
          <div className="card flex flex-wrap items-center gap-2 p-3">
            <Link
              href="/invoices"
              className="flex h-10 items-center gap-2 rounded-lg px-3 text-[12px] font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
            >
              <X size={14} strokeWidth={2.2} aria-hidden />
              {validated ? "Retour aux factures" : "Annuler"}
            </Link>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {validated ? (
                <Link
                  href={`/invoices/new?n=${invoiceId}`}
                  className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)]"
                >
                  <Plus size={14} strokeWidth={2.4} aria-hidden />
                  Nouvelle facture
                </Link>
              ) : (
                <button
                  type="button"
                  disabled={!canDraft}
                  onClick={() => save(true)}
                  className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)] disabled:opacity-50"
                >
                  {pending ? (
                    <Loader2 size={14} strokeWidth={2.4} className="animate-spin" aria-hidden />
                  ) : (
                    <Save size={14} strokeWidth={2.2} aria-hidden />
                  )}
                  Enregistrer brouillon
                </button>
              )}
              <button
                type="button"
                disabled={invoiceId === null}
                onClick={() => window.open(`/invoices/${invoiceId}/print`, "_blank")}
                title={invoiceId === null ? "Enregistrez d'abord la facture" : undefined}
                className="flex h-10 items-center gap-2 rounded-lg border border-[var(--border)] px-4 text-[12px] font-semibold text-[var(--text-primary)] hover:bg-[var(--page)] disabled:opacity-50"
              >
                <Printer size={14} strokeWidth={2.2} aria-hidden />
                Imprimer
              </button>
              {validated ? null : (
                <button
                  type="button"
                  disabled={!canValidate}
                  onClick={() => save(false)}
                  title={
                    canValidate
                      ? undefined
                      : "Fournisseur, n° de facture et au moins une ligne valide sont requis"
                  }
                  className="flex h-10 items-center gap-2 rounded-lg px-5 text-[12px] font-bold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                  style={{ background: "var(--serious)" }}
                >
                  <Check size={15} strokeWidth={2.8} aria-hidden />
                  Valider et enregistrer
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Colonne latérale */}
        <aside className="flex flex-col gap-3">
          <section className="card p-4">
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Aperçu de la facture importée
            </h3>
            {badge ? (
              <span
                className="mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                style={{ color: badge.color, background: `color-mix(in srgb, ${badge.color} 12%, transparent)` }}
              >
                <CircleDot size={10} strokeWidth={3} aria-hidden />
                {badge.label}
              </span>
            ) : null}

            {preview ? (
              <>
                <div className="mt-3 h-[300px] overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--page)]">
                  {preview.type === "application/pdf" ? (
                    <iframe src={`${preview.url}#toolbar=0&view=FitH`} title={preview.name} className="h-full w-full" />
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- URL locale ou signée, hors optimiseur
                    <img src={preview.url} alt={preview.name} className="h-full w-full object-contain" />
                  )}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2 text-[10px]">
                  <span className="flex min-w-0 items-center gap-1.5 text-[var(--text-secondary)]">
                    <FileText size={12} strokeWidth={2.2} className="shrink-0" aria-hidden />
                    <span className="truncate">{preview.name}</span>
                    {preview.size ? (
                      <span className="shrink-0 text-[var(--text-muted)]">{formatSize(preview.size)}</span>
                    ) : null}
                  </span>
                  <a
                    href={preview.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 font-semibold text-[var(--series-1)] hover:underline"
                  >
                    Voir en plein écran
                    <Expand size={11} strokeWidth={2.4} aria-hidden />
                  </a>
                </div>
              </>
            ) : (
              <div className="mt-3 grid h-[180px] place-items-center rounded-lg border border-dashed border-[var(--border)] text-center text-[10px] text-[var(--text-muted)]">
                <span>
                  <FileText size={22} strokeWidth={1.6} className="mx-auto mb-1.5" aria-hidden />
                  Aucun document importé
                </span>
              </div>
            )}
          </section>

          <section className="card p-4">
            <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-[var(--text-primary)]">
              Récapitulatif
            </h3>
            <div className="divide-y divide-[var(--border)]">
              <SummaryRow label="Nombre de lignes détectées" value={formatInt(lines.length)} />
              <SummaryRow label="Articles correspondants" value={formatInt(counts.matched)} color="var(--good)" />
              <SummaryRow label="Nouveaux articles" value={formatInt(counts.newProducts)} color="var(--warning)" />
              <SummaryRow
                label="Articles avec changement de prix"
                value={formatInt(counts.priceChanged.length)}
                color="var(--serious)"
              />
              <SummaryRow label="Montant HT" value={`${formatTnd(totals.net)} TND`} />
              <SummaryRow label="Montant TVA" value={`${formatTnd(totals.vat)} TND`} />
              <SummaryRow label="Montant TTC" value={`${formatTnd(ttc)} TND`} strong />
            </div>
          </section>

          {counts.priceChanged.length > 0 ? (
            <section
              className="card p-3 text-[11px]"
              style={{ background: "color-mix(in srgb, var(--serious) 8%, var(--surface))" }}
            >
              <p className="flex items-start gap-2 font-semibold" style={{ color: "var(--serious)" }}>
                <AlertTriangle size={14} strokeWidth={2.4} className="mt-0.5 shrink-0" aria-hidden />
                {formatInt(counts.priceChanged.length)} article(s) avec changement de prix détecté
              </p>
              <button
                type="button"
                onClick={() => setShowPriceDetails((v) => !v)}
                className="ml-6 mt-1 text-[10px] font-semibold text-[var(--series-1)] hover:underline"
              >
                {showPriceDetails ? "Masquer les détails" : "Voir les détails"}
              </button>
              {showPriceDetails ? (
                <ul className="ml-6 mt-2 flex flex-col gap-1.5">
                  {counts.priceChanged.map((c) => {
                    const product = productById.get(c.line.product_id as number);
                    if (!product) return null;
                    const price = parseDecimal(c.line.unit_price);
                    const up = price > product.unit_price;
                    return (
                      <li key={c.line.key} className="text-[10px]">
                        <span className="block truncate font-semibold text-[var(--text-primary)]">
                          {product.manufacturer_ref || product.reference} · {product.name}
                        </span>
                        <span className="tnum text-[var(--text-secondary)]">
                          {formatTnd(product.unit_price)} → {formatTnd(price)} TND{" "}
                          <span style={{ color: up ? "var(--critical)" : "var(--good)" }}>
                            ({up ? "+" : ""}
                            {formatTnd(price - product.unit_price)})
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : null}
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
