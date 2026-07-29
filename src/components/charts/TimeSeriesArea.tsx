"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { TooltipBox } from "./Tooltip";
import { AXIS_STROKE, AXIS_TICK, GRID_STROKE } from "./chart-tokens";
import {
  formatAmount,
  formatCompact,
  formatMonth,
  formatMonthShort,
} from "@/lib/utils";

/** Série unique dans le temps : aire lavée + ligne 2px + points cerclés. */
export function TimeSeriesArea({
  data,
  dataKey,
  seriesName,
  color = "var(--series-1)",
  unit = "DT",
  height = 190,
}: {
  data: Array<Record<string, string | number>>;
  dataKey: string;
  seriesName: string;
  color?: string;
  unit?: string;
  height?: number;
}) {
  const gradientId = `area-gradient-${dataKey}`;

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.16} />
              <stop offset="100%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid vertical={false} stroke={GRID_STROKE} strokeWidth={1} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonthShort}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: AXIS_STROKE }}
            dy={4}
          />
          <YAxis
            tickFormatter={(value: number) => formatCompact(value)}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            width={46}
          />
          <Tooltip
            cursor={{ stroke: AXIS_STROKE, strokeWidth: 1 }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null;
              return (
                <TooltipBox
                  title={formatMonth(String(label))}
                  rows={[
                    {
                      label: seriesName,
                      value: `${formatAmount(Number(payload[0].value))} ${unit}`,
                      color,
                    },
                  ]}
                />
              );
            }}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill={`url(#${gradientId})`}
            dot={{ r: 4, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 5, fill: color, stroke: "var(--surface)", strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
