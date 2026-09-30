"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  FlaskConical,
  LineChart,
  Loader2,
  Pencil,
  Printer,
  ShoppingCart,
  X,
} from "lucide-react";
import { loadArticleDetail } from "@/app/(app)/analytics/actions";
import { rotationBand, STATUS_META } from "@/lib/analytics-summary";
import type { AnalyticsRow, ArticleDetail } from "@/lib/types";
import { formatAmount, formatDate, formatInt } from "@/lib/utils";

type Tab = "summary" | "lots" | "movements" | "charts";

const TABS: { id: Tab; label: string }[] = [
  { id: "summary", label: "Résumé" },
  { id: "lots", label: "Lots & péremption" },
  { id: "movements", label: "Mouvements" },
  { id: "charts", label: "Graphiques" },
];

const decimal = (value: number, digits = 2) =>
  value.toFixed(digits).replace(".", ",");

export function ArticlePanel({
  row,
  onClose,
}: {
  row: AnalyticsRow;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>("summary");
  const [detail, setDetail] = useState<ArticleDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  /* Les lots et mouvements ne sont chargés qu'à l'ouverture de la fiche :
     les embarquer pour chaque article du tableau alourdirait le rendu de la
     page pour des données que l'on ne regarde qu'un article à la fois.

     Le parent remonte ce composant à chaque changement d'article (via
     `key`), ce qui remet l'état à zéro sans avoir à le réinitialiser ici. */
  useEffect(() => {
    start(async () => {
      const result = await loadArticleDetail(row.product_id);
      if (result.status === "success") setDetail(result.detail);
      else setError(result.message);
    });
  }, [row.product_id]);

  const meta = STATUS_META[row.status];
  const band = rotationBand(row.rotation);

  return (
    <aside className="card flex flex-col p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
            Fiche article
          </h2>
          <p className="mt-0.5 truncate text-[13px] font-semibold text-[var(--text-primary)]">
            {row.product_name}
          </p>
          <span
            className="mt-0.5 inline-block rounded px-1.5 py-0.5 text-[9px] font-semibold"
            style={{
              color: "var(--series-1)",
              background: "color-mix(in srgb, var(--series-1) 12%, transparent)",
            }}
          >
            {row.reference}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer la fiche"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--text-muted)] transition-colors hover:bg-[var(--page)]"
        >
          <X size={14} aria-hidden />
        </button>
      </div>

      <div className="mb-3 flex gap-1 border-b border-[var(--border)]">
        {TABS.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setTab(entry.id)}
            aria-current={tab === entry.id ? "page" : undefined}
            className="-mb-px border-b-2 px-1.5 pb-1.5 text-[10px] font-medium transition-colors"
            style={
              tab === entry.id
                ? { borderColor: "var(--series-1)", color: "var(--series-1)" }
                : { borderColor: "transparent", color: "var(--text-muted)" }
            }
          >
            {entry.label}
          </button>
        ))}
      </div>

      {tab === "summary" ? (
        <div>
          <Section title="Informations générales" />
          <Row label="Catégorie">
            <span className="inline-flex items-center gap-1">
              <FlaskConical size={11} aria-hidden />
              {row.category}
            </span>
          </Row>
          <Row label="Fournisseur">{row.supplier}</Row>
          <Row label="Conditionnement">{row.packaging ?? "—"}</Row>
          <Row label="CUMP">{decimal(row.cump, 3)} DT</Row>
          <Row label="Valeur du stock">{formatAmount(row.stock_value)} DT</Row>
          <Row label="Statut">
            <span
              className="rounded px-1.5 py-0.5 text-[9px] font-bold"
              style={{
                color: meta.color,
                background: `color-mix(in srgb, ${meta.color} 14%, transparent)`,
              }}
            >
              {meta.label}
            </span>
          </Row>

          <Section title="Analyse du stock" />
          <Row label="Stock initial">{formatInt(row.stock_initial)}</Row>
          <Row label="Entrées">{formatInt(row.entries)}</Row>
          <Row label="Sorties">{formatInt(row.exits)}</Row>
          <Row label="Stock final">{formatInt(row.stock_final)}</Row>
          <Row label="Stock moyen">{decimal(row.stock_average, 1)}</Row>
          <Row label="CMJ 30 jours">{decimal(row.cmj_short, 3)}</Row>
          <Row label="CMJ 90 jours">{decimal(row.cmj_long, 3)}</Row>
          <Row label="Taux de couverture">
            {row.coverage_days === null
              ? "Indéfini"
              : `${decimal(row.coverage_days, 0)} jours`}
          </Row>

          <div
            className="mt-2 rounded-lg px-2.5 py-2"
            style={{ background: `color-mix(in srgb, ${band.color} 10%, transparent)` }}
          >
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-[var(--text-muted)]">Rotation</span>
              <span
                className="tnum ml-auto text-[14px] font-bold"
                style={{ color: band.color }}
              >
                {row.rotation === null ? "—" : decimal(row.rotation, 2)}
              </span>
            </div>
            <div className="text-[9px] font-semibold" style={{ color: band.color }}>
              {band.label}
            </div>
            <div className="text-[9px] leading-relaxed text-[var(--text-secondary)]">
              {band.hint}
            </div>
          </div>

          <Section title="Paramètres de gestion" />
          <Row label="Stock de sécurité (SDS)">{formatInt(row.safety_stock)}</Row>
          <Row label="Stock d'alerte (SDA)">{formatInt(row.alert_stock)}</Row>
          <Row label="Stock minimum">{formatInt(row.min_stock)}</Row>
          <Row label="Stock maximum">{formatInt(row.max_stock)}</Row>
          <Row label="Quantité à commander">
            {row.order_quantity > 0 ? formatInt(row.order_quantity) : "—"}
          </Row>
          <Row label="Valeur de la commande">
            {row.order_value > 0 ? `${formatAmount(row.order_value)} DT` : "—"}
          </Row>
          <Row label="Valeur seuil min.">
            {formatAmount(row.min_stock * row.cump)} DT
          </Row>
          <Row label="Valeur seuil max.">
            {formatAmount(row.max_stock * row.cump)} DT
          </Row>
        </div>
      ) : null}

      {tab === "lots" ? (
        <Loading pending={pending} error={error} empty={detail?.lots.length === 0}>
          <table className="w-full border-collapse text-[10px]">
            <thead>
              <tr>
                <Th>Lot</Th>
                <Th>Péremption</Th>
                <Th align="right">Qté</Th>
                <Th>Empl.</Th>
              </tr>
            </thead>
            <tbody>
              {detail?.lots.map((lot) => (
                <tr key={lot.id}>
                  <Cell>{lot.lot_number}</Cell>
                  <Cell>
                    <span
                      style={{
                        color: lot.is_expired ? "var(--critical)" : undefined,
                      }}
                    >
                      {formatDate(lot.expiry_date)}
                    </span>
                  </Cell>
                  <Cell align="right">{formatInt(lot.current_qty)}</Cell>
                  <Cell>{lot.location ?? "—"}</Cell>
                </tr>
              ))}
            </tbody>
          </table>
        </Loading>
      ) : null}

      {tab === "movements" ? (
        <Loading
          pending={pending}
          error={error}
          empty={detail?.movements.length === 0}
        >
          <ul className="space-y-1.5">
            {detail?.movements.map((movement) => {
              const isIn = movement.type === "in";
              const color = isIn ? "var(--good)" : "var(--serious)";
              return (
                <li
                  key={movement.id}
                  className="flex items-center gap-2 border-b border-[var(--border)] pb-1.5 text-[10px] last:border-0"
                >
                  {isIn ? (
                    <ArrowUpRight size={12} style={{ color }} aria-hidden />
                  ) : (
                    <ArrowDownRight size={12} style={{ color }} aria-hidden />
                  )}
                  <span className="text-[var(--text-secondary)]">
                    {isIn ? "Entrée" : "Sortie"}
                  </span>
                  <span className="tnum ml-auto font-medium" style={{ color }}>
                    {isIn ? "+" : "−"}
                    {formatInt(movement.quantity)}
                  </span>
                  <span className="tnum w-[72px] shrink-0 text-right text-[var(--text-muted)]">
                    {formatDate(movement.moved_at)}
                  </span>
                </li>
              );
            })}
          </ul>
        </Loading>
      ) : null}

      {tab === "charts" ? (
        <div className="space-y-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          <Bar label="Stock final" value={row.stock_final} max={row.max_stock} color="var(--series-1)" />
          <Bar label="Stock d'alerte" value={row.alert_stock} max={row.max_stock} color="var(--serious)" />
          <Bar label="Stock de sécurité" value={row.safety_stock} max={row.max_stock} color="var(--critical)" />
          <Bar label="Stock maximum" value={row.max_stock} max={row.max_stock} color="var(--text-muted)" />
          <p className="pt-2 text-[9px] text-[var(--text-muted)]">
            Position du stock actuel entre ses seuils. L&apos;historique de
            consommation par article demande une série temporelle par produit,
            qui n&apos;est pas encore calculée côté base.
          </p>
        </div>
      ) : null}

      {/* §8.7 — actions rapides */}
      <div className="mt-4 grid grid-cols-3 gap-1.5 border-t border-[var(--border)] pt-3">
        <Action href="/products" icon={<Pencil size={12} aria-hidden />} label="Modifier" />
        <Action
          href={`/analytics/print?ref=${encodeURIComponent(row.reference)}`}
          icon={<Printer size={12} aria-hidden />}
          label="Imprimer"
          external
        />
        <Action
          onClick={() => setTab("lots")}
          icon={<Boxes size={12} aria-hidden />}
          label="Voir lots"
        />
        <Action
          onClick={() => setTab("charts")}
          icon={<LineChart size={12} aria-hidden />}
          label="Conso."
        />
        <Action
          href="/receipts"
          icon={<ShoppingCart size={12} aria-hidden />}
          label="Demande"
        />
      </div>
    </aside>
  );
}

