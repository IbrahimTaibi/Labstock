import { CheckCircle2 } from "lucide-react";
import { Td, Th } from "@/components/DataTable";
import type { PrescribedAnalysis } from "@/lib/types";
import { formatInt } from "@/lib/utils";

export function AnalysesTable({ analyses }: { analyses: PrescribedAnalysis[] }) {
  const totalSamples = analyses.reduce((sum, row) => sum + row.sample_count, 0);

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          2. Analyses prescrites
          <span className="ml-1.5 font-normal normal-case tracking-normal text-[var(--text-muted)]">
            (importées du logiciel externe)
          </span>
        </h2>
        <span className="rounded px-2 py-1 text-[10px] font-medium text-[var(--text-secondary)] ring-1 ring-[var(--border)]">
          Total analyses : {formatInt(analyses.length)}
        </span>
      </div>

      {analyses.length === 0 ? (
        <p className="py-6 text-center text-[11px] text-[var(--text-muted)]">
          Aucune analyse en attente. Lancez une synchronisation pour importer les
          analyses prescrites.
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] border-collapse text-[11px]">
              <thead>
                <tr>
                  <Th align="right">#</Th>
                  <Th>Code</Th>
                  <Th>Analyse</Th>
                  <Th>Section</Th>
                  <Th align="right">Échantillons</Th>
                  <Th>Statut</Th>
                </tr>
              </thead>
              <tbody>
                {analyses.map((row, index) => (
                  <tr key={row.id}>
                    <Td align="right" className="text-[var(--text-muted)]">
                      {index + 1}
                    </Td>
                    <Td nowrap className="font-medium">
                      {row.code}
                    </Td>
                    <Td>{row.name}</Td>
                    <Td>{row.section}</Td>
                    <Td align="right">{formatInt(row.sample_count)}</Td>
                    <Td>
                      <span
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-semibold"
                        style={{
                          color: "var(--good)",
                          background:
                            "color-mix(in srgb, var(--good) 12%, transparent)",
                        }}
                      >
                        <CheckCircle2 size={11} strokeWidth={2.6} aria-hidden />
                        Importée
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="mt-2 text-[10px] text-[var(--text-muted)]">
            Total échantillons :{" "}
            <span className="tnum font-semibold text-[var(--text-primary)]">
              {formatInt(totalSamples)}
            </span>
          </p>
        </>
      )}
    </section>
  );
}
