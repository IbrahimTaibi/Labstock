import { PageHeader } from "@/components/shell/PageHeader";
import { OrdersWorkspace } from "@/components/orders/OrdersWorkspace";
import { getOrdersWorkspace } from "@/lib/purchase-orders";

export const dynamic = "force-dynamic";

/**
 * Bon de commande. `?order=<id>` ouvre un B.C. existant — un panier en
 * préparation se reprend là où on l'a laissé, une commande passée se
 * consulte en lecture seule.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const { order } = await searchParams;
  const orderId = order ? Number(order) : undefined;
  const data = await getOrdersWorkspace(orderId);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Bon de commande (B.C.)"
        subtitle="Création et gestion des bons de commande à partir des D.A. validées"
      />

      {/* La clé remonte le composant à chaque changement de B.C. : sans elle,
          l'en-tête du formulaire garderait les valeurs du B.C. précédent. */}
      <OrdersWorkspace key={data.current?.id ?? "new"} data={data} />
    </main>
  );
}
