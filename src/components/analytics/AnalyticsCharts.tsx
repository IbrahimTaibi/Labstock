"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Donut } from "@/components/charts/Donut";
import { TimeSeriesArea } from "@/components/charts/TimeSeriesArea";
import { TooltipBox } from "@/components/charts/Tooltip";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE } from "@/components/charts/chart-tokens";
import { STATUS_META } from "@/lib/analytics-summary";
import type { AnalyticsTotals, AnalyticsStatus } from "@/lib/types";
import { formatAmount, formatCompact, formatInt } from "@/lib/utils";

const ORDER: AnalyticsStatus[] = ["sain", "alerte", "rupture", "surstock"];

export function AnalyticsCharts({
  totals,
  exits,
}: {
  totals: AnalyticsTotals;
  exits: { day: string; quantity: number }[];
}) {
  const slices = ORDER.filter((status) => totals.byStatus[status] > 0).map(
    (status) => ({
      label: STATUS_META[status].label,
      value: totals.byStatus[status],
      color: STATUS_META[status].color,
    })
  );

  return (
    <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
      <section className="card p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Répartition par statut
        </h2>
        {totals.articles === 0 ? (
          <Empty />
        ) : (
          <>
            <Donut
              slices={slices}
              centerLabel="Total"
              integer
              total={totals.articles}
            />
            <ul className="mt-2 space-y-1">
              {ORDER.map((status) => {
                const count = totals.byStatus[status];
                const meta = STATUS_META[status];
                const share = totals.articles
                  ? (count / totals.articles) * 100
                  : 0;
                return (
                  <li
                    key={status}
                    className="flex items-center gap-2 text-[10px]"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: meta.color }}
                      aria-hidden
                    />
                    <span className="text-[var(--text-secondary)]">{meta.label}</span>
                    <span className="tnum ml-auto font-medium text-[var(--text-primary)]">
                      {formatInt(count)}
                    </span>
                    <span className="tnum w-10 text-right text-[var(--text-muted)]">
                      {share.toFixed(1).replace(".", ",")} %
                    </span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Valeur du stock par catégorie
        </h2>
        {totals.byCategory.length === 0 ? (
          <Empty />
        ) : (
          <div style={{ height: Math.max(180, totals.byCategory.length * 34) }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={totals.byCategory}
                layout="vertical"
                margin={{ top: 4, right: 48, bottom: 4, left: 4 }}
              >
                <CartesianGrid horizontal={false} stroke={GRID_STROKE} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => formatCompact(value)}
                  tick={AXIS_TICK}
                  stroke={AXIS_STROKE}
                />
                <YAxis
                  type="category"
                  dataKey="category"
                  width={84}
                  tick={AXIS_TICK}
                  stroke={AXIS_STROKE}
                />
                <Tooltip
                  cursor={{ fill: "color-mix(in srgb, var(--series-1) 6%, transparent)" }}
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <TooltipBox
                        title={String(payload[0].payload.category)}
                        rows={[
                          {
                            label: "Valeur du stock",
                            value: `${formatAmount(Number(payload[0].value))} DT`,
                            color: "var(--series-1)",
                          },
                        ]}
                      />
                    ) : null
                  }
                />
                <Bar
                  dataKey="value"
                  fill="var(--series-1)"
                  radius={[0, 4, 4, 0]}
                  barSize={16}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="card p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Évolution des sorties (30 j)
        </h2>
        {exits.length === 0 ? (
          <Empty />
        ) : (
          <TimeSeriesArea
            data={exits.map((point) => ({ bucket: point.day, value: point.quantity }))}
            dataKey="value"
            seriesName="Sorties"
            unit="u."
            color="var(--serious)"
          />
        )}
      </section>

      {/* §6.4 — bloc informatif : comment lire l'indice de rotation. */}
      <section
        className="card p-4"
        style={{
          background: "color-mix(in srgb, var(--serious) 7%, var(--surface))",
        }}
      >
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Lecture de la rotation
        </h2>
        <ul className="space-y-2">
          <Band color="var(--good)" range="> 1" text="Stock qui tourne vite : surveiller le risque de rupture." />
          <Band color="var(--series-1)" range="0,5 – 1" text="Rotation saine, rythme d'écoulement équilibré." />
          <Band color="var(--serious)" range="0,3 – 0,5" text="Écoulement ralenti, à surveiller." />
          <Band color="var(--critical)" range="< 0,3" text="Stock dormant : risque de péremption." />
        </ul>
        <p className="mt-3 text-[9px] leading-relaxed text-[var(--text-muted)]">
          Rotation = sorties de la période ÷ stock moyen, sur 90 jours. Le taux
          de couverture s&apos;appuie sur la même fenêtre, pour que les deux
          indicateurs racontent la même histoire.
        </p>
      </section>
    </div>
  );
}

function Band({
  color,
  range,
  text,
}: {
  color: string;
  range: string;
  text: string;
}) {
  return (
    <li className="flex items-start gap-2 text-[10px]">
      <span
        className="mt-1 h-2 w-2 shrink-0 rounded-full"
        style={{ background: color }}
        aria-hidden
      />
      <span className="min-w-0">
        <span className="tnum font-semibold text-[var(--text-primary)]">{range}</span>{" "}
        <span className="leading-relaxed text-[var(--text-secondary)]">{text}</span>
      </span>
    </li>
  );
}

function Empty() {
  return (
    <p className="py-10 text-center text-[10px] text-[var(--text-muted)]">
      Aucune donnée pour ces filtres.
    </p>
  );
}
