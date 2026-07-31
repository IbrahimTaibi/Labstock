"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TooltipBox } from "./Tooltip";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE } from "./chart-tokens";
import {
  formatAmount,
  formatInt,
  formatBucket,
  formatBucketShort,
} from "@/lib/utils";

/** Colonnes mensuelles, série unique : tête arrondie 4px, base carrée. */
export function MonthlyColumns({
  data,
  dataKey,
  seriesName,
  color = "var(--series-1)",
  height = 190,
  extraTooltipRow,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  seriesName: string;
  color?: string;
  height?: number;
  extraTooltipRow?: { key: string; label: string; unit: string };
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 18, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={formatBucketShort}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: AXIS_STROKE }}
            dy={4}
          />
          <YAxis
            tickFormatter={(value: number) => formatInt(value)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={38}
          />
          <Tooltip
            cursor={{ fill: GRID_STROKE, fillOpacity: 0.5 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const row = payload[0].payload as Record<string, number>;
              return (
                <TooltipBox
                  title={formatBucket(String(label))}
                  rows={[
                    { label: seriesName, value: formatInt(row[dataKey]), color },
                    ...(extraTooltipRow
                      ? [
                          {
                            label: extraTooltipRow.label,
                            value: `${formatAmount(row[extraTooltipRow.key])} ${extraTooltipRow.unit}`,
                          },
                        ]
                      : []),
                  ]}
                />
              );
            }}
          />
          <Bar
            dataKey={dataKey}
            fill={color}
            maxBarSize={24}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
          >
            {/* Étiquette directe sur la tête ; l'axe porte le reste */}
            <LabelList
              dataKey={dataKey}
              position="top"
              offset={6}
              className="tnum"
              fill="var(--text-secondary)"
              fontSize={10}
              formatter={(value) => formatInt(Number(value ?? 0))}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
