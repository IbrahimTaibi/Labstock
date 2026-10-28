"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { INVOICE_BUCKET } from "@/lib/invoices";
import { createClient } from "@/lib/supabase/server";
import { nextArticleReference } from "@/lib/utils";
import type { InvoiceEntryLine, InvoiceEntryProduct } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const OCR_MODEL = "claude-sonnet-5-5";

function checkFile(file: unknown): file is File {
  return file instanceof File && file.size > 0;
}

function fileError(file: File) {
  if (!ACCEPTED_TYPES.includes(file.type))
    return "Format non pris en charge : PDF, JPG ou PNG uniquement.";
  if (file.size > MAX_FILE_SIZE) return "Fichier trop volumineux (10 Mo maximum).";
  return null;
}

/* ------------------------------------------------------------- Lecture OCR */

export type ExtractedInvoice = {
  supplier_name: string | null;
  invoice_number: string | null;
  invoice_date: string | null;
  order_reference: string | null;
  payment_terms_days: number | null;
  stamp_duty: number | null;
  /** Fiabilité estimée de la lecture, 0–100. */
  confidence: number | null;
  lines: {
    reference: string | null;
    designation: string;
    quantity: number;
    unit_price: number;
    discount_pct: number;
    vat_rate: number;
  }[];
};

export type ExtractState =
  | { status: "success"; invoice: ExtractedInvoice }
  | { status: "error"; message: string };

const EXTRACTION_PROMPT = `Tu lis une facture fournisseur tunisienne (laboratoire d'analyses médicales).
Renvoie UNIQUEMENT un objet JSON, sans texte autour, de la forme :
{
  "supplier_name": string | null,      // raison sociale du fournisseur émetteur
  "invoice_number": string | null,     // numéro de la facture
  "invoice_date": "AAAA-MM-JJ" | null,
  "order_reference": string | null,    // n° de bon de commande cité, s'il existe
  "payment_terms_days": number | null, // ex. « à 30 jours » → 30, « comptant » → 0
  "stamp_duty": number | null,         // timbre fiscal en TND
  "confidence": number,                // ta fiabilité globale de lecture, 0 à 100
  "lines": [{
    "reference": string | null,        // référence article / catalogue imprimée
    "designation": string,
    "quantity": number,                // entier
    "unit_price": number,              // prix unitaire HT en TND
    "discount_pct": number,            // remise en %, 0 si aucune
    "vat_rate": number                 // taux de TVA en % (0, 7, 13 ou 19)
  }]
}
Les montants utilisent le point décimal (1 234,500 → 1234.5). N'invente rien :
une valeur illisible vaut null (ou 0 pour une remise absente).`;

function toNumber(value: unknown, fallback = 0) {
  const n = typeof value === "number" ? value : Number.parseFloat(String(value));
  return Number.isFinite(n) ? n : fallback;
}

