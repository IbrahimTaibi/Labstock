/**
 * Taille du conditionnement, lue dans son libellé : « 1000 unités/boîte »
 * ou « Boîte de 20 » donnent 1000 et 20.
 *
 * Le conditionnement est un texte libre — c'est la seule source disponible
 * pour rapporter un prix unitaire à un prix de colisage. Quand rien n'est
 * lisible, on renvoie `null` plutôt qu'un prix inventé.
 *
 * Module volontairement pur : importé côté client comme côté serveur.
 */
export function packSize(packaging: string | null): number | null {
  if (!packaging) return null;

  /* Espaces insécables et séparateurs de milliers retirés avant lecture :
     « 1 000 unités » doit donner 1000, pas 1. */
  const normalized = packaging.replace(/[  ]/g, " ");
  const match = /(\d[\d ]*)/.exec(normalized);
  if (!match) return null;

  const size = Number(match[1].replace(/ /g, ""));
  return Number.isFinite(size) && size > 0 ? size : null;
}

/** Prix HT du conditionnement, ou null si la taille n'est pas lisible. */
export function packagePrice(
  unitPrice: number,
  packaging: string | null
): number | null {
  const size = packSize(packaging);
  return size === null ? null : unitPrice * size;
}
