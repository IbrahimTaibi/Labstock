"use client";

type TooltipRow = { label: string; value: string; color?: string };

export function TooltipBox({
  title,
  rows,
}: {
  title: string;
  rows: TooltipRow[];
}) {
  return (
    <div
      className="rounded-lg px-3 py-2 text-xs shadow-lg"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        color: "var(--text-primary)",
      }}
    >
      <div className="mb-1 font-semibold">{title}</div>
      <div className="space-y-0.5">
        {rows.map((row) => (
          <div key={row.label} className="flex items-center gap-2">
            {row.color ? (
              <span
                className="inline-block h-2 w-2 shrink-0 rounded-full"
                style={{ background: row.color }}
              />
            ) : null}
            <span className="text-[var(--text-secondary)]">{row.label}</span>
            <span className="tnum ml-auto font-medium">{row.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
