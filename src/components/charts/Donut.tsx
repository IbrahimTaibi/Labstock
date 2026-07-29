"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { TooltipBox } from "./Tooltip";
import { formatAmount, formatInt } from "@/lib/utils";

export type DonutSlice = { label: string; value: number; color: string };

export function Donut({
  slices,
  centerLabel,
  unit = "DT",
  integer = false,
  size = 168,
  total: totalOverride,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  unit?: string;
  /** true = quantités entières plutôt que montants. */
  integer?: boolean;
  size?: number;
  /** Total de référence : évite l'écart d'arrondi avec la somme des parts. */
  total?: number;
}) {
  const total = totalOverride ?? slices.reduce((sum, s) => sum + s.value, 0);
  const format = integer ? formatInt : formatAmount;
  const share = (value: number) => (total ? (value / total) * 100 : 0);

  return (
    <div className="flex items-center gap-4">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="62%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              /* L'anneau de surface fait la séparation — jamais un contour de données */
              stroke="var(--surface)"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {slices.map((slice) => (
                <Cell key={slice.label} fill={slice.color} />
              ))}
            </Pie>
            <Tooltip
              cursor={false}
              /* Doit passer au-dessus du total central, rendu juste après */
              wrapperStyle={{ zIndex: 20 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const slice = payload[0].payload as DonutSlice;
                return (
                  <TooltipBox
                    title={slice.label}
                    rows={[
                      {
                        label: integer ? "Unités" : "Valeur",
                        value: `${format(slice.value)}${integer ? "" : " " + unit}`,
                        color: slice.color,
                      },
                      {
                        label: "Part",
                        value: share(slice.value).toFixed(1).replace(".", ",") + " %",
                      },
                    ]}
                  />
                );
              }}
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="pointer-events-none absolute inset-0 z-0 grid place-items-center text-center">
          <div>
            <div className="tnum text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
              {format(total)}
              {!integer && (
                <span className="ml-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                  {unit}
                </span>
              )}
            </div>
            <div className="text-[10px] text-[var(--text-muted)]">{centerLabel}</div>
          </div>
        </div>
      </div>

      {/* La légende porte l'identité et les valeurs en clair */}
      <ul className="min-w-0 flex-1 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2 text-[11px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: slice.color }}
            />
            <span className="truncate text-[var(--text-secondary)]">{slice.label}</span>
            <span className="tnum ml-auto shrink-0 font-medium text-[var(--text-primary)]">
              {format(slice.value)}
              {!integer && " " + unit}
            </span>
            <span className="tnum w-10 shrink-0 text-right text-[var(--text-muted)]">
              {share(slice.value).toFixed(0)} %
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
