import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

export type ComplianceCheck = {
  label: string;
  passed: boolean;
  detail?: string;
};

/**
 * Contrôles ISO 15189 de la réception.
 *
 * Ces lignes reflètent les validations réellement appliquées par
 * `receive_goods()` en base : elles ne sont pas décoratives. Le serveur
 * refuse la réception dès qu'une d'entre elles échoue, même si l'interface
 * était contournée.
 */
export function ComplianceChecks({ checks }: { checks: ComplianceCheck[] }) {
  const allPassed = checks.every((check) => check.passed);

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        Contrôles ISO 15189
      </h2>

      <ul className="space-y-1.5">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 text-[11px]">
            {check.passed ? (
              <CheckCircle2
                size={13}
                strokeWidth={2.4}
                className="mt-px shrink-0"
                style={{ color: "var(--good)" }}
                aria-hidden
              />
            ) : (
              <XCircle
                size={13}
                strokeWidth={2.4}
                className="mt-px shrink-0"
                style={{ color: "var(--critical)" }}
                aria-hidden
              />
            )}
            <span className="min-w-0">
              <span
                className={
                  check.passed
                    ? "text-[var(--text-primary)]"
                    : "font-medium text-[var(--critical)]"
                }
              >
                {check.label}
              </span>
              {check.detail ? (
                <span className="block text-[9px] leading-relaxed text-[var(--text-muted)]">
                  {check.detail}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>

      <p
        className="mt-3 flex items-start gap-2 rounded-lg px-2.5 py-2 text-[10px] font-medium leading-relaxed"
        style={{
          color: allPassed ? "var(--good)" : "var(--critical)",
          background: `color-mix(in srgb, ${
            allPassed ? "var(--good)" : "var(--critical)"
          } 10%, transparent)`,
        }}
      >
        <ShieldCheck size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
        {allPassed
          ? "Toutes les exigences sont respectées."
          : "Réception bloquée : corrigez les points signalés."}
      </p>
    </section>
  );
}
