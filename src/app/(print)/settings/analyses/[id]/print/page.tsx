import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getAnalysisConfigData } from "@/lib/analysis-config";
import { getCurrentUser } from "@/lib/auth";
import { formatDateTime } from "@/lib/utils";
import type { AnalysisItem, AnalysisItemRole } from "@/lib/types";

export const dynamic = "force-dynamic";

const ROLE_TITLE: Record<AnalysisItemRole, string> = {
  consumable: "Consommables",
  reagent: "Réactifs",
  culture: "Milieux de culture",
  antibiotic: "Disques d'antibiogramme (CASFM)",
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const data = Number.isInteger(Number(id)) ? await getAnalysisConfigData(Number(id)) : null;
  return { title: data?.current ? `Fiche analyse ${data.current.code}` : "Fiche analyse" };
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-[#eeeeee] py-1">
      <dt className="text-[10px] text-[#6b6b6b]">{label}</dt>
      <dd className="text-right text-[11px] font-medium">{value}</dd>
    </div>
  );
}

export default async function AnalysisPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const numericId = Number(id);
  if (!Number.isInteger(numericId)) notFound();

  const [data, user] = await Promise.all([getAnalysisConfigData(numericId), getCurrentUser()]);
  const analysis = data.current;
  if (!analysis) notFound();

  const instrument = data.instruments.find((i) => i.id === analysis.instrument_id) ?? null;
  const groups = (Object.keys(ROLE_TITLE) as AnalysisItemRole[])
    .map((role) => ({ role, items: analysis.items.filter((i) => i.role === role) }))
    .filter((group) => group.items.length > 0);
  const yes = (v: boolean) => (v ? "Oui" : "Non");
  const th = "py-1.5 text-[9px] font-bold uppercase tracking-wider text-[#6b6b6b]";

  const describe = (item: AnalysisItem) =>
    item.auto_destock ? "Automatique" : `Selon règle${item.condition ? ` : ${item.condition}` : ""}`;

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref={`/settings/analyses?id=${analysis.id}`} backLabel="Retour à la configuration" />

      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">Fiche de configuration d&apos;analyse</h1>
            <p className="mt-0.5 text-[13px] font-semibold">
              {analysis.code} — {analysis.name}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">Laboratoire</p>
            <p className="text-[12px] font-semibold">{user?.labName ?? "Laboratoire"}</p>
            <p className="mt-1 text-[10px] font-semibold uppercase">{analysis.active ? "Active" : "Inactive"}</p>
          </div>
        </header>

        <section className="mt-5 grid grid-cols-2 gap-8">
          <dl>
            <Field label="Catégorie" value={analysis.category ?? "—"} />
            <Field label="Délai de rendu" value={analysis.turnaround_hours === null ? "—" : `${analysis.turnaround_hours} h`} />
            <Field label="Type d'échantillon" value={analysis.sample_type ?? "—"} />
            <Field label="Tube / contenant" value={analysis.tube ?? "—"} />
            <Field label="Volume requis" value={analysis.sample_volume_ml === null ? "—" : `${analysis.sample_volume_ml} mL`} />
            <Field label="Transport" value={analysis.transport_conditions ?? "—"} />
          </dl>
          <dl>
            <Field label="Urgence possible" value={yes(analysis.urgent_allowed)} />
            <Field label="Validation biologique" value={analysis.bio_validation_required ? "Obligatoire" : "Facultative"} />
            <Field label="Contrôle microscopique" value={yes(analysis.microscopy_control)} />
            <Field label="Automate" value={instrument?.name ?? "Méthode manuelle"} />
            {instrument ? <Field label="Interface LIS" value={yes(instrument.lis_interface)} /> : null}
            {instrument?.calibration ? <Field label="Calibration" value={instrument.calibration} /> : null}
          </dl>
        </section>

        {analysis.description ? <p className="mt-4 text-[11px]">{analysis.description}</p> : null}

        {groups.map((group) => (
          <section key={group.role} className="mt-5 break-inside-avoid">
            <h2 className="text-[11px] font-bold uppercase tracking-wider">{ROLE_TITLE[group.role]}</h2>
            <table className="mt-1 w-full border-collapse">
              <thead>
                <tr className="border-b border-black">
                  {group.role === "culture" || group.role === "antibiotic" ? (
                    <th className={`${th} pr-2 text-left`}>Germe</th>
                  ) : null}
                  <th className={`${th} pr-2 text-left`}>Article</th>
                  <th className={`${th} pr-2 text-left`}>Conditionnement</th>
                  <th className={`${th} pr-2 text-right`}>Qté / test</th>
                  {group.role === "culture" ? <th className={`${th} pr-2 text-left`}>Culture</th> : null}
                  <th className={`${th} text-left`}>Déstockage</th>
                </tr>
              </thead>
              <tbody>
                {group.items.map((item) => (
                  <tr key={item.product_id} className="border-b border-[#e0e0e0] text-[10px]">
                    {group.role === "culture" || group.role === "antibiotic" ? (
                      <td className="py-1.5 pr-2">{item.germ_type ?? "—"}</td>
                    ) : null}
                    <td className="py-1.5 pr-2">
                      {item.product_name}
                      {item.reference ? <span className="text-[#6b6b6b]"> ({item.reference})</span> : null}
                    </td>
                    <td className="py-1.5 pr-2">{item.packaging ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-right">
                      {String(item.coefficient).replace(".", ",")} {item.consumption_unit ?? ""}
                    </td>
                    {group.role === "culture" ? <td className="py-1.5 pr-2">{item.incubation ?? "—"}</td> : null}
                    <td className="py-1.5">{describe(item)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        ))}

        {analysis.notes ? (
          <p className="mt-5 text-[11px]">
            <span className="font-semibold">Notes : </span>
            {analysis.notes}
          </p>
        ) : null}

        <div className="mt-12 grid grid-cols-2 gap-8 text-[10px] text-[#6b6b6b]">
          <div className="border-t border-black pt-1.5">Établi par</div>
          <div className="border-t border-black pt-1.5">Approuvé par (responsable qualité)</div>
        </div>

        <footer className="mt-8 border-t border-[#e0e0e0] pt-3 text-[9px] leading-relaxed text-[#6b6b6b]">
          <p>
            Document généré par Labstock le {formatDateTime(new Date().toISOString())}.
            {analysis.updated_at
              ? ` Configuration modifiée le ${formatDateTime(analysis.updated_at)}${analysis.updated_by ? ` par ${analysis.updated_by}` : ""}.`
              : ""}{" "}
            Les lignes « selon règle » ne sont pas déstockées automatiquement.
          </p>
        </footer>
      </article>
    </main>
  );
}
