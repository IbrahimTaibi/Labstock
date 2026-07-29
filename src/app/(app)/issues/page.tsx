import { CalendarClock, Printer } from "lucide-react";
import { PageHeader } from "@/components/shell/PageHeader";
import { IssuesWorkspace } from "@/components/issues/IssuesWorkspace";
import { getIssueWorkspace, summarize } from "@/lib/issues";
import { formatDateTime } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function IssuesPage() {
  const data = await getIssueWorkspace();
  const totals = summarize(data);

  return (
    <main className="mx-auto w-full max-w-[1500px] p-4 md:p-5">
      <PageHeader
        title="Gestion des sorties de stock"
        subtitle="Sortie de consommables liée aux analyses prescrites (intégration LIS)"
        alertCount={totals.shortages.length}
        actions={
          <>
            <div className="card flex items-center gap-2 px-3 py-2 text-[11px]">
              <CalendarClock
                size={14}
                className="text-[var(--text-muted)]"
                aria-hidden
              />
              <div className="leading-tight">
                <div className="text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
                  Dernier import
                </div>
                <div className="tnum font-medium text-[var(--text-primary)]">
                  {data.lastSync ? formatDateTime(data.lastSync) : "—"}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="card flex items-center gap-2 px-3 py-2.5 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--page)]"
            >
              <Printer size={14} aria-hidden />
              Aperçu avant impression
            </button>
          </>
        }
      />

      <IssuesWorkspace data={data} />
    </main>
  );
}
