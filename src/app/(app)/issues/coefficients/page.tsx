import Link from "next/link";
import { ArrowLeft, Info } from "lucide-react";

import { Td, Th } from "@/components/DataTable";
import { PageHeader } from "@/components/shell/PageHeader";
import { getCoefficients } from "@/lib/issues";
import { formatInt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CoefficientsPage() {
  const rows = await getCoefficients();
  const analyses = new Set(rows.map((row) => row.analysis_code));

  return (
    <main className="mx-auto w-full max-w-[1100px] p-4 md:p-5">
      <PageHeader
        title="Coefficients de consommation"
        subtitle="Quantité de consommable déduite par test, pour chaque analyse"
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

      <p className="mb-3 flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2.5 text-[10px] leading-relaxed text-[var(--text-secondary)]">
        <Info
          size={13}
          strokeWidth={2.2}
          className="mt-px shrink-0"
          style={{ color: "var(--series-1)" }}
          aria-hidden
        />
        <span>
          Consultation seule. Modifier un coefficient est un acte de
          paramétrage qui engage tous les calculs à venir : il relèvera du
          module d&apos;administration, réservé au responsable qualité.
          Les sorties déjà validées ne sont pas concernées — elles
          enregistrent les quantités réellement déduites, jamais un calcul
          rejoué.
        </span>
      </p>

      <section className="card mb-3 grid grid-cols-2 gap-x-6 gap-y-2 p-4 sm:grid-cols-3">
        <Summary label="Analyses paramétrées" value={formatInt(analyses.size)} />
        <Summary label="Lignes de coefficient" value={formatInt(rows.length)} />
        <Summary
          label="Consommables distincts"
          value={formatInt(new Set(rows.map((row) => row.product_name)).size)}
        />
      </section>

      <section className="card p-4">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] border-collapse text-[11px]">
            <thead>
              <tr>
                <Th>Code</Th>
                <Th>Analyse</Th>
                <Th>Section</Th>
                <Th>Consommable</Th>
                <Th>Référence</Th>
                <Th align="right">Coef. / test</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                /* Le code n'est répété que lorsqu'il change : la lecture se
                   fait par analyse, pas ligne à ligne. */
                const isNewAnalysis =
                  index === 0 || rows[index - 1].analysis_code !== row.analysis_code;

                return (
                  <tr key={`${row.analysis_code}-${row.product_name}`}>
                    <Td nowrap className="font-medium">
                      {isNewAnalysis ? row.analysis_code : ""}
                    </Td>
                    <Td>{isNewAnalysis ? row.analysis_name : ""}</Td>
                    <Td className="text-[var(--text-muted)]">
                      {isNewAnalysis ? row.section : ""}
                    </Td>
                    <Td>{row.product_name}</Td>
                    <Td nowrap>{row.reference ?? "—"}</Td>
                    <Td align="right" className="font-semibold">
                      {row.coefficient.toString().replace(".", ",")}
                    </Td>
                  </tr>
                );
              })}

              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-2 py-8 text-center text-[11px] text-[var(--text-muted)]"
                  >
                    Aucun coefficient paramétré.
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
