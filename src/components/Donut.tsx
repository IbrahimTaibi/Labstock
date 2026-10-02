import { formatInt, formatPercent } from "@/lib/utils";

export type DonutSlice = {
  key: string;
  label: string;
  count: number;
  color: string;
};

/**
 * Camembert ajouré + légende chiffrée. Un SVG plutôt qu'une librairie de
 * graphiques : quelques arcs ne justifient pas une dépendance, et la légende
 * porte déjà l'information exacte — le dessin n'est qu'un repère.
 */
export function Donut({
  slices,
  centerLabel,
  size = 132,
}: {
  slices: DonutSlice[];
  centerLabel: string;
  size?: number;
}) {
  const total = slices.reduce((sum, slice) => sum + slice.count, 0);
  const radius = size * 0.394;
  const circumference = 2 * Math.PI * radius;

  /* Décalage de chaque arc = somme des précédents, par somme de préfixe :
     le compilateur React interdit la réassignation en cours de rendu. */
  const fractions = slices.map((slice) =>
    total === 0 ? 0 : slice.count / total
  );

  if (total === 0) {
    return (
      <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
        Aucune donnée à représenter.
      </p>
    );
  }

  return (
    <>
      <div
        className="relative mx-auto mb-3"
        style={{ height: size, width: size }}
      >
        <svg
          viewBox={`0 0 ${size} ${size}`}
          className="h-full w-full -rotate-90"
          role="img"
          aria-label={`${formatInt(total)} éléments répartis par ${centerLabel}`}
        >
          {slices.map((slice, index) => {
            const dash = fractions[index] * circumference;
            const before = fractions
              .slice(0, index)
              .reduce((sum, value) => sum + value, 0);
            return (
              <circle
                key={slice.key}
                cx={size / 2}
                cy={size / 2}
                r={radius}
                fill="none"
                strokeWidth={size * 0.106}
                stroke={slice.color}
                strokeDasharray={`${dash} ${circumference - dash}`}
                strokeDashoffset={-before * circumference}
              />
            );
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="text-[22px] font-semibold leading-none text-[var(--text-primary)]">
              {formatInt(total)}
            </div>
            <div className="text-[9px] text-[var(--text-muted)]">
              {centerLabel}
            </div>
          </div>
        </div>
      </div>

      <ul className="space-y-1">
        {slices.map((slice, index) => (
          <li key={slice.key} className="flex items-center gap-2 text-[10px]">
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ background: slice.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-[var(--text-secondary)]">
              {slice.label}
            </span>
            <span className="tnum shrink-0 font-medium text-[var(--text-primary)]">
              {formatInt(slice.count)}
            </span>
            <span className="tnum w-12 shrink-0 text-right text-[var(--text-muted)]">
              {formatPercent(fractions[index] * 100)}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}