function toText(value: unknown) {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

/**
 * Lecture automatique d'une facture (PDF ou image) par le modèle Claude.
 * Nécessite ANTHROPIC_API_KEY côté serveur ; sans clé, la saisie reste
 * possible à la main.
 */
export async function extractInvoice(formData: FormData): Promise<ExtractState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const file = formData.get("file");
  if (!checkFile(file)) return { status: "error", message: "Aucun fichier reçu." };
  const invalid = fileError(file);
  if (invalid) return { status: "error", message: invalid };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey)
    return {
      status: "error",
      message:
        "Lecture automatique non configurée (ANTHROPIC_API_KEY absente). Saisissez les lignes manuellement.",
    };

  const data = Buffer.from(await file.arrayBuffer()).toString("base64");
  const source =
    file.type === "application/pdf"
      ? { type: "document", source: { type: "base64", media_type: file.type, data } }
      : { type: "image", source: { type: "base64", media_type: file.type, data } };

  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: OCR_MODEL,
        max_tokens: 8000,
        messages: [
          { role: "user", content: [source, { type: "text", text: EXTRACTION_PROMPT }] },
        ],
      }),
    });
  } catch {
    return { status: "error", message: "Service de lecture injoignable. Réessayez." };
  }

  if (!response.ok)
    return {
      status: "error",
      message: `La lecture automatique a échoué (${response.status}).`,
    };

  const body = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = body.content?.find((block) => block.type === "text")?.text ?? "";
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start)
    return { status: "error", message: "Aucune donnée exploitable n'a été lue sur ce document." };

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    return { status: "error", message: "La lecture a renvoyé un résultat illisible. Réessayez." };
  }

  const date = toText(raw.invoice_date);
  const lines = Array.isArray(raw.lines) ? (raw.lines as Record<string, unknown>[]) : [];

  return {
    status: "success",
    invoice: {
      supplier_name: toText(raw.supplier_name),
      invoice_number: toText(raw.invoice_number),
      invoice_date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null,
      order_reference: toText(raw.order_reference),
      payment_terms_days:
        raw.payment_terms_days === null || raw.payment_terms_days === undefined
          ? null
          : Math.max(0, Math.round(toNumber(raw.payment_terms_days))),
      stamp_duty:
        raw.stamp_duty === null || raw.stamp_duty === undefined
          ? null
          : Math.max(0, toNumber(raw.stamp_duty)),
      confidence:
        raw.confidence === null || raw.confidence === undefined
          ? null
          : Math.min(100, Math.max(0, Math.round(toNumber(raw.confidence)))),
      lines: lines
        .map((line) => ({
          reference: toText(line.reference),
          designation: toText(line.designation) ?? "",
          quantity: Math.max(1, Math.round(toNumber(line.quantity, 1))),
          unit_price: Math.max(0, toNumber(line.unit_price)),
          discount_pct: Math.min(100, Math.max(0, toNumber(line.discount_pct))),
          vat_rate: Math.max(0, toNumber(line.vat_rate)),
        }))
        .filter((line) => line.designation !== "" || line.reference !== null),
    },
  };
}

/* ------------------------------------------------------------ Enregistrement */

export type InvoiceHeaderInput = {
  supplier_id: number;
  supplier_number: string;
  issue_date: string;
  order_id: number | null;
  payment_terms_days: number | null;
  stamp_duty: number;
  ocr_confidence: number | null;
};

export type SaveInvoiceState =
  | { status: "success"; message: string; invoice_id: number; number: string; draft: boolean }
  | { status: "error"; message: string };

/**
 * Enregistre la facture (brouillon ou validée) et, s'il est fourni, le
 * document importé. FormData : `payload` (JSON) + `file` (facultatif).
 */
export async function saveSupplierInvoice(formData: FormData): Promise<SaveInvoiceState> {
  const user = await getCurrentUser();
  if (!user || user.labId === null)
    return { status: "error", message: "Session expirée. Reconnectez-vous." };

  let payload: {
    invoice_id: number | null;
    draft: boolean;
    header: InvoiceHeaderInput;
    lines: InvoiceEntryLine[];
  };
  try {
    payload = JSON.parse(String(formData.get("payload")));
  } catch {
    return { status: "error", message: "Données de facture invalides." };
  }

  const { header, lines, draft } = payload;
  if (!Number.isInteger(header.supplier_id))
    return { status: "error", message: "Sélectionnez le fournisseur." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(header.issue_date))
    return { status: "error", message: "Date de facture invalide." };
  if (!draft) {
    if (!header.supplier_number.trim())
      return { status: "error", message: "Le numéro de facture est obligatoire." };
    if (lines.length === 0)
      return { status: "error", message: "Ajoutez au moins une ligne à la facture." };
  }
  for (const line of lines) {
    if (!Number.isInteger(line.quantity) || line.quantity <= 0)
      return { status: "error", message: "Chaque ligne doit avoir une quantité entière positive." };
    if (!Number.isFinite(line.unit_price) || line.unit_price < 0)
      return { status: "error", message: "Chaque ligne doit avoir un prix unitaire valide." };
    if (line.product_id === null && !line.description.trim())
      return { status: "error", message: "Une ligne sans article doit avoir une désignation." };
  }

  const supabase = await createClient();

  let document: { path: string; name: string; size: number } | null = null;
  const file = formData.get("file");
  if (checkFile(file)) {
    const invalid = fileError(file);
    if (invalid) return { status: "error", message: invalid };
    const safeName = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_");
    const path = `${user.labId}/${Date.now()}-${safeName}`;
    const upload = await supabase.storage
      .from(INVOICE_BUCKET)
      .upload(path, file, { contentType: file.type });
    if (upload.error)
      return { status: "error", message: `Envoi du document : ${upload.error.message}` };
    document = { path, name: file.name, size: file.size };
  }

  const { data, error } = await supabase.rpc("save_supplier_invoice", {
    p_invoice_id: payload.invoice_id,
    p_header: {
      ...header,
      supplier_number: header.supplier_number.trim(),
      document_path: document?.path ?? null,
      document_name: document?.name ?? null,
      document_size: document?.size ?? null,
    },
    p_lines: lines,
    p_draft: draft,
  });

  if (error) {
    if (document) await supabase.storage.from(INVOICE_BUCKET).remove([document.path]);
    if (error.code === "23505")
      return {
        status: "error",
        message: "Cette facture fournisseur est déjà enregistrée pour ce fournisseur.",
      };
    return { status: "error", message: error.message };
  }

  revalidatePath("/invoices");
  revalidatePath("/suppliers");
  revalidatePath("/debts");
  revalidatePath("/");

  const result = data as { invoice_id: number; number: string; lines: number };
  return {
    status: "success",
    invoice_id: result.invoice_id,
    number: result.number,
    draft,
    message: draft
      ? `Brouillon ${result.number} enregistré (${result.lines} ligne(s)).`
      : `Facture ${result.number} validée et enregistrée (${result.lines} ligne(s)).`,
  };
}

