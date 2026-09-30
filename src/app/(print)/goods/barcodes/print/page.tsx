import type { Metadata } from "next";
import { PrintToolbar } from "@/components/invoices/PrintButton";
import { LotBarcode } from "@/components/goods/Barcode";
import { getCurrentUser } from "@/lib/auth";
import { getLots } from "@/lib/lots";
import { formatDate, formatInt } from "@/lib/utils";
import type { Lot } from "@/lib/types";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  /* Le titre devient le nom du PDF proposé par le navigateur. */
  title: "Étiquettes codes-barres",
};

type Search = Promise<{ [key: string]: string | string[] | undefined }>;

function readParam(
  params: { [key: string]: string | string[] | undefined },
  key: string
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Planche d'étiquettes GS1-128, 3 par ligne, prête à coller sur les
 * contenants. Le périmètre vient de l'URL : soit une sélection explicite
 * (`?ids=`), soit un lot unique, soit tous les lots encore consommables.
 */
export default async function BarcodeSheetPage({
  searchParams,
}: {
  searchParams: Search;
}) {
  const params = await searchParams;
  const rawIds = readParam(params, "ids");
  const scope = readParam(params, "scope");
  const copies = Math.min(
    Math.max(Number(readParam(params, "copies") ?? 1) || 1, 1),
    /* Garde-fou : une faute de frappe dans l'URL ne doit pas engendrer
       une planche de plusieurs milliers de pages. */
    10
  );

  const [allLots, user] = await Promise.all([getLots(), getCurrentUser()]);

  const wanted = new Set(
    (rawIds ?? "")
      .split(",")
      .map((part) => Number(part.trim()))
      .filter(Number.isInteger)
  );

  let lots: Lot[];
  if (wanted.size > 0) {
    lots = allLots.filter((lot) => wanted.has(lot.id));
  } else if (scope === "active") {
    lots = allLots.filter((lot) => lot.fefo_rank === 1);
  } else {
    /* Par défaut on n'étiquette pas les lots périmés : coller un
       code-barres sur un contenant à retirer entretient la confusion. */
    lots = allLots.filter((lot) => !lot.is_expired);
  }

  /* Un lot peut demander plusieurs exemplaires de la même étiquette. */
  const labels = lots.flatMap((lot) =>
    Array.from({ length: copies }, (_, copy) => ({ lot, copy }))
  );

  return (
    <main className="min-h-screen bg-[var(--page)] p-4 print:bg-white print:p-0">
      <PrintToolbar backHref="/goods" backLabel="Retour aux marchandises">
        <span className="text-[11px] text-[var(--text-muted)]">
          {formatInt(labels.length)} étiquette
          {labels.length > 1 ? "s" : ""}
          {copies > 1 ? ` (${copies} exemplaires par lot)` : ""}
        </span>
      </PrintToolbar>

      <article className="mx-auto w-full max-w-[820px] bg-white p-8 text-black shadow-sm print:max-w-none print:p-0 print:shadow-none">
        <header className="mb-4 flex items-baseline justify-between border-b-2 border-black pb-2 print:mb-3">
          <h1 className="text-[15px] font-bold">Étiquettes de lots</h1>
          <p className="text-[10px] text-[#6b6b6b]">
            {user?.labName ?? "Laboratoire"} · GS1-128
          </p>
        </header>

        {labels.length === 0 ? (
          <p className="py-10 text-center text-[11px] text-[#6b6b6b]">
            Aucun lot à étiqueter pour cette sélection.
          </p>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {labels.map(({ lot, copy }) => (
              <section
                key={`${lot.id}-${copy}`}
                /* `break-inside-avoid` : une étiquette coupée en deux par un
                   saut de page est une étiquette perdue. */
                className="flex break-inside-avoid flex-col justify-between rounded border border-black p-2"
                style={{ minHeight: "108px" }}
              >
                <div>
                  <p className="text-[9px] font-bold leading-tight">
                    {lot.product_name}
                  </p>
                  <p className="text-[7px] leading-tight text-[#4a4a4a]">
                    {lot.internal_ref ?? "sans réf."}
                    {lot.packaging ? ` · ${lot.packaging}` : ""}
                  </p>
                </div>

                <div className="my-1 overflow-hidden">
                  <LotBarcode
                    lotNumber={lot.lot_number}
                    expiryDate={lot.expiry_date}
                    internalRef={lot.internal_ref}
                    moduleWidth={1}
                    height={30}
                  />
                </div>

                <div className="flex items-end justify-between gap-1">
                  <p className="text-[7px] leading-tight text-[#4a4a4a]">
                    {lot.supplier}
                  </p>
                  <p className="tnum text-[8px] font-bold leading-tight">
                    Exp. {formatDate(lot.expiry_date)}
                  </p>
                </div>
              </section>
            ))}
          </div>
        )}
      </article>
    </main>
  );
}