function Loading({
  pending,
  error,
  empty,
  children,
}: {
  pending: boolean;
  error: string | null;
  empty?: boolean;
  children: React.ReactNode;
}) {
  if (pending) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-[10px] text-[var(--text-muted)]">
        <Loader2 size={13} className="animate-spin" aria-hidden />
        Chargement…
      </p>
    );
  }
  if (error) {
    return (
      <p className="py-6 text-center text-[10px]" style={{ color: "var(--critical)" }}>
        {error}
      </p>
    );
  }
  if (empty) {
    return (
      <p className="py-6 text-center text-[10px] text-[var(--text-muted)]">
        Aucune donnée pour cet article.
      </p>
    );
  }
  return <>{children}</>;
}

function Bar({
  label,
  value,
  max,
  color,
}: {
  label: string;
  value: number;
  max: number;
  color: string;
}) {
  const share = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-[9px]">
        <span className="text-[var(--text-muted)]">{label}</span>
        <span className="tnum font-medium text-[var(--text-primary)]">
          {formatInt(value)}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-[var(--page)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${share}%`, background: color }}
        />
      </div>
    </div>
  );
}

function Action({
  href,
  onClick,
  icon,
  label,
  external,
}: {
  href?: string;
  onClick?: () => void;
  icon: React.ReactNode;
  label: string;
  external?: boolean;
}) {
  const className =
    "flex flex-col items-center gap-1 rounded-lg border border-[var(--border)] px-1 py-2 text-[9px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]";

  if (href && external) {
    return (
      <a href={href} target="_blank" rel="noopener" className={className}>
        {icon}
        {label}
      </a>
    );
  }
  if (href) {
    return (
      <Link href={href} className={className}>
        {icon}
        {label}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {icon}
      {label}
    </button>
  );
}

function Section({ title }: { title: string }) {
  return (
    <h3 className="mb-1 mt-3 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-secondary)] first:mt-0">
      {title}
    </h3>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[6px] text-[10px] last:border-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}

function Th({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className="border-b border-[var(--border)] pb-1 font-medium text-[var(--text-muted)]"
      style={{ textAlign: align }}
    >
      {children}
    </th>
  );
}

function Cell({
  children,
  align = "left",
}: {
  children: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <td
      className="border-b border-[var(--border)] py-1.5 text-[var(--text-primary)]"
      style={{ textAlign: align }}
    >
      {children}
    </td>
  );
}
