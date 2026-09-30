import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getIssueWorkspace } from "@/lib/issues";
import { formatDate, formatDateTime, formatInt } from "@/lib/utils";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  title: "Sortie de stock — aperçu",
};

/**
 * Aperçu avant impression (§6.2) : la feuille de prélèvement de la sortie
 * en cours. Elle montre l'état *proposé*, avant toute déduction — d'où le
 * bandeau qui le rappelle, pour qu'une feuille imprimée ne soit jamais
 * confondue avec un bon de sortie validé.
 */
export default async function IssuePreviewPage() {
  const [data, user] = await Promise.all([getIssueWorkspace(), getCurrentUser()]);

  const totalSamples = data.analyses.reduce(
    (sum, row) => sum + row.sample_count,
    0
  );
  const totalQuantity = data.consumables.reduce(
    (sum, row) => sum + row.required_quantity,
    0
  );
  const shortages = data.consumables.filter((row) => !row.is_available);

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/issues" backLabel="Retour aux sorties" />

      <article className="mx-auto w-full max-w-[820px] bg-white p-10 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-4">
          <div>
            <h1 className="text-[20px] font-bold leading-tight">
              Sortie de consommables
            </h1>
            <p className="mt-0.5 text-[11px] text-[#4a4a4a]">
              Feuille de prélèvement — analyses prescrites en attente
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">
              Laboratoire
            </p>
            <p className="text-[12px] font-semibold">
              {user?.labName ?? "Laboratoire"}
            </p>
            <p className="tnum mt-1 text-[10px] text-[#4a4a4a]">
              Édité par {user?.fullName ?? "—"}
            </p>
          </div>
        </header>

        <p className="mt-4 rounded border border-[#c9822f] bg-[#fdf3e7] px-3 py-2 text-[10px] leading-relaxed text-[#8a5410]">
          Document de préparation. Le stock n&apos;est pas encore déduit :
          la sortie doit être validée dans LABSTOCK, où elle sera signée et
          horodatée.
        </p>

        <section className="mt-5 grid grid-cols-4 gap-4 border-b border-[#d8d8d8] pb-3">
          <Stat label="Analyses" value={formatInt(data.analyses.length)} />
          <Stat label="Échantillons" value={formatInt(totalSamples)} />
          <Stat label="Références" value={formatInt(data.consumables.length)} />
          <Stat label="Unités à sortir" value={formatInt(totalQuantity)} />
        </section>

        <h2 className="mt-5 text-[11px] font-bold uppercase tracking-wider text-[#6b6b6b]">
          Analyses prescrites
        </h2>
        <table className="mt-1.5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1.5 text-left font-bold">Code</th>
              <th className="py-1.5 text-left font-bold">Analyse</th>
              <th className="py-1.5 text-left font-bold">Section</th>
              <th className="py-1.5 text-right font-bold">Échantillons</th>
            </tr>
          </thead>
          <tbody>
            {data.analyses.map((row) => (
              <tr key={row.id} className="border-b border-[#e4e4e4]">
                <td className="py-1.5 font-medium">{row.code}</td>
                <td className="py-1.5">{row.name}</td>
                <td className="py-1.5 text-[#4a4a4a]">{row.section}</td>
                <td className="tnum py-1.5 text-right">
                  {formatInt(row.sample_count)}
                </td>
              </tr>
            ))}
            {data.analyses.length === 0 ? (
              <tr>
                <td colSpan={4} className="py-4 text-center text-[#6b6b6b]">
                  Aucune analyse en attente.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <h2 className="mt-6 text-[11px] font-bold uppercase tracking-wider text-[#6b6b6b]">
          Consommables à prélever
        </h2>
        <table className="mt-1.5 w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1.5 text-left font-bold">Consommable</th>
              <th className="py-1.5 text-left font-bold">Référence</th>
              <th className="py-1.5 text-left font-bold">Lot (FEFO)</th>
              <th className="py-1.5 text-left font-bold">Péremption</th>
              <th className="py-1.5 text-right font-bold">Qté</th>
              <th className="py-1.5 text-center font-bold">Prélevé</th>
            </tr>
          </thead>
          <tbody>
            {data.consumables.map((row) => (
              <tr key={row.product_id} className="border-b border-[#e4e4e4]">
                <td className="py-1.5 font-medium">{row.product_name}</td>
                <td className="py-1.5">{row.reference ?? "—"}</td>
                <td className="py-1.5">{row.lot_number ?? "—"}</td>
                <td className="tnum py-1.5">
                  {row.expiry_date ? formatDate(row.expiry_date) : "—"}
                </td>
                <td className="tnum py-1.5 text-right font-semibold">
                  {formatInt(row.required_quantity)}
                  {row.is_available ? "" : " ⚠"}
                </td>
                {/* Case à cocher matérielle : la feuille sert au comptage
                    physique avant retour à l'écran de validation. */}
                <td className="py-1.5 text-center">
                  <span className="inline-block h-3 w-3 border border-black" />
                </td>
              </tr>
            ))}
            {data.consumables.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-4 text-center text-[#6b6b6b]">
                  Aucun consommable à déduire.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        {shortages.length > 0 ? (
          <p className="mt-3 rounded border border-[#b03030] bg-[#fdeaea] px-3 py-2 text-[10px] leading-relaxed text-[#8a1f1f]">
            ⚠ Stock insuffisant pour {formatInt(shortages.length)} référence
            {shortages.length > 1 ? "s" : ""} :{" "}
            {shortages.map((row) => row.product_name).join(", ")}. La sortie
            sera refusée tant que le stock ne couvre pas le besoin.
          </p>
        ) : null}

        <div className="mt-8 flex justify-between gap-8 text-[10px]">
          <div className="flex-1">
            <p className="text-[#6b6b6b]">Prélevé par</p>
            <div className="mt-6 border-t border-black pt-1 text-[9px] text-[#6b6b6b]">
              Nom et signature
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[#6b6b6b]">Vérifié par</p>
            <div className="mt-6 border-t border-black pt-1 text-[9px] text-[#6b6b6b]">
              Nom et signature
            </div>
          </div>
        </div>

        <p className="mt-5 text-[9px] text-[#6b6b6b]">
          Édité le {formatDateTime(new Date().toISOString())} depuis LABSTOCK.
          Lots proposés selon la règle FEFO à cette date.
        </p>
      </article>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">{label}</p>
      <p className="tnum text-[15px] font-bold">{value}</p>
    </div>
  );
}
