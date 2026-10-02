import { PageHeader } from "@/components/shell/PageHeader";
import { PaymentsWorkspace } from "@/components/debts/PaymentsWorkspace";
import { getDebtsWorkspace } from "@/lib/debts";

export const dynamic = "force-dynamic";

/**
 * Écran de règlement. `?invoice=supplier:12` pré-sélectionne la facture :
 * c'est le lien depuis l'écran des dettes, les deux écrans formant un même
 * parcours (§9.5 du cahier des charges).
 */
export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ invoice?: string }>;
}) {
  const [{ invoice }, data] = await Promise.all([
    searchParams,
    getDebtsWorkspace(),
  ]);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Règlement des dettes fournisseurs"
        subtitle="Enregistrement des paiements et suivi des règlements"
      />

      <PaymentsWorkspace data={data} initialKey={invoice} />
    </main>
  );
}
