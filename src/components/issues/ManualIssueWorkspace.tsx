"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  History,
  PackageMinus,
  ScanBarcode,
  ShieldCheck,
  Sigma,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { issueStockManual } from "@/app/(app)/issues/actions";
import { Td, Th } from "@/components/DataTable";
import { beep } from "@/components/inventory/ScanBox";
import { GS, matchScan } from "@/lib/barcode-scan";
import type { IssueLot, IssueProduct, ManualIssueData } from "@/lib/types";
import { formatDate, formatDateTime, formatInt } from "@/lib/utils";

type Feedback = { message: string; ok: boolean } | null;

type CartLine = {
  key: string;
  product_id: number;
  /** null = FEFO, la base choisit les lots. */
  lot_id: number | null;
  /* Texte : un champ vidé pendant la saisie ne doit pas devenir 0. */
  quantity: string;
};

const MAX_SUGGESTIONS = 8;

function lineKey(productId: number, lotId: number | null) {
  return `${productId}:${lotId ?? "fefo"}`;
}

function qty(line: CartLine) {
  const n = Number.parseInt(line.quantity, 10);
  return Number.isInteger(n) && n > 0 ? n : 0;
}

export function ManualIssueWorkspace({ data }: { data: ManualIssueData }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [scanNote, setScanNote] = useState<Feedback>(null);
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [note, setNote] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const productById = useMemo(
    () => new Map(data.products.map((p) => [p.id, p])),
    [data.products]
  );
  const lotById = useMemo(() => new Map(data.lots.map((l) => [l.id, l])), [data.lots]);
  const lotsByProduct = useMemo(() => {
    const map = new Map<number, IssueLot[]>();
    for (const lot of data.lots) {
      map.set(lot.product_id, [...(map.get(lot.product_id) ?? []), lot]);
    }
    return map;
  }, [data.lots]);

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return data.products
      .filter((p) =>
        [p.name, p.reference, p.manufacturer_ref ?? "", p.category].some((field) =>
          field.toLowerCase().includes(needle)
        )
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [query, data.products]);

  /* Cumuls par article et par lot : deux lignes du même article puisent
     dans le même stock, le contrôle doit porter sur leur somme. */
  const check = useMemo(() => {
    const byProduct = new Map<number, number>();
    const byLot = new Map<number, number>();
    for (const line of cart) {
      byProduct.set(line.product_id, (byProduct.get(line.product_id) ?? 0) + qty(line));
      if (line.lot_id !== null)
        byLot.set(line.lot_id, (byLot.get(line.lot_id) ?? 0) + qty(line));
    }
    const short = (line: CartLine) => {
      const product = productById.get(line.product_id);
      if (!product || (byProduct.get(line.product_id) ?? 0) > product.stock_qty)
        return true;
      if (line.lot_id === null) return false;
      const lot = lotById.get(line.lot_id);
      return !lot || (byLot.get(line.lot_id) ?? 0) > lot.current_qty;
    };
    const shortKeys = new Set(cart.filter(short).map((line) => line.key));
    const totalQuantity = cart.reduce((sum, line) => sum + qty(line), 0);
    return {
      shortKeys,
      totalQuantity,
      references: new Set(cart.filter((l) => qty(l) > 0).map((l) => l.product_id)).size,
      ready: cart.length > 0 && totalQuantity > 0 && shortKeys.size === 0,
    };
  }, [cart, productById, lotById]);

  function addLine(productId: number, lotId: number | null, amount = 1) {
    const key = lineKey(productId, lotId);
    setCart((current) => {
      const existing = current.find((line) => line.key === key);
      if (existing) {
        return current.map((line) =>
          line.key === key ? { ...line, quantity: String(qty(line) + amount) } : line
        );
      }
      return [...current, { key, product_id: productId, lot_id: lotId, quantity: String(amount) }];
    });
    setFeedback(null);
  }

  function pickProduct(product: IssueProduct) {
    addLine(product.id, null);
    setQuery("");
    setScanNote({ ok: true, message: `${product.name} ajouté (lot FEFO).` });
    inputRef.current?.focus();
  }

  /** Entrée : d'abord une étiquette scannée, sinon une recherche. */
  function submitQuery() {
    const code = query;
    if (!code.trim()) return;

    const match = matchScan(code, data.lots);
    if (match.kind !== "none") {
      const lot = match.kind === "lot" ? match.line : null;
      const productId =
        match.kind === "lot" ? match.line.product_id : match.lines[0].product_id;
      const product = productById.get(productId);
      addLine(productId, lot?.id ?? null);
      setQuery("");
      setScanNote({
        ok: true,
        message: lot
          ? `${product?.name ?? "Article"} · lot ${lot.lot_number} : +1`
          : `${product?.name ?? "Article"} : +1 (lot FEFO)`,
      });
      beep(true);
      return;
    }

    // Référence article ou fabricant scannée nue, sans lot en stock valide.
    const plain = code.trim().toUpperCase();
    const byRef = data.products.find(
      (p) => p.reference.toUpperCase() === plain || p.manufacturer_ref?.toUpperCase() === plain
    );
    if (byRef) {
      pickProduct(byRef);
      beep(true);
      return;
    }

    if (suggestions.length === 1) {
      pickProduct(suggestions[0]);
      return;
    }

    setScanNote({
      ok: false,
      message:
        suggestions.length > 1
          ? "Plusieurs articles correspondent : choisissez dans la liste."
          : `Aucun article ni lot en stock pour « ${code.trim()} ».`,
    });
    if (suggestions.length === 0) beep(false);
  }

  function updateLine(key: string, patch: Partial<CartLine>) {
    setCart((current) => {
      const updated = current.map((line) => {
        if (line.key !== key) return line;
        const next = { ...line, ...patch };
        return { ...next, key: lineKey(next.product_id, next.lot_id) };
      });
      /* Changer le lot peut rejoindre une ligne existante : on fusionne
         plutôt que d'afficher deux fois le même couple article/lot. */
      const merged = new Map<string, CartLine>();
      for (const line of updated) {
        const existing = merged.get(line.key);
        merged.set(
          line.key,
          existing ? { ...existing, quantity: String(qty(existing) + qty(line)) } : line
        );
      }
      return [...merged.values()];
    });
  }

  function handleIssue() {
    setFeedback(null);
    start(async () => {
      const result = await issueStockManual(
        cart.map((line) => ({
          product_id: line.product_id,
          lot_id: line.lot_id,
          quantity: qty(line),
        })),
        note
      );
      setFeedback({ message: result.message, ok: result.status === "success" });
      if (result.status === "success") {
        setCart([]);
        setNote("");
        setScanNote(null);
        router.refresh();
      }
    });
  }

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3">
        {/* 1. Saisie */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            1. Ajouter des articles
          </h2>

          <div className="relative">
            <ScanBarcode
              size={16}
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--series-1)]"
              aria-hidden
            />
            <input
              ref={inputRef}
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setScanNote(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  submitQuery();
                } else if (event.ctrlKey && event.key === "]") {
                  // Séparateur FNC1 d'une douchette en émulation clavier.
                  event.preventDefault();
                  setQuery((current) => current + GS);
                }
              }}
              autoComplete="off"
              spellCheck={false}
              placeholder="Scannez une étiquette à la douchette, ou tapez une désignation / référence…"
              aria-label="Scanner ou rechercher un article"
              className="h-11 w-full rounded-lg border-2 border-[var(--border)] bg-[var(--surface)] pl-10 pr-3 text-[13px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
            />
          </div>

          {suggestions.length > 0 ? (
            <ul className="mt-2 overflow-hidden rounded-lg border border-[var(--border)]">
              {suggestions.map((product) => {
                const lots = lotsByProduct.get(product.id) ?? [];
                return (
                  <li key={product.id}>
                    <button
                      type="button"
                      onClick={() => pickProduct(product)}
                      className="flex w-full items-center gap-3 border-b border-[var(--border)] px-3 py-2 text-left text-[11px] transition-colors last:border-0 hover:bg-[var(--page)]"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-[var(--text-primary)]">
                          {product.name}
                        </span>
                        <span className="text-[9px] text-[var(--text-muted)]">
                          {product.reference}
                          {product.manufacturer_ref ? ` · ${product.manufacturer_ref}` : ""} ·{" "}
                          {product.category}
                        </span>
                      </span>
                      <span className="tnum shrink-0 text-[10px] text-[var(--text-secondary)]">
                        {formatInt(product.stock_qty)} en stock · {lots.length} lot
                        {lots.length > 1 ? "s" : ""}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : null}

          {scanNote ? (
            <p
              role="status"
              className="mt-2 flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{
                color: scanNote.ok ? "var(--good)" : "var(--critical)",
                background: `color-mix(in srgb, ${
                  scanNote.ok ? "var(--good)" : "var(--critical)"
                } 10%, transparent)`,
              }}
            >
              {scanNote.ok ? (
                <CheckCircle2 size={13} strokeWidth={2.4} aria-hidden />
              ) : (
                <TriangleAlert size={13} strokeWidth={2.4} aria-hidden />
              )}
              {scanNote.message}
            </p>
          ) : (
            <p className="mt-2 text-[10px] text-[var(--text-muted)]">
              Une étiquette de lot scannée ajoute une unité de ce lot. Un article
              choisi dans la recherche sort selon le FEFO (lot le plus proche de
              sa péremption d&apos;abord).
            </p>
          )}
        </section>

        {/* 2. Panier */}
        <section className="card p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
              2. Articles à sortir
            </h2>
            {cart.length > 0 ? (
              <button
                type="button"
                onClick={() => setCart([])}
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[10px] font-medium text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--critical)]"
              >
                <Trash2 size={12} aria-hidden />
                Vider la liste
              </button>
            ) : null}
          </div>

          {cart.length === 0 ? (
            <p className="py-8 text-center text-[11px] text-[var(--text-muted)]">
              Aucun article : scannez une étiquette ou recherchez un article
              ci-dessus.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[11px]">
                <thead>
                  <tr>
                    <Th align="right">#</Th>
                    <Th>Article</Th>
                    <Th>Lot</Th>
                    <Th align="right">Disponible</Th>
                    <Th align="right">Quantité</Th>
                    <Th>Statut</Th>
                    <Th align="center">
                      <span className="sr-only">Retirer</span>
                    </Th>
                  </tr>
                </thead>
                <tbody>
                  {cart.map((line, index) => {
                    const product = productById.get(line.product_id);
                    const lots = lotsByProduct.get(line.product_id) ?? [];
                    const lot = line.lot_id === null ? null : lotById.get(line.lot_id);
                    const available = lot ? lot.current_qty : (product?.stock_qty ?? 0);
                    const short = check.shortKeys.has(line.key);

                    return (
                      <tr key={line.key}>
                        <Td align="right" className="text-[var(--text-muted)]">
                          {index + 1}
                        </Td>
                        <Td>
                          <span className="block max-w-[240px] truncate font-medium">
                            {product?.name ?? "Article indisponible"}
                          </span>
                          <span className="text-[9px] text-[var(--text-muted)]">
                            {product?.reference} · {product?.category}
                          </span>
                        </Td>
                        <Td>
                          <select
                            value={line.lot_id ?? ""}
                            onChange={(event) =>
                              updateLine(line.key, {
                                lot_id: event.target.value === "" ? null : Number(event.target.value),
                              })
                            }
                            aria-label={`Lot pour ${product?.name ?? "l'article"}`}
                            className="max-w-[260px] rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px] outline-none focus:border-[var(--series-1)]"
                          >
                            <option value="">Automatique (FEFO)</option>
                            {lots.map((option) => (
                              <option key={option.id} value={option.id}>
                                {option.lot_number} — exp. {formatDate(option.expiry_date)} —{" "}
                                {formatInt(option.current_qty)} u.
                              </option>
                            ))}
                          </select>
                        </Td>
                        <Td align="right">{formatInt(available)}</Td>
                        <Td align="right">
                          <input
                            type="number"
                            min={1}
                            step={1}
                            value={line.quantity}
                            onChange={(event) =>
                              updateLine(line.key, { quantity: event.target.value })
                            }
                            aria-label={`Quantité pour ${product?.name ?? "l'article"}`}
                            className="tnum w-[72px] rounded border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-right text-[11px] outline-none focus:border-[var(--series-1)]"
                          />
                        </Td>
                        <Td>
                          {short ? (
                            <span
                              className="inline-flex items-center gap-1 whitespace-nowrap font-semibold"
                              style={{ color: "var(--critical)" }}
                            >
                              <TriangleAlert size={11} strokeWidth={2.6} aria-hidden />
                              Insuffisant
                            </span>
                          ) : qty(line) === 0 ? (
                            <span className="text-[var(--text-muted)]">Quantité ?</span>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 whitespace-nowrap font-semibold"
                              style={{ color: "var(--good)" }}
                            >
                              <CheckCircle2 size={11} strokeWidth={2.6} aria-hidden />
                              OK
                            </span>
                          )}
                        </Td>
                        <Td align="center">
                          <button
                            type="button"
                            onClick={() =>
                              setCart((current) => current.filter((l) => l.key !== line.key))
                            }
                            aria-label={`Retirer ${product?.name ?? "l'article"}`}
                            className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--critical)]"
                          >
                            <Trash2 size={12} aria-hidden />
                          </button>
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 3. Validation */}
        <section className="card p-4">
          <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            3. Validation
          </h2>

          <label className="mb-3 block">
            <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
              Motif / destination (facultatif)
            </span>
            <input
              value={note}
              onChange={(event) => setNote(event.target.value)}
              maxLength={200}
              placeholder="Ex. paillasse immunologie, contrôle qualité, casse…"
              className="h-9 w-full rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 text-[12px] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]"
            />
          </label>

          {feedback ? (
            <p
              role="status"
              className="mb-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
              style={{
                color: feedback.ok ? "var(--good)" : "var(--critical)",
                background: `color-mix(in srgb, ${
                  feedback.ok ? "var(--good)" : "var(--critical)"
                } 10%, transparent)`,
              }}
            >
              {feedback.ok ? (
                <CheckCircle2 size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
              ) : (
                <TriangleAlert size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
              )}
              {feedback.message}
            </p>
          ) : null}

          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleIssue}
              disabled={pending || !check.ready}
              title={
                check.ready
                  ? undefined
                  : cart.length === 0
                    ? "Ajoutez au moins un article."
                    : "Corrigez les quantités insuffisantes ou vides."
              }
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-[11px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "var(--series-1)" }}
            >
              <ShieldCheck size={13} aria-hidden />
              {pending
                ? "Déduction…"
                : `Valider et déduire ${formatInt(check.totalQuantity)} unité${
                    check.totalQuantity > 1 ? "s" : ""
                  }`}
            </button>
          </div>
        </section>
      </div>

      {/* Colonne latérale */}
      <div className="flex flex-col gap-3">
        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <Sigma size={13} aria-hidden />
            Résumé de la sortie
          </h2>
          <Row label="Mode">Manuel</Row>
          <Row label="Lignes">{formatInt(cart.length)}</Row>
          <Row label="Références">{formatInt(check.references)}</Row>
          <Row label="Quantité à déduire">{formatInt(check.totalQuantity)}</Row>
          <Row label="Statut">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
              style={{
                color: check.ready ? "var(--good)" : "var(--text-muted)",
                background: `color-mix(in srgb, ${
                  check.ready ? "var(--good)" : "var(--text-muted)"
                } 12%, transparent)`,
              }}
            >
              {cart.length === 0
                ? "Liste vide"
                : check.shortKeys.size > 0
                  ? "Stock insuffisant"
                  : check.ready
                    ? "Prêt à déduire"
                    : "Quantités à compléter"}
            </span>
          </Row>
          <p className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
            <PackageMinus
              size={12}
              strokeWidth={2.2}
              className="mt-px shrink-0"
              style={{ color: "var(--series-1)" }}
              aria-hidden
            />
            La déduction est écrite en une seule transaction, à votre nom : si
            un article manque, aucun stock n&apos;est modifié.
          </p>
        </aside>

        <aside className="card p-4">
          <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            <History size={13} aria-hidden />
            Dernières sorties
          </h2>
          {data.history.length === 0 ? (
            <p className="py-3 text-center text-[10px] text-[var(--text-muted)]">
              Aucune sortie enregistrée.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {data.history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1.5 text-[10px] last:border-0 last:pb-0"
                >
                  <span className="min-w-0">
                    <span className="tnum block text-[var(--text-secondary)]">
                      {formatDateTime(entry.issued_at)}
                    </span>
                    <span className="block truncate text-[var(--text-muted)]">
                      {entry.operator}
                    </span>
                  </span>
                  <span className="tnum shrink-0 text-right font-medium text-[var(--text-primary)]">
                    {formatInt(entry.total_references)} réf. ·{" "}
                    {formatInt(entry.total_quantity)} u.
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link
            href="/issues/history"
            className="mt-3 flex items-center justify-center gap-1.5 rounded-lg border border-[var(--border)] px-2 py-2 text-[10px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
          >
            <History size={12} aria-hidden />
            Voir tout l&apos;historique
          </Link>
        </aside>
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[7px] text-[11px] last:border-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="tnum min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}
