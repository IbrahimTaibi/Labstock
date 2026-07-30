import type { InventoryLine } from "./types";

/**
 * Agrégats d'un comptage. Module volontairement pur : il est importé côté
 * client comme côté serveur, il ne doit donc tirer aucune dépendance
 * serveur (`next/headers`, client Supabase…).
 */
export function summarizeCount(lines: InventoryLine[]) {
  const counted = lines.filter((line) => line.is_counted);
  const discrepancies = counted.filter((line) => (line.variance_units ?? 0) !== 0);

  return {
    total: lines.length,
    counted: counted.length,
    remaining: lines.length - counted.length,
    discrepancies: discrepancies.length,
    varianceUnits: counted.reduce((sum, line) => sum + (line.variance_units ?? 0), 0),
    varianceValue: counted.reduce((sum, line) => sum + (line.variance_value ?? 0), 0),
    /* Pertes et surplus séparés : leur somme se compense et masquerait
       l'ampleur réelle des écarts. */
    shrinkage: counted
      .filter((line) => (line.variance_units ?? 0) < 0)
      .reduce((sum, line) => sum + (line.variance_value ?? 0), 0),
    surplus: counted
      .filter((line) => (line.variance_units ?? 0) > 0)
      .reduce((sum, line) => sum + (line.variance_value ?? 0), 0),
  };
}
