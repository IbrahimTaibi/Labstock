import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getSatisfactionData } from "@/lib/satisfaction";
import { evaluationStats } from "@/lib/satisfaction-stats";
import { formatDate, formatInt, formatPercent } from "@/lib/utils";
import type { DeliveryEvaluation } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Rapport satisfaction fournisseurs" };

function score(n: number) {
  return n.toFixed(1).replace(".", ",");
}

export default async function SatisfactionReportPage() {
  const [{ orders, evaluations }, user] = await Promise.all([
    getSatisfactionData(),
    getCurrentUser(),
  ]);
  const stats = evaluationStats(evaluations);

  /* Une ligne par fournisseur : c'est la vue qu'attend une revue de
     direction, le détail par B.C. suit. */
  const bySupplier = new Map<string, DeliveryEvaluation[]>();
  for (const e of evaluations) {
    bySupplier.set(e.supplier, [...(bySupplier.get(e.supplier) ?? []), e]);
  }
  const suppliers = [...bySupplier.entries()]
    .map(([name, list]) => ({ name, ...evaluationStats(list) }))
    .sort((a, b) => b.avgRating - a.avgRating);

  const th = "py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]";

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/satisfaction" backLabel="Retour aux évaluations" />

      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">
              Rapport de satisfaction fournisseurs
            </h1>
            <p className="mt-0.5 text-[11px] text-[#3d3d3d]">
              Qualité des livraisons — état au {formatDate(new Date().toISOString())}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">Laboratoire</p>
            <p className="text-[12px] font-semibold">{user?.labName ?? "Laboratoire"}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-3 gap-3 text-center">
          {[
            ["B.C. évalués", `${formatInt(stats.count)} / ${formatInt(orders.length)}`],
            ["Taux de conformité", formatPercent(stats.conformityRate * 100)],
            ["Livraisons à l'heure", `${formatInt(stats.onTime)} / ${formatInt(stats.count)}`],
            ["Note moyenne", `${score(stats.avgRating)} / 5`],
            ["Retard moyen", `${score(stats.avgDelay)} j`],
            ["Non conformes", formatInt(stats.nonConforming)],
          ].map(([label, value]) => (
            <div key={label} className="border border-[#d0d0d0] px-2 py-2">
              <div className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">{label}</div>
              <div className="tnum text-[15px] font-bold">{value}</div>
            </div>
          ))}
        </section>

        <h2 className="mt-6 text-[11px] font-bold uppercase tracking-wider">Par fournisseur</h2>
        <table className="mt-1 w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className={`${th} pr-3 text-left`}>Fournisseur</th>
              <th className={`${th} text-right`}>Livraisons</th>
              <th className={`${th} text-right`}>À l&apos;heure</th>
              <th className={`${th} text-right`}>Conformité</th>
              <th className={`${th} text-right`}>Retard moyen</th>
              <th className={`${th} text-right`}>Note</th>
            </tr>
          </thead>
          <tbody>
            {suppliers.map((s) => (
              <tr key={s.name} className="border-b border-[#e0e0e0] text-[10px] break-inside-avoid">
                <td className="py-1.5 pr-3 font-medium">{s.name}</td>
                <td className="tnum py-1.5 text-right">{formatInt(s.count)}</td>
                <td className="tnum py-1.5 text-right">{formatInt(s.onTime)}</td>
                <td className="tnum py-1.5 text-right">{formatPercent(s.conformityRate * 100)}</td>
                <td className="tnum py-1.5 text-right">{score(s.avgDelay)} j</td>
                <td className="tnum py-1.5 text-right font-semibold">{score(s.avgRating)} / 5</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2 className="mt-6 text-[11px] font-bold uppercase tracking-wider">Détail des évaluations</h2>
        <table className="mt-1 w-full border-collapse">
          <thead>
            <tr className="border-b border-black">
              <th className={`${th} pr-2 text-left`}>N° B.C.</th>
              <th className={`${th} pr-2 text-left`}>Fournisseur</th>
              <th className={`${th} pr-2 text-left`}>Prévue</th>
              <th className={`${th} pr-2 text-left`}>Réelle</th>
              <th className={`${th} pr-2 text-right`}>Retard</th>
              <th className={`${th} pr-2 text-left`}>Conforme</th>
              <th className={`${th} pr-2 text-left`}>Qualité / remarque</th>
              <th className={`${th} text-right`}>Note</th>
            </tr>
          </thead>
          <tbody>
            {evaluations.map((e) => (
              <tr key={e.id} className="border-b border-[#e0e0e0] text-[9.5px] break-inside-avoid">
                <td className="tnum py-1.5 pr-2">{e.order_number}</td>
                <td className="py-1.5 pr-2">{e.supplier}</td>
                <td className="tnum py-1.5 pr-2">{formatDate(e.expected_date)}</td>
                <td className="tnum py-1.5 pr-2">{formatDate(e.delivered_date)}</td>
                <td className="tnum py-1.5 pr-2 text-right">{formatInt(e.delay_days)} j</td>
                <td className="py-1.5 pr-2 font-semibold">{e.conforming ? "Oui" : "Non"}</td>
                <td className="py-1.5 pr-2">
                  {e.quality} — {e.remark}
                  {e.delay_cause ? ` (${e.delay_cause})` : ""}
                </td>
                <td className="tnum py-1.5 text-right font-semibold">{e.rating} / 5</td>
              </tr>
            ))}
          </tbody>
        </table>

        {evaluations.length === 0 ? (
          <p className="mt-3 text-[10px] italic text-[#6b6b6b]">Aucune évaluation enregistrée.</p>
        ) : null}

        <footer className="mt-8 border-t border-[#e0e0e0] pt-3 text-[9px] leading-relaxed text-[#6b6b6b]">
          <p>
            Document généré par Labstock le {formatDate(new Date().toISOString())}. Une livraison
            en avance compte comme livrée à l&apos;heure. Suivi qualité des fournisseurs selon les
            exigences ISO 15189:2022.
          </p>
        </footer>
      </article>
    </main>
  );
}
