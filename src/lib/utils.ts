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
