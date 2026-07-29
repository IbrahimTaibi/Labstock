import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Sparkline } from "./Sparkline";

export type KpiCardProps = {
  label: string;
  value: string;
  unit?: string;
  note: string;
  series: number[];
  color: string;
  icon: React.ReactNode;
  /** Variation en % vs mois précédent ; null si non calculable. */
  change: number | null;
  /** true si une hausse est une bonne nouvelle. */
  upIsGood: boolean;
};

export function KpiCard({
  label,
  value,
  unit,
  note,
  series,
  color,
  icon,
  change,
  upIsGood,
}: KpiCardProps) {
  const isGood = change === null ? null : change >= 0 === upIsGood;

  return (
    <article className="card flex flex-col gap-2 p-4">
      <div className="flex items-center gap-2">
        <span
          className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
          style={{
            background: `color-mix(in srgb, ${color} 14%, transparent)`,
            color,
          }}
        >
          {icon}
        </span>
        <h3 className="text-[10px] font-semibold uppercase leading-tight tracking-wider text-[var(--text-secondary)]">
          {label}
        </h3>
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-[28px] font-semibold leading-none text-[var(--text-primary)]">
          {value}
        </span>
        {unit ? (
          <span className="text-xs font-medium text-[var(--text-secondary)]">
            {unit}
          </span>
        ) : null}
      </div>

      <p className="text-[11px] text-[var(--text-muted)]">{note}</p>

      {change !== null ? (
        <p
          className="tnum flex items-center gap-1 text-[11px] font-medium"
          style={{ color: isGood ? "var(--delta-up)" : "var(--delta-down)" }}
        >
          {change >= 0 ? (
            <ArrowUpRight size={13} strokeWidth={2.5} aria-hidden />
          ) : (
            <ArrowDownRight size={13} strokeWidth={2.5} aria-hidden />
          )}
          {Math.abs(change).toFixed(1).replace(".", ",")} % vs mois dernier
        </p>
      ) : null}

      <div className="mt-auto pt-1">
        <Sparkline series={series} color={color} />
      </div>
    </article>
  );
}
