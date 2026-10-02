import type { DebtStatus } from "./types";

/* Constantes partagées par le serveur (agrégats) et le client (filtres,
   légende). Volontairement hors de `lib/debts.ts` : ce module-là importe le
   client Supabase serveur, et l'importer depuis un composant client
   embarquerait tout cela dans le bundle navigateur. */

/** Ordre d'affichage, du plus sain au plus critique (§7.1). */
export const DEBT_STATUS_ORDER: DebtStatus[] = [
  "not_due",
  "late_1_30",
  "late_31_60",
  "late_61_90",
  "late_90_plus",
  "no_due_date",
  "paid",
];

/** Tranches considérées comme échues : solde dû et échéance dépassée. */
export const OVERDUE_STATUSES: DebtStatus[] = [
  "late_1_30",
  "late_31_60",
  "late_61_90",
  "late_90_plus",
];

/** Échues de plus de 30 jours, pour le sous-texte de « Dettes échues ». */
export const OVER_30_STATUSES: DebtStatus[] = [
  "late_31_60",
  "late_61_90",
  "late_90_plus",
];
