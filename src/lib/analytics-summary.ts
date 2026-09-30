import type {
  AnalyticsFilters,
  AnalyticsRow,
  AnalyticsTotals,
  AnalyticsStatus,
} from "./types";

/**
 * Filtrage et agrégats de l'inventaire analytique.
 *
 * Module volontairement pur : importé côté client comme côté serveur, il ne
 * doit tirer aucune dépendance serveur. C'est ce qui permet aux filtres de
 * recalculer KPI, tableau et graphiques sans aller-retour réseau.
 */
export function applyFilters(
  rows: AnalyticsRow[],
  filters: AnalyticsFilters,
  search = ""
): AnalyticsRow[] {
  const needle = search.trim().toLowerCase();

  return rows.filter((row) => {
    if (needle) {
      const haystack = `${row.reference} ${row.product_name}`.toLowerCase();
      if (!haystack.includes(needle)) return false;
    }

    if (filters.status !== "all" && row.status !== filters.status) return false;
    if (filters.category && row.category !== filters.category) return false;
    if (filters.supplier && row.supplier !== filters.supplier) return false;

    /* Un article sans consommation a une couverture indéfinie : il ne peut
       satisfaire ni une borne basse ni une borne haute, on l'écarte dès
       qu'une borne est posée plutôt que de le faire passer pour conforme. */
    if (filters.coverageMin !== null || filters.coverageMax !== null) {
      if (row.coverage_days === null) return false;
      if (filters.coverageMin !== null && row.coverage_days < filters.coverageMin) {
        return false;
      }
      if (filters.coverageMax !== null && row.coverage_days > filters.coverageMax) {
        return false;
      }
    }

    return true;
  });
}

const EMPTY_STATUS: Record<AnalyticsStatus, number> = {
  sain: 0,
  alerte: 0,
  rupture: 0,
  surstock: 0,
};

export function summarize(
  rows: AnalyticsRow[],
  catalogueArticles: number
): AnalyticsTotals {
  const byStatus = { ...EMPTY_STATUS };
  const categories = new Map<string, number>();

  let totalValue = 0;
  let safetyValue = 0;
  let alertValue = 0;

  for (const row of rows) {
    totalValue += row.stock_value;
    byStatus[row.status] += 1;
    categories.set(row.category, (categories.get(row.category) ?? 0) + row.stock_value);

    /* Le stock de sécurité est valorisé à hauteur du tampon réellement
       détenu : au-delà du stock présent, il n'existe pas. */
    safetyValue += Math.min(row.stock_final, row.safety_stock) * row.cump;

    if (row.status === "alerte" || row.status === "rupture") {
      alertValue += row.stock_value;
    }
  }

  return {
    totalValue,
    /* Stock direct = ce qui reste consommable une fois le tampon réservé. */
    directValue: Math.max(totalValue - safetyValue, 0),
    safetyValue,
    alertValue,
    articles: rows.length,
    catalogueArticles,
    byStatus,
    byCategory: [...categories.entries()]
      .map(([category, value]) => ({ category, value }))
      .sort((a, b) => b.value - a.value),
  };
}

/** Libellés et couleurs des statuts, partagés par le tableau et le donut. */
export const STATUS_META: Record<
  AnalyticsStatus,
  { label: string; color: string }
> = {
  sain: { label: "SAIN", color: "var(--good)" },
  alerte: { label: "ALERTE", color: "var(--serious)" },
  rupture: { label: "RUPTURE", color: "var(--critical)" },
  surstock: { label: "SUR-STOCK", color: "var(--series-1)" },
};

/** Interprétation de l'indice de rotation (§6.4). */
export function rotationBand(rotation: number | null): {
  label: string;
  hint: string;
  color: string;
} {
  if (rotation === null) {
    return {
      label: "Non calculable",
      hint: "Aucun stock moyen sur la période",
      color: "var(--text-muted)",
    };
  }
  if (rotation > 1) {
    return {
      label: "Rotation rapide",
      hint: "Stock qui tourne vite : risque de rupture",
      color: "var(--good)",
    };
  }
  if (rotation >= 0.5) {
    return {
      label: "Rotation saine",
      hint: "Stock en bonne rotation",
      color: "var(--series-1)",
    };
  }
  if (rotation >= 0.3) {
    return {
      label: "Rotation modérée",
      hint: "Écoulement ralenti, à surveiller",
      color: "var(--serious)",
    };
  }
  return {
    label: "Rotation lente",
    hint: "Stock dormant : risque de péremption",
    color: "var(--critical)",
  };
}
