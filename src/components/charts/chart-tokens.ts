/** Slots catégoriels dans l'ordre fixe — jamais recyclés au-delà de 6. */
export function seriesColor(index: number) {
  return `var(--series-${(index % 6) + 1})`;
}

export const AXIS_TICK = { fontSize: 11, fill: "var(--text-muted)" } as const;
export const GRID_STROKE = "var(--grid)";
export const AXIS_STROKE = "var(--axis)";
