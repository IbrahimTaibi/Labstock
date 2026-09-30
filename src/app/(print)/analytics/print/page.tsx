import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { getCurrentUser } from "@/lib/auth";
import { getAnalyticsWorkspace } from "@/lib/analytics";
import { applyFilters, summarize, STATUS_META } from "@/lib/analytics-summary";
import { formatAmount, formatDateTime, formatInt } from "@/lib/utils";
import type { AnalyticsFilters, AnalyticsStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  title: "Inventaire analytique",
};

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

function readParam(
  params: { [key: string]: string | string[] | undefined },
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const decimal = (value: number, digits = 2) =>
  value.toFixed(digits).replace(".", ",");

/**
 * Version imprimable du tableau analytique (§5.1, bouton PDF). Les filtres
 * voyagent dans l'URL pour que la feuille reproduise exactement ce que
 * l'écran affichait au moment du clic — §9 l'exige.
 */
export default async function AnalyticsPrintPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const [data, user] = await Promise.all([
    getAnalyticsWorkspace(),
    getCurrentUser(),
  ]);

  const status = readParam(params, "status");
  const min = readParam(params, "min");
  const max = readParam(params, "max");

  const filters: AnalyticsFilters = {
    coverageMin: min ? Number(min) : null,
    coverageMax: max ? Number(max) : null,
    status: (status as AnalyticsStatus) ?? "all",
    category: readParam(params, "category") ?? "",
    supplier: readParam(params, "supplier") ?? "",
  };

  const search = readParam(params, "q") ?? "";
  const rows = applyFilters(data.rows, filters, search);
  const totals = summarize(rows, data.catalogueArticles);

  const active = [
    filters.status !== "all" ? `statut ${STATUS_META[filters.status].label}` : null,
    filters.category ? `catégorie ${filters.category}` : null,
    filters.supplier ? `fournisseur ${filters.supplier}` : null,
    filters.coverageMin !== null ? `couverture ≥ ${filters.coverageMin} j` : null,
    filters.coverageMax !== null ? `couverture ≤ ${filters.coverageMax} j` : null,
    search ? `recherche « ${search} »` : null,
  ].filter(Boolean) as string[];

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/analytics" backLabel="Retour à l'analyse" />

      <article className="mx-auto w-full max-w-[1000px] bg-white p-8 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="flex items-start justify-between gap-8 border-b-2 border-black pb-3">
          <div>
            <h1 className="text-[18px] font-bold leading-tight">
              Inventaire analytique
            </h1>
            <p className="mt-0.5 text-[10px] text-[#4a4a4a]">
              {active.length > 0
                ? `Filtres : ${active.join(" · ")}`
                : "Catalogue complet, sans filtre"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[9px] uppercase tracking-wider text-[#6b6b6b]">
              Laboratoire
            </p>
            <p className="text-[12px] font-semibold">
              {user?.labName ?? "Laboratoire"}
            </p>
          </div>
        </header>

        <section className="mt-4 grid grid-cols-5 gap-3 border-b border-[#d8d8d8] pb-3">
          <Stat label="Valeur totale" value={`${formatAmount(totals.totalValue)} DT`} />
          <Stat label="Stock direct" value={`${formatAmount(totals.directValue)} DT`} />
          <Stat label="Stock sécurité" value={`${formatAmount(totals.safetyValue)} DT`} />
          <Stat label="Stock alerte" value={`${formatAmount(totals.alertValue)} DT`} />
          <Stat label="Articles" value={formatInt(totals.articles)} />
        </section>

        <table className="mt-4 w-full border-collapse text-[9px]">
          <thead>
            <tr className="border-b border-black">
              <th className="py-1 text-left font-bold">Réf.</th>
              <th className="py-1 text-left font-bold">Désignation</th>
              <th className="py-1 text-right font-bold">Init.</th>
              <th className="py-1 text-right font-bold">Entrées</th>
              <th className="py-1 text-right font-bold">Sorties</th>
              <th className="py-1 text-right font-bold">Final</th>
              <th className="py-1 text-right font-bold">CMJ 30j</th>
              <th className="py-1 text-right font-bold">CMJ 90j</th>
              <th className="py-1 text-right font-bold">Couv.</th>
              <th className="py-1 text-right font-bold">Rot.</th>
              <th className="py-1 text-left font-bold">Statut</th>
              <th className="py-1 text-right font-bold">À cmder</th>
              <th className="py-1 text-right font-bold">Valeur</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.product_id} className="border-b border-[#e4e4e4]">
                <td className="py-1 font-medium">{row.reference}</td>
                <td className="py-1">{row.product_name}</td>
                <td className="tnum py-1 text-right">{formatInt(row.stock_initial)}</td>
                <td className="tnum py-1 text-right">{formatInt(row.entries)}</td>
                <td className="tnum py-1 text-right">{formatInt(row.exits)}</td>
                <td className="tnum py-1 text-right font-semibold">
                  {formatInt(row.stock_final)}
                </td>
                <td className="tnum py-1 text-right">{decimal(row.cmj_short)}</td>
                <td className="tnum py-1 text-right">{decimal(row.cmj_long)}</td>
                <td className="tnum py-1 text-right">
                  {row.coverage_days === null ? "—" : decimal(row.coverage_days, 0)}
                </td>
                <td className="tnum py-1 text-right">
                  {row.rotation === null ? "—" : decimal(row.rotation)}
                </td>
                <td className="py-1 font-semibold">
                  {STATUS_META[row.status].label}
                </td>
                <td className="tnum py-1 text-right">
                  {row.order_quantity > 0 ? formatInt(row.order_quantity) : "—"}
                </td>
                <td className="tnum py-1 text-right">
                  {row.order_value > 0 ? formatAmount(row.order_value) : "—"}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={13} className="py-6 text-center text-[#6b6b6b]">
                  Aucun article ne correspond à ces filtres.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>

        <p className="mt-5 text-[9px] leading-relaxed text-[#6b6b6b]">
          Édité le {formatDateTime(new Date().toISOString())}. Couverture et
          rotation calculées sur 90 jours ; CMJ courte sur 30 jours. Valeurs
          en dinars tunisiens, au coût unitaire moyen pondéré des réceptions.
        </p>
      </article>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-wider text-[#6b6b6b]">{label}</p>
      <p className="tnum text-[12px] font-bold">{value}</p>
    </div>
  );
}
