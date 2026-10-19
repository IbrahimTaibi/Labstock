import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const numberFormat = new Intl.NumberFormat("fr-FR");

export function formatInt(n: number) {
  return numberFormat.format(Math.round(n));
}

/** Montant en dinars tunisiens, arrondi à l'unité. */
export function formatAmount(n: number) {
  return numberFormat.format(Math.round(n));
}

const tndFormat = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 3,
  maximumFractionDigits: 3,
});

/** Prix en dinars au millime près : 45,250. */
export function formatTnd(n: number) {
  return tndFormat.format(n);
}

/** Préfixe des références article générées automatiquement. */
export const ARTICLE_PREFIX = "ARTICLE-";

/** Référence suivant la plus haute ARTICLE-NNNN existante. */
export function nextArticleReference(references: (string | null)[]) {
  const pattern = new RegExp(`^${ARTICLE_PREFIX}(\\d+)$`);
  const max = references.reduce((highest, ref) => {
    const match = ref ? pattern.exec(ref) : null;
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return `${ARTICLE_PREFIX}${String(max + 1).padStart(4, "0")}`;
}

export function formatCompact(n: number) {
  if (Math.abs(n) >= 1_000_000)
    return (n / 1_000_000).toFixed(1).replace(".", ",") + "M";
  if (Math.abs(n) >= 1_000) return Math.round(n / 1_000) + "K";
  return numberFormat.format(n);
}

export function formatPercent(n: number, digits = 1) {
  return n.toFixed(digits).replace(".", ",") + " %";
}

const MONTHS = [
  "Jan", "Fév", "Mar", "Avr", "Mai", "Juin",
  "Juil", "Août", "Sep", "Oct", "Nov", "Déc",
];

/* Les séries du tableau de bord sont soit mensuelles ("2026-07"), soit
   journalières ("2026-07-22") selon la durée de la période choisie. Les deux
   formats se distinguent au nombre de segments. */

/** "2026-07" -> "Juil 2026" ; "2026-07-22" -> "22 Juil 2026" */
export function formatBucket(iso: string) {
  const [year, month, day] = iso.split("-");
  const label = `${MONTHS[Number(month) - 1]} ${year}`;
  return day ? `${Number(day)} ${label}` : label;
}

/** "2026-07" -> "Juil" ; "2026-07-22" -> "22/07" */
export function formatBucketShort(iso: string) {
  const [, month, day] = iso.split("-");
  return day ? `${day}/${month}` : MONTHS[Number(month) - 1];
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("fr-FR");
}

/** "2026-06-26T10:30:00Z" -> "26/06/2026 10:30" */
export function formatDateTime(iso: string) {
  const date = new Date(iso);
  return `${date.toLocaleDateString("fr-FR")} ${date.toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  })}`;
}
