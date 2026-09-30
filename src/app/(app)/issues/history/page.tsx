import Link from "next/link";
import { ArrowLeft, Plug } from "lucide-react";

import { Td, Th } from "@/components/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { getIssueHistory, getLisEvents } from "@/lib/issues";
import { formatDateTime, formatInt } from "@/lib/utils";
import type { LisEventStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<LisEventStatus, { label: string; color: string }> = {
  accepted: { label: "Intégrée", color: "var(--good)" },
  duplicate: { label: "Doublon ignoré", color: "var(--text-muted)" },
  unknown_source: { label: "Connecteur inconnu", color: "var(--critical)" },
  invalid_signature: { label: "Signature invalide", color: "var(--critical)" },
  unknown_analysis: { label: "Code analyse inconnu", color: "var(--serious)" },
  malformed: { label: "Requête invalide", color: "var(--serious)" },
};

export default async function IssueHistoryPage() {
  const [history, events] = await Promise.all([getIssueHistory(), getLisEvents()]);

  const units = history.reduce((sum, entry) => sum + entry.total_quantity, 0);
  const automatic = history.filter((entry) => entry.mode === "automatic").length;

  return (
    <main className="mx-auto w-full max-w-[1100px] p-4 md:p-5">
      <PageHeader
        title="Historique des sorties"
        subtitle="Déductions enregistrées et appels reçus du logiciel de laboratoire"
        actions={
          <Link
            href="/issues"
            className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
          >
            <ArrowLeft size={14} aria-hidden />
            Retour aux sorties
          </Link>
        }
      />

      <section className="card mb-3 grid grid-cols-2 gap-x-6 gap-y-2 p-4 sm:grid-cols-4">
        <Summary label="Sorties enregistrées" value={formatInt(history.length)} />
        <Summary label="Dont automatiques" value={formatInt(automatic)} />
        <Summary label="Dont manuelles" value={formatInt(history.length - automatic)} />
        <Summary label="Unités déduites" value={formatInt(units)} />
      </section>

      <section className="card mb-3 p-4">
        <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          Sorties de stock
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-[11px]">
            <thead>
              <tr>
                <Th>Date et heure</Th>
                <Th>Mode</Th>
                <Th>Opérateur</Th>
                <Th align="right">Références</Th>
                <Th align="right">Unités déduites</Th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => {
                const auto = entry.mode === "automatic";
                const color = auto ? "var(--series-1)" : "var(--serious)";
                return (
                  <tr key={entry.id}>
                    <Td nowrap>{formatDateTime(entry.issued_at)}</Td>
                    <Td>
                      <span
                        className="rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          color,
                          background: `color-mix(in srgb, ${color} 12%, transparent)`,
                        }}
                      >
                        {auto ? "Automatique" : "Manuel"}
                      </span>
                    </Td>
                    <Td>{entry.operator}</Td>
                    <Td align="right">{formatInt(entry.total_references)}</Td>
                    <Td align="right" className="font-semibold">
                      {formatInt(entry.total_quantity)}
                    </Td>
                  </tr>
                );
              })}

              {history.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                  >
                    Aucune sortie enregistrée.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-4">
        <h2 className="mb-1 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <Plug size={13} aria-hidden />
          Journal des appels du LIS
        </h2>
        <p className="mb-3 text-[10px] leading-relaxed text-[var(--text-muted)]">
          Chaque appel entrant est journalisé, y compris lorsqu&apos;il est
          rejeté : c&apos;est la pièce d&apos;audit du flux d&apos;intégration.
        </p>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-[11px]">
            <thead>
              <tr>
                <Th>Reçu le</Th>
                <Th>Connecteur</Th>
                <Th>Prescription</Th>
                <Th>Verdict</Th>
                <Th align="right">Analyses</Th>
                <Th>Détail</Th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => {
                const meta = EVENT_LABEL[event.status] ?? {
                  label: event.status,
                  color: "var(--text-muted)",
                };
                return (
                  <tr key={event.id}>
                    <Td nowrap>{formatDateTime(event.received_at)}</Td>
                    <Td nowrap>{event.slug ?? "—"}</Td>
                    <Td nowrap>{event.prescription_id ?? "—"}</Td>
                    <Td>
                      <span
                        className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          color: meta.color,
                          background: `color-mix(in srgb, ${meta.color} 12%, transparent)`,
                        }}
                      >
                        {meta.label}
                      </span>
                    </Td>
                    <Td align="right">
                      {event.analyses_created > 0
                        ? formatInt(event.analyses_created)
                        : "—"}
                    </Td>
                    <Td>
                      <span className="block max-w-[260px] truncate text-[var(--text-muted)]">
                        {event.detail ?? "—"}
                      </span>
                    </Td>
                  </tr>
                );
              })}

              {events.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                  >
                    Aucun appel reçu. Le connecteur LIS n&apos;est pas encore
                    déclaré, ou aucune prescription n&apos;a été transmise.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] text-[var(--text-muted)]">{label}</div>
      <div className="mt-0.5 truncate text-[15px] font-semibold text-[var(--text-primary)]">
        {value}
      </div>
    </div>
  );
}
