"use client";

import { useEffect, useState } from "react";
import { Package, X } from "lucide-react";
import {
  getScanProductInfo,
  type ScanProductInfo,
} from "@/app/(app)/inventory/actions";
import { expiryTone } from "@/components/goods/FefoBadge";
import type { InventoryLine } from "@/lib/types";
import { formatAmount, formatDate, formatInt } from "@/lib/utils";

/* Les fiches déjà chargées ne changent pas pendant un comptage : rescanner
   le même lot ne doit pas relancer une requête à chaque bip. */
const cache = new Map<number, ScanProductInfo | null>();

function daysUntil(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((Date.UTC(y, m - 1, d) - today) / 86_400_000);
}

export function ScannedProductCard({
  line,
  lines,
  counted,
  onClose,
}: {
  line: InventoryLine;
  /** Toutes les lignes du comptage, pour les autres lots du même article. */
  lines: InventoryLine[];
  /** Quantité comptée à jour, brouillons de scan compris. */
  counted: (line: InventoryLine) => number | null;
  onClose: () => void;
}) {
  const [loaded, setLoaded] = useState<{ lotId: number; info: ScanProductInfo | null } | null>(
    null
  );

  useEffect(() => {
    if (cache.has(line.lot_id)) return;
    let cancelled = false;
    getScanProductInfo(line.product_id, line.lot_id).then((info) => {
      cache.set(line.lot_id, info);
      if (!cancelled) setLoaded({ lotId: line.lot_id, info });
    });
    return () => {
      cancelled = true;
    };
  }, [line.product_id, line.lot_id]);

  const info = cache.has(line.lot_id)
    ? cache.get(line.lot_id)
    : loaded?.lotId === line.lot_id
      ? loaded.info
      : undefined;
  const loading = info === undefined;

  const count = counted(line);
  const variance = count === null ? null : count - line.expected_qty;
  const days = daysUntil(line.expiry_date);
  const siblings = lines.filter(
    (other) => other.product_id === line.product_id && other.id !== line.id
  );

  return (
    <section
      className="card p-4"
      style={{ borderColor: "var(--series-1)" }}
      aria-live="polite"
    >
      <div className="mb-3 flex items-start gap-3">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
          style={{
            color: "var(--series-1)",
            background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
          }}
        >
          <Package size={17} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[13px] font-semibold text-[var(--text-primary)]">
            {line.product_name}
          </h2>
          <p className="text-[10px] text-[var(--text-muted)]">
            {line.reference}
            {info?.manufacturer_ref ? ` · Réf. fabricant ${info.manufacturer_ref}` : ""}
            {" · "}
            {line.category}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche produit"
          className="grid h-6 w-6 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      {/* Comptage du lot scanné */}
      <div className="mb-3 grid grid-cols-3 gap-2">
        <Stat label="Attendu">{formatInt(line.expected_qty)}</Stat>
        <Stat label="Compté">{count === null ? "—" : formatInt(count)}</Stat>
        <Stat
          label="Écart"
          color={
            variance === null
              ? undefined
              : variance === 0
                ? "var(--good)"
                : variance < 0
                  ? "var(--critical)"
                  : "var(--serious)"
          }
        >
          {variance === null ? "—" : `${variance > 0 ? "+" : ""}${formatInt(variance)}`}
        </Stat>
      </div>

      <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
        <div>
          <Row label="Lot">{line.lot_number}</Row>
          <Row label="Péremption">
            <span style={{ color: expiryTone(days) }}>
              {formatDate(line.expiry_date)}{" "}
              <span className="font-normal">
                ({days < 0 ? `périmé depuis ${-days} j` : `${days} j`})
              </span>
            </span>
          </Row>
          <Row label="Emplacement">{pending(loading, info?.lot_location)}</Row>
          <Row label="Conditionnement">{pending(loading, info?.lot_packaging)}</Row>
          <Row label="Reçu le">
            {pending(loading, info ? formatDate(info.lot_received_at.slice(0, 10)) : null)}
          </Row>
        </div>
        <div>
          <Row label="Fournisseur">{pending(loading, info?.supplier)}</Row>
          <Row label="Fabricant">{pending(loading, info?.lot_manufacturer)}</Row>
          <Row label="Prix unitaire">{formatAmount(line.unit_price)} DT</Row>
          <Row label="Stock article">
            {loading ? (
              pending(true, null)
            ) : info ? (
              <span
                style={{
                  color:
                    info.stock_qty <= info.min_stock
                      ? "var(--critical)"
                      : info.stock_qty <= info.alert_stock
                        ? "var(--serious)"
                        : undefined,
                }}
              >
                {formatInt(info.stock_qty)}
                <span className="font-normal text-[var(--text-muted)]">
                  {" "}
                  (min. {formatInt(info.min_stock)})
                </span>
              </span>
            ) : (
              "—"
            )}
          </Row>
        </div>
      </div>

      {siblings.length > 0 ? (
        <div className="mt-3">
          <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Autres lots de cet article dans le comptage
          </h3>
          <ul className="space-y-1">
            {siblings.map((other) => {
              const otherCount = counted(other);
              return (
                <li
                  key={other.id}
                  className="flex items-center justify-between gap-3 rounded border border-[var(--border)] px-2 py-1 text-[10px]"
                >
                  <span className="font-medium text-[var(--text-primary)]">
                    {other.lot_number}
                  </span>
                  <span className="tnum" style={{ color: expiryTone(daysUntil(other.expiry_date)) }}>
                    {formatDate(other.expiry_date)}
                  </span>
                  <span className="tnum text-[var(--text-secondary)]">
                    {otherCount === null ? "—" : formatInt(otherCount)} /{" "}
                    {formatInt(other.expected_qty)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function pending(loading: boolean, value: string | null | undefined) {
  if (loading) return <span className="text-[var(--text-muted)]">…</span>;
  return value || <span className="text-[var(--text-muted)]">—</span>;
}

function Stat({
  label,
  color,
  children,
}: {
  label: string;
  color?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </div>
      <div
        className="tnum text-[16px] font-semibold"
        style={{ color: color ?? "var(--text-primary)" }}
      >
        {children}
      </div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[6px] text-[11px]">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="tnum min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}
