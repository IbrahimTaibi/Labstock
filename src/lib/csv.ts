type Cell = string | number | null | undefined;

/**
 * Sérialise une matrice en CSV point-virgule : c'est le séparateur attendu
 * par Excel en locale française, où la virgule est le séparateur décimal.
 * Toutes les cellules sont guillemetées, ce qui neutralise séparateurs et
 * retours à la ligne présents dans un libellé.
 */
export function toCsv(rows: Cell[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`)
        .join(";")
    )
    .join("\r\n");
}

/** Nombre en notation française, pour rester saisissable dans Excel FR. */
export function csvNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value))
    return "";
  return String(value).replace(".", ",");
}

/** `labstock-produits-2026-07-31.csv` */
export function csvFilename(slug: string): string {
  return `labstock-${slug}-${new Date().toISOString().slice(0, 10)}.csv`;
}
