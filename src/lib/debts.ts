import {
  DEBT_STATUS_ORDER,
  OVERDUE_STATUSES,
  OVER_30_STATUSES,
} from "./debt-status";
import { createClient } from "./supabase/server";
import type {
  DebtAgeingSlice,
  DebtCreditorTotal,
  DebtRow,
  DebtStatus,
  DebtTotals,
  DebtsWorkspaceData,
  PaymentRow,
} from "./types";

/**
 * Dettes du laboratoire, leurs règlements et les agrégats des deux écrans du
 * parcours. Les KPI, le donut et le Top 5 sont dérivés de la même liste : le
 * cahier des charges exige qu'ils ne puissent pas diverger (§2, §9.1).
 *
 * Le RLS cadre la lecture au laboratoire : une dette d'un autre laboratoire
 * est simplement introuvable.
 */
export async function getDebtsWorkspace(): Promise<DebtsWorkspaceData> {
  const supabase = await createClient();

  /* PostgREST plafonne une réponse à 1 000 lignes. Sans pagination, les
     totaux ne porteraient que sur une partie des dettes et seraient faux —
     le même piège que sur l'écran Factures. */
  const PAGE = 1000;

  const debts: DebtRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await supabase
      .from("supplier_debts_view")
      .select("*")
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("invoice_id", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (page.error)
      throw new Error(`Chargement des dettes : ${page.error.message}`);

    debts.push(
      ...(page.data ?? []).map((row) => ({
        ...row,
        amount_due: Number(row.amount_due),
        amount_paid: Number(row.amount_paid),
        balance: Number(row.balance),
        days_late: row.days_late === null ? null : Number(row.days_late),
      }))
    );
    if ((page.data?.length ?? 0) < PAGE) break;
  }

  const payments: PaymentRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const page = await supabase
      .from("supplier_payment_history_view")
      .select("*")
      .order("paid_at", { ascending: false })
      .order("payment_id", { ascending: false })
      .range(offset, offset + PAGE - 1);

    if (page.error)
      throw new Error(`Chargement des règlements : ${page.error.message}`);

    payments.push(
      ...(page.data ?? []).map((row) => ({
        ...row,
        amount: Number(row.amount),
      }))
    );
    if ((page.data?.length ?? 0) < PAGE) break;
  }

  /* §3 — les 5 cartes. « Montant payé » ne somme que les règlements encore
     valides : une contre-passation doit faire remonter la dette, sinon
     l'annulation n'annulerait rien à l'écran. */
  const totals: DebtTotals = {
    count: debts.length,
    amount_due: 0,
    amount_paid: 0,
    balance: 0,
    overdue_count: 0,
    overdue_over_30: 0,
  };

  const byStatus = new Map<DebtStatus, DebtAgeingSlice>();
  const byCreditor = new Map<string, DebtCreditorTotal>();

  for (const debt of debts) {
    totals.amount_due += debt.amount_due;
    totals.amount_paid += debt.amount_paid;
    totals.balance += debt.balance;
    if (OVERDUE_STATUSES.includes(debt.status)) totals.overdue_count += 1;
    if (OVER_30_STATUSES.includes(debt.status)) totals.overdue_over_30 += 1;

    const slice = byStatus.get(debt.status) ?? {
      status: debt.status,
      count: 0,
      balance: 0,
    };
    slice.count += 1;
    slice.balance += debt.balance;
    byStatus.set(debt.status, slice);

    /* §7.2 — le Top 5 classe par montant restant dû : une facture soldée ne
       pèse plus rien et n'a rien à y faire. */
    if (debt.balance > 0) {
      const creditor = byCreditor.get(debt.creditor) ?? {
        creditor: debt.creditor,
        balance: 0,
        invoices: 0,
      };
      creditor.balance += debt.balance;
      creditor.invoices += 1;
      byCreditor.set(debt.creditor, creditor);
    }
  }

  const ageing = DEBT_STATUS_ORDER.map((status) => byStatus.get(status)).filter(
    (slice): slice is DebtAgeingSlice => slice !== undefined
  );

  const topCreditors = [...byCreditor.values()]
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  return { debts, payments, totals, ageing, topCreditors };
}
