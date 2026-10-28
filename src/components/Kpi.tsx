/** Carte indicateur : pastille d'icône, libellé, valeur, note. */
export function Kpi({
  icon,
  color,
  label,
  value,
  unit,
  note,
  emphasis = false,
}: {
  icon: React.ReactNode;
  color: string;
  label: string;
  value: string;
  unit?: string;
  note: string;
  emphasis?: boolean;
}) {
  return (
    <div className="card flex items-center gap-3 p-4">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl"
        style={{ color, background: `color-mix(in srgb, ${color} 12%, transparent)` }}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-[10px] font-semibold" style={{ color: emphasis ? color : "var(--text-secondary)" }}>
          {label}
        </span>
        <span
          className="tnum block truncate text-[22px] font-bold leading-tight"
          style={{ color: emphasis ? color : "var(--text-primary)" }}
        >
          {value}
          {unit ? <span className="ml-1 text-[11px] font-semibold">{unit}</span> : null}
        </span>
        <span className="block text-[10px] text-[var(--text-muted)]">{note}</span>
      </span>
    </div>
  );
}
