import type { DeliveryEvaluation } from "./types";

export const QUALITY_OPTIONS = [
  "Produits conformes",
  "Livraison parfaite",
  "Quantité incomplète",
  "Emballage endommagé",
  "Produits non conformes",
  "Erreur de référence",
  "Documents manquants",
];

export const REMARK_OPTIONS = [
  "Livraison parfaite",
  "Petit retard signalé",
  "Retard moyen",
  "Retard à justifier",
  "Retard grave",
  "Livraison partielle",
  "Non-conformité signalée",
];

export const DELAY_CAUSE_OPTIONS = [
  "Retard de la société de transport",
  "Rupture de stock fournisseur",
  "Retard de dédouanement",
  "Erreur de commande",
  "Problème administratif",
  "Autre",
];

/** Retard en jours, jamais négatif : une avance compte comme « à l'heure ». */
export function delayBetween(expected: string, delivered: string) {
  const ms = Date.parse(`${delivered}T00:00:00Z`) - Date.parse(`${expected}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 86_400_000)) : 0;
}

/** Miroir de la colonne générée `delivery_evaluations.auto_score`. */
export function autoScore(delay: number, conforming: boolean) {
  const penalty = delay <= 0 ? 0 : delay <= 2 ? 1 : delay <= 5 ? 2 : 3;
  return Math.max(1, 5 - penalty - (conforming ? 0 : 2));
}

/** Remarque proposée d'après le retard, modifiable. */
export function suggestedRemark(delay: number, conforming: boolean) {
  if (!conforming) return "Non-conformité signalée";
  if (delay <= 0) return "Livraison parfaite";
  if (delay <= 2) return "Petit retard signalé";
  if (delay <= 5) return "Retard moyen";
  return "Retard grave";
}

export const DELAY_BUCKETS = [
  { key: "on_time", label: "À l'heure", color: "var(--good)", test: (d: number) => d <= 0 },
  { key: "d1_2", label: "1 – 2 jours", color: "var(--warning)", test: (d: number) => d >= 1 && d <= 2 },
  { key: "d3_5", label: "3 – 5 jours", color: "var(--series-2)", test: (d: number) => d >= 3 && d <= 5 },
  { key: "over5", label: "> 5 jours", color: "var(--critical)", test: (d: number) => d > 5 },
] as const;

export function evaluationStats(evaluations: DeliveryEvaluation[]) {
  const count = evaluations.length;
  const conforming = evaluations.filter((e) => e.conforming).length;
  const onTime = evaluations.filter((e) => e.delay_days <= 0).length;
  const sum = (pick: (e: DeliveryEvaluation) => number) =>
    evaluations.reduce((total, e) => total + pick(e), 0);

  return {
    count,
    conforming,
    nonConforming: count - conforming,
    onTime,
    late: count - onTime,
    avgRating: count === 0 ? 0 : sum((e) => e.rating) / count,
    avgDelay: count === 0 ? 0 : sum((e) => e.delay_days) / count,
    conformityRate: count === 0 ? 0 : conforming / count,
    buckets: DELAY_BUCKETS.map((bucket) => ({
      ...bucket,
      count: evaluations.filter((e) => bucket.test(e.delay_days)).length,
    })),
  };
}
