import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";

const CONTROL =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-[12px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)] disabled:bg-[var(--page)] disabled:text-[var(--text-muted)]";

export function Field({
  label,
  required,
  hint,
  locked,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  /** Champ repris d'une autre source : le cadenas dit qu'il ne se saisit pas ici. */
  locked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center gap-1 text-[10px] font-medium text-[var(--text-secondary)]">
        {label}
        {required ? <span style={{ color: "var(--critical)" }}> *</span> : null}
        {locked ? (
          <Lock
            size={9}
            strokeWidth={2.4}
            className="text-[var(--text-muted)]"
            aria-label="Champ non modifiable ici"
          />
        ) : null}
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
