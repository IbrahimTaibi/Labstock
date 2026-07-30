import { PageHeader } from "@/components/shell/PageHeader";
import { ProductsWorkspace } from "@/components/products/ProductsWorkspace";
import type { StateFilter } from "@/components/products/ProductsWorkspace";
import { getProductsWorkspace } from "@/lib/products";

export const dynamic = "force-dynamic";

/* Filtre d'arrivée, pour les liens du tableau de bord (?etat=alerte). */
const STATE_PARAMS: Record<string, StateFilter> = {
  alerte: "alert",
  faible: "low",
  rupture: "out",
  disponible: "ok",
};

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ etat?: string }>;
}) {
  const { etat } = await searchParams;
  const data = await getProductsWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Produits"
        subtitle="Catalogue du laboratoire : références, seuils et valorisation"
        alertCount={data.totals.low_count + data.totals.out_count}
      />

      <ProductsWorkspace
        data={data}
        initialState={(etat && STATE_PARAMS[etat]) || "all"}
      />
    </main>
  );
}
