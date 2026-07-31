"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TooltipBox } from "./Tooltip";
import { AXIS_STROKE, GRID_STROKE } from "./chart-tokens";
import {
  formatAmount,
  formatCompact,
  formatInt,
  formatBucket,
  formatBucketShort,
} from "@/lib/utils";

export type NetMovementPoint = {
  month: string;
  netUnits: number;
  netValue: number;
};

/** Solde entrées − sorties : série unique, ligne de zéro explicite. */
export function NetMovementLine({
  data,
  height = 120,
}: {
  data: NetMovementPoint[];
  height?: number;
}) {
  const color = "var(--series-5)";
  const tick = { fontSize: 10, fill: "var(--text-muted)" } as const;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 10, bottom: 0, left: 0 }}>
          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={formatBucketShort}
            tick={tick}
            tickLine={false}
            axisLine={{ stroke: AXIS_STROKE }}
            dy={3}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tick={tick}
            tickLine={false}
            axisLine={false}
            width={42}
          />
          <ReferenceLine y={0} stroke={AXIS_STROKE} strokeWidth={1} />
          <Tooltip
            cursor={{ stroke: AXIS_STROKE, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              const point = payload[0].payload as NetMovementPoint;
              return (
                <TooltipBox
                  title={formatBucket(String(label))}
                  rows={[
                    { label: "Solde unités", value: formatInt(point.netUnits), color },
                    { label: "Solde valeur", value: `${formatAmount(point.netValue)} DT` },
                  ]}
                />
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="netValue"
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 3.5, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
