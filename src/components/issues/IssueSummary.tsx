import { History, Info, Sigma } from "lucide-react";
import type {
  CoefficientDetail,
  IssueHistoryEntry,
  IssueMode,
} from "@/lib/types";
import { formatDateTime, formatInt } from "@/lib/utils";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] py-[7px] text-[11px] last:border-0">
      <span className="shrink-0 text-[var(--text-muted)]">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-[var(--text-primary)]">
        {children}
      </span>
    </div>
  );
}

function ModeTag({ mode }: { mode: IssueMode }) {
  const automatic = mode === "automatic";
  const color = automatic ? "var(--series-1)" : "var(--serious)";
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
      style={{
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
      }}
    >
      {automatic ? "Automatique" : "Manuel"}
    </span>
  );
}

export function IssueSummary({
  mode,
  totals,
  coefficients,
  history,
}: {
  mode: IssueMode;
  totals: {
    totalAnalyses: number;
    totalSamples: number;
    totalReferences: number;
    totalQuantity: number;
    ready: boolean;
  };
  coefficients: CoefficientDetail[];
  history: IssueHistoryEntry[];
}) {
  return (
    <div className="flex flex-col gap-3">
      <aside className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Sigma size={13} aria-hidden />
          Résumé de la sortie
        </h2>

        <Row label="Source externe">Logiciel de laboratoire</Row>
        <Row label="Mode de sortie">
          <ModeTag mode={mode} />
        </Row>
        <Row label="Total analyses">{formatInt(totals.totalAnalyses)}</Row>
        <Row label="Total échantillons">{formatInt(totals.totalSamples)}</Row>
        <Row label="Total références">{formatInt(totals.totalReferences)}</Row>
        <Row label="Quantité à déduire">{formatInt(totals.totalQuantity)}</Row>
        <Row label="Statut global">
          <span
            className="rounded px-1.5 py-0.5 text-[9px] font-semibold"
            style={{
              color: totals.ready ? "var(--good)" : "var(--critical)",
              background: `color-mix(in srgb, ${
                totals.ready ? "var(--good)" : "var(--critical)"
              } 12%, transparent)`,
            }}
          >
            {totals.totalAnalyses === 0
              ? "Rien à déduire"
              : totals.ready
                ? "Prêt à déduire"
                : "Stock insuffisant"}
          </span>
        </Row>

        <p className="mt-2 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 py-2 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          <Info
            size={12}
            strokeWidth={2.2}
            className="mt-px shrink-0"
            style={{ color: "var(--series-1)" }}
            aria-hidden
          />
          La déduction est écrite en une seule transaction : si un consommable
          manque, aucun stock n&apos;est modifié.
        </p>
      </aside>

      <aside className="card p-4">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Détail des coefficients
        </h2>
        <table className="w-full border-collapse text-[10px]">
          <thead>
            <tr>
              <th className="border-b border-[var(--border)] pb-1 text-left font-medium text-[var(--text-muted)]">
                Analyse
              </th>
              <th className="border-b border-[var(--border)] pb-1 text-left font-medium text-[var(--text-muted)]">
                Consommables utilisés
              </th>
            </tr>
          </thead>
          <tbody>
            {coefficients.map((row) => (
              <tr key={row.code}>
                <td className="border-b border-[var(--border)] py-1.5 pr-2 align-top font-medium text-[var(--text-primary)]">
                  {row.code}
                </td>
                <td className="border-b border-[var(--border)] py-1.5 leading-relaxed text-[var(--text-secondary)]">
                  {row.consumables.length ? row.consumables.join(", ") : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </aside>

      <aside className="card p-4">
        <h2 className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <History size={13} aria-hidden />
          Historique des sorties
        </h2>

        {history.length === 0 ? (
          <p className="py-3 text-center text-[10px] text-[var(--text-muted)]">
            Aucune sortie enregistrée.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between gap-2 border-b border-[var(--border)] pb-1.5 text-[10px] last:border-0 last:pb-0"
              >
                <span className="tnum shrink-0 text-[var(--text-secondary)]">
                  {formatDateTime(entry.issued_at)}
                </span>
                <ModeTag mode={entry.mode} />
                <span className="tnum shrink-0 font-medium text-[var(--text-primary)]">
                  {formatInt(entry.total_quantity)} u.
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>
    </div>
  );
}
