"use client";

import {
  Banknote,
  CircleAlert,
  FileText,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { DEBT_STATUS_CONFIG } from "./DebtBadge";
import { formatAmount, formatCompact, formatInt, formatPercent } from "@/lib/utils";
import type {
  DebtAgeingSlice,
  DebtCreditorTotal,
  DebtTotals,
} from "@/lib/types";

/* §2 — règle de cohérence impérative : les deux écrans du parcours affichent
   les mêmes cartes, calculées une seule fois dans getDebtsWorkspace(). Ce
   composant est partagé pour que la règle tienne par construction et non par
   discipline. */
export function DebtKpis({ totals }: { totals: DebtTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
      <Kpi
        label="Total dettes"
        value={formatInt(totals.count)}
        note="Factures suivies"
        color="var(--series-1)"
        icon={<FileText size={17} strokeWidth={2.2} aria-hidden />}
      />
      <Kpi
        label="Montant total à payer"
        value={formatAmount(totals.amount_due)}
        note="Toutes catégories"
        color="var(--good)"
        icon={<Banknote size={17} strokeWidth={2.2} aria-hidden />}
      />
      <Kpi
        label="Montant total payé"
        value={formatAmount(totals.amount_paid)}
        note="Règlements valides"
        color="var(--series-5)"
        icon={<Wallet size={17} strokeWidth={2.2} aria-hidden />}
      />
      <Kpi
        label="Solde total restant dû"
        value={formatAmount(totals.balance)}
        note="Montant en attente"
        color="var(--critical)"
        icon={<CircleAlert size={17} strokeWidth={2.2} aria-hidden />}
      />
      <Kpi
        label="Dettes échues"
        value={formatInt(totals.overdue_count)}
        note={`Dont ${formatInt(totals.overdue_over_30)} avec retard > 30 jours`}
        color="var(--series-2)"
        icon={<TriangleAlert size={17} strokeWidth={2.2} aria-hidden />}
      />
    </div>
  );
}

function Kpi({
  label,
  value,
  note,
  color,
  icon,
}: {
  label: string;
  value: string;
  note: string;
  color: string;
  icon: React.ReactNode;
}) {
  return (
    <article className="card flex items-center gap-3 p-3.5">
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
        style={{
          background: `color-mix(in srgb, ${color} 14%, transparent)`,
          color,
        }}
      >
        {icon}
      </span>
      <div className="min-w-0">
        <div className="truncate text-[10px] font-medium text-[var(--text-secondary)]">
          {label}
        </div>
        <div className="truncate text-[20px] font-semibold leading-tight text-[var(--text-primary)]">
          {value}
        </div>
        <div className="truncate text-[9px] text-[var(--text-muted)]" title={note}>
          {note}
        </div>
      </div>
    </article>
  );
}

/* §7.1 — répartition par ancienneté. Un donut en SVG plutôt qu'une
   dépendance : cinq arcs ne justifient pas une librairie de graphiques, et
   la légende porte déjà l'information chiffrée. */
export function DebtAgeing({
  ageing,
  totals,
}: {
  ageing: DebtAgeingSlice[];
  totals: DebtTotals;
}) {
  const total = ageing.reduce((sum, slice) => sum + slice.count, 0);
  const RADIUS = 52;
  const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

  /* Décalage de chaque arc = somme des précédents. Calculé par somme de
     préfixe plutôt qu'avec un accumulateur mutable : sept tranches au plus,
     et le compilateur React interdit la réassignation en cours de rendu. */
  const fractions = ageing.map((slice) =>
    total === 0 ? 0 : slice.count / total
  );
  const arcs = ageing.map((slice, index) => {
    const fraction = fractions[index];
    const before = fractions
      .slice(0, index)
      .reduce((sum, value) => sum + value, 0);
    return {
      ...slice,
      fraction,
      dash: fraction * CIRCUMFERENCE,
      offset: before * CIRCUMFERENCE,
    };
  });

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
        Répartition des dettes par ancienneté
      </h2>

      {total === 0 ? (
        <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
          Aucune dette enregistrée.
        </p>
      ) : (
        <>
          <div className="relative mx-auto mb-3 h-[132px] w-[132px]">
            <svg
              viewBox="0 0 132 132"
              className="h-full w-full -rotate-90"
              role="img"
              aria-label={`${formatInt(total)} dettes réparties par ancienneté`}
            >
              {arcs.map((arc) => (
                <circle
                  key={arc.status}
                  cx="66"
                  cy="66"
                  r={RADIUS}
                  fill="none"
                  strokeWidth="14"
                  stroke={DEBT_STATUS_CONFIG[arc.status].color}
                  strokeDasharray={`${arc.dash} ${CIRCUMFERENCE - arc.dash}`}
                  strokeDashoffset={-arc.offset}
                />
              ))}
            </svg>
            <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
              <div>
                <div className="text-[22px] font-semibold leading-none text-[var(--text-primary)]">
                  {formatInt(total)}
                </div>
                <div className="text-[9px] text-[var(--text-muted)]">
                  Total dettes
                </div>
              </div>
            </div>
          </div>

          <ul className="space-y-1">
            {arcs.map((arc) => {
              const config = DEBT_STATUS_CONFIG[arc.status];
              return (
                <li
                  key={arc.status}
                  className="flex items-center gap-2 text-[10px]"
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: config.color }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
                    {config.short}
                  </span>
                  <span className="tnum shrink-0 font-medium text-[var(--text-primary)]">
                    {formatInt(arc.count)}
                  </span>
                  <span className="tnum w-12 shrink-0 text-right text-[var(--text-muted)]">
                    {formatPercent(arc.fraction * 100)}
                  </span>
                </li>
              );
            })}
          </ul>

          {totals.overdue_count > 0 ? (
            <p
              className="mt-3 rounded-lg px-2.5 py-2 text-[10px] leading-relaxed"
              style={{
                background: "color-mix(in srgb, var(--critical) 10%, transparent)",
                color: "var(--critical)",
              }}
            >
              <TriangleAlert
                size={11}
                strokeWidth={2.6}
                className="mr-1 inline align-[-1px]"
                aria-hidden
              />
              {formatInt(totals.overdue_count)} dette
              {totals.overdue_count > 1 ? "s" : ""} échue
              {totals.overdue_count > 1 ? "s" : ""} — dont{" "}
              {formatInt(totals.overdue_over_30)} avec retard &gt; 30 jours.
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}

/* §7.2 — Top 5 des créanciers par montant restant dû. */
export function TopCreditors({
  creditors,
  onSelect,
}: {
  creditors: DebtCreditorTotal[];
  onSelect?: (creditor: string) => void;
}) {
  const max = creditors[0]?.balance ?? 0;

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[12px] font-semibold text-[var(--text-primary)]">
        Top 5 fournisseurs (montant dû)
      </h2>

      {creditors.length === 0 ? (
        <p className="py-4 text-center text-[11px] text-[var(--text-muted)]">
          Aucun solde en attente.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {creditors.map((creditor) => {
            const row = (
              <>
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="min-w-0 truncate text-[11px] font-medium text-[var(--text-primary)]">
                    {creditor.creditor}
                  </span>
                  <span className="tnum shrink-0 text-[11px] font-semibold text-[var(--text-primary)]">
                    {formatCompact(creditor.balance)}
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[var(--page)]">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${max === 0 ? 0 : (creditor.balance / max) * 100}%`,
                      background: "var(--series-1)",
                    }}
                  />
                </div>
                <div className="mt-0.5 text-[9px] text-[var(--text-muted)]">
                  {formatInt(creditor.invoices)} facture
                  {creditor.invoices > 1 ? "s" : ""}
                </div>
              </>
            );

            return (
              <li key={creditor.creditor}>
                {onSelect ? (
                  <button
                    type="button"
                    onClick={() => onSelect(creditor.creditor)}
                    className="w-full rounded-lg px-1 py-0.5 text-left transition-colors hover:bg-[var(--page)]"
                    title={`Filtrer sur ${creditor.creditor}`}
                  >
                    {row}
                  </button>
                ) : (
                  <div className="px-1 py-0.5">{row}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
