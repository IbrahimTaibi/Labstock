import { PageHeader } from "@/components/shell/PageHeader";
import { InvoicesWorkspace } from "@/components/invoices/InvoicesWorkspace";
import type { StatusFilter } from "@/components/invoices/InvoicesWorkspace";
import { getInvoicesWorkspace } from "@/lib/invoices";

export const dynamic = "force-dynamic";

/* Filtre d'arrivée, pour les liens du tableau de bord (?statut=overdue). */
const STATUS_PARAMS: Record<string, StatusFilter> = {
  overdue: "overdue",
  pending: "pending",
  paid: "paid",
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const { statut } = await searchParams;
  const data = await getInvoicesWorkspace();

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Factures fournisseurs"
        subtitle="Suivi des factures : encours, échéances et règlements"
      />

      <InvoicesWorkspace
        data={data}
        initialStatus={(statut && STATUS_PARAMS[statut]) || "all"}
      />
    </main>
  );
}
