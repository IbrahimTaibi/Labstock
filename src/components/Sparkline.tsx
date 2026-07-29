/** Mini-courbe SVG : pas d'axes, pas d'étiquettes, juste la forme. */
export function Sparkline({
  series,
  color,
  width = 180,
  height = 28,
}: {
  series: number[];
  color: string;
  width?: number;
  height?: number;
}) {
  if (series.length < 2) return null;

  const padding = 3;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = (width - padding * 2) / (series.length - 1);

  const points = series.map((value, index) => {
    const x = padding + index * step;
    const y = padding + (height - padding * 2) * (1 - (value - min) / span);
    return [x, y] as const;
  });

  const path = points
    .map(([x, y], index) => `${index ? "L" : "M"}${x} ${y}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="w-full"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      {/* Point courant cerclé de la surface pour rester lisible */}
      <circle
        cx={lastX}
        cy={lastY}
        r={4}
        fill={color}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    </svg>
  );
}
