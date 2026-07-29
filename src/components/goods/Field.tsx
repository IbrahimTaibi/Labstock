import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:bg-[var(--page)] disabled:text-[var(--text-muted)]";

export function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[9px] text-[var(--text-muted)]">{hint}</span>
      ) : null}
    </label>
  );
}

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn(CONTROL, className)} {...props} />;
}

export function Select({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(CONTROL, className)} {...props}>
      {children}
    </select>
  );
}

/** Valeur dérivée, non saisissable : affichée comme un champ pour l'alignement. */
export function ReadOnlyValue({
  children,
  tone = "default",
}: {
  children: React.ReactNode;
  tone?: "default" | "good" | "warning" | "critical";
}) {
  const color =
    tone === "good"
      ? "var(--good)"
      : tone === "warning"
        ? "var(--serious)"
        : tone === "critical"
          ? "var(--critical)"
          : "var(--text-primary)";

  return (
    <div
      className="rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 py-2 text-[12px] font-medium"
      style={{ color }}
    >
      {children}
    </div>
  );
}
