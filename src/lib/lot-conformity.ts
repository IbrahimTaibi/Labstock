import type { Lot, LotConformity } from "./types";

/**
 * Conformité d'un lot (§5.2 du cahier des charges). Le critère n'étant pas
 * arrêté au niveau métier, il est dérivé de ce que la fiche permet de
 * vérifier objectivement : un lot conforme est consommable et intégralement
 * tracé. Le jour où un contrôle à la réception sera saisi, cette fonction
 * devra l'intégrer plutôt que d'être remplacée.
 *
 * Module volontairement pur : il est importé côté client comme côté
 * serveur, il ne doit donc tirer aucune dépendance serveur.
 */
export function lotConformity(lot: Lot): LotConformity {
  const reasons: string[] = [];

  if (lot.is_expired) {
    reasons.push(`Lot périmé depuis ${Math.abs(lot.days_left)} j`);
  }
  if (lot.current_qty === 0) {
    reasons.push("Stock épuisé");
  }
  if (!lot.lot_number) {
    reasons.push("Numéro de lot absent");
  }
  if (!lot.internal_ref) {
    reasons.push("Référence interne absente");
  }

  return { conforme: reasons.length === 0, reasons };
}