/* ----------------------------------------------- Nouvel article depuis ligne */

export type CreateArticleState =
  | { status: "success"; message: string; product: InvoiceEntryProduct }
  | { status: "error"; message: string };

/**
 * Crée au référentiel l'article d'une ligne « Nouvel article ». La catégorie
 * est celle qui domine chez ce fournisseur ; elle se corrige ensuite dans
 * Gestion des produits.
 */
export async function createArticleFromLine(input: {
  name: string;
  manufacturer_ref: string | null;
  supplier_id: number;
  unit_price: number;
  vat_rate: number;
}): Promise<CreateArticleState> {
  const user = await getCurrentUser();
  if (!user) return { status: "error", message: "Session expirée. Reconnectez-vous." };

  const name = input.name.trim();
  if (!name) return { status: "error", message: "La désignation est requise." };
  if (!Number.isInteger(input.supplier_id))
    return { status: "error", message: "Sélectionnez d'abord le fournisseur." };

  const supabase = await createClient();

  const [productsRes, categoriesRes] = await Promise.all([
    supabase.from("products").select("reference, supplier_id, category_id"),
    supabase.from("categories").select("id").order("name").limit(1),
  ]);
  if (productsRes.error) return { status: "error", message: productsRes.error.message };

  const tally = new Map<number, number>();
  for (const p of productsRes.data ?? []) {
    if (p.supplier_id === input.supplier_id && p.category_id !== null)
      tally.set(p.category_id, (tally.get(p.category_id) ?? 0) + 1);
  }
  const categoryId =
    [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    categoriesRes.data?.[0]?.id ??
    null;
  if (categoryId === null)
    return { status: "error", message: "Créez d'abord une catégorie d'articles." };

  const references = (productsRes.data ?? []).map((p) => p.reference);
  for (let attempt = 0; attempt < 3; attempt++) {
    const reference = nextArticleReference(references);
    const { data, error } = await supabase
      .from("products")
      .insert({
        name,
        reference,
        manufacturer_ref: input.manufacturer_ref?.trim() || null,
        supplier_id: input.supplier_id,
        category_id: categoryId,
        unit_price: Math.max(0, input.unit_price),
        vat_rate: input.vat_rate,
      })
      .select(
        "id, reference, manufacturer_ref, name, supplier_id, category_id, unit_price, vat_rate"
      )
      .single();

    if (error?.code === "23505") {
      references.push(reference);
      continue;
    }
    if (error) return { status: "error", message: error.message };

    revalidatePath("/products");
    return {
      status: "success",
      message: `Article ${reference} créé au référentiel.`,
      product: {
        ...data,
        unit_price: Number(data.unit_price),
        vat_rate: Number(data.vat_rate),
      },
    };
  }
  return { status: "error", message: "Référence article indisponible, réessayez." };
}
