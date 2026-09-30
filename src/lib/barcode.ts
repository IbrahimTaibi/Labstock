/* Encodeur Code 128 / GS1-128, sans dépendance externe.

   Le format retenu est le GS1-128, standard des étiquettes pharmaceutiques
   et de laboratoire : un seul symbole linéaire porte la péremption, le lot
   et la référence, lisible par n'importe quelle douchette 1D. Les données
   sont préfixées d'identifiants de données (AI) qui disent au lecteur quel
   champ il vient de lire — c'est ce qui permettra au module « Audit
   d'inventaire » de scanner sans convention maison.

   AI utilisés :
     (17) date de péremption, AAMMJJ, longueur fixe 6
     (10) numéro de lot, longueur variable (terminé par FNC1)
     (240) référence produit additionnelle, longueur variable */

/** Largeurs des 107 motifs Code 128, barre/espace en alternance. */
const PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213",
  "122312", "132212", "221213", "221312", "231212", "112232", "122132",
  "122231", "113222", "123122", "123221", "223211", "221132", "221231",
  "213212", "223112", "312131", "311222", "321122", "321221", "312212",
  "322112", "322211", "212123", "212321", "232121", "111323", "131123",
  "131321", "112313", "132113", "132311", "211313", "231113", "231311",
  "112133", "112331", "132131", "113123", "113321", "133121", "313121",
  "211331", "231131", "213113", "213311", "213131", "311123", "311321",
  "331121", "312113", "312311", "332111", "314111", "221411", "431111",
  "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114",
  "413111", "241112", "134111", "111242", "121142", "121241", "114212",
  "124112", "124211", "411212", "421112", "421211", "212141", "214121",
  "412121", "111143", "111341", "131141", "114113", "114311", "411113",
  "411311", "113141", "114131", "311141", "411131", "211412", "211214",
  "211232", "2331112",
];

const CODE_B = 100;
const FNC1 = 102;
const START_C = 105;
const STOP = 106;

/** Jeu B : un caractère ASCII imprimable vaut son code moins 32. */
function asciiValues(text: string): number[] {
  return [...text].map((char) => {
    const code = char.charCodeAt(0);
    /* Hors ASCII imprimable, le caractère n'est pas encodable : on le
       remplace plutôt que d'émettre un symbole illisible en silence. */
    return code >= 32 && code <= 126 ? code - 32 : "?".charCodeAt(0) - 32;
  });
}

/** Jeu C : deux chiffres par symbole. La chaîne doit être de longueur paire. */
function digitPairValues(digits: string): number[] {
  const values: number[] = [];
  for (let i = 0; i < digits.length; i += 2) {
    values.push(Number(digits.slice(i, i + 2)));
  }
  return values;
}

/** "2026-04-15" -> "260415" ; null si la date est inexploitable. */
export function expiryToYYMMDD(iso: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return match[1].slice(2) + match[2] + match[3];
}

/** Restreint au jeu de caractères GS1 « AI 82 », en majuscules. */
function sanitize(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9\-./]/g, "");
}

export type BarcodePayload = {
  /** Suite de largeurs de modules, barre en premier, puis alternance. */
  modules: number[];
  /** Nombre total de modules — sert à dimensionner le SVG. */
  width: number;
  /** Texte lisible sous le symbole, AI entre parenthèses. */
  humanReadable: string;
};

/**
 * Construit le symbole GS1-128 d'un lot. Renvoie `null` si le lot ne porte
 * pas de quoi produire une étiquette exploitable : mieux vaut une étiquette
 * absente qu'une étiquette qui scanne un lot inexistant.
 */
export function encodeLotBarcode(input: {
  lotNumber: string;
  expiryDate: string;
  internalRef: string | null;
}): BarcodePayload | null {
  const expiry = expiryToYYMMDD(input.expiryDate);
  const lot = sanitize(input.lotNumber);
  const ref = input.internalRef ? sanitize(input.internalRef) : "";

  if (!expiry || !lot) return null;

  /* Démarrage en jeu C : "17" + AAMMJJ fait 8 chiffres, soit 4 symboles.
     Le FNC1 en tête est ce qui distingue un GS1-128 d'un Code 128 nu. */
  const values: number[] = [START_C, FNC1, ...digitPairValues("17" + expiry)];

  /* Le lot est alphanumérique : on bascule en jeu B pour la suite. */
  values.push(CODE_B, ...asciiValues("10" + lot));

  if (ref) {
    /* (10) est de longueur variable : sans séparateur FNC1, le lecteur
       avalerait le "240" qui suit comme faisant partie du lot. */
    values.push(FNC1, ...asciiValues("240" + ref));
  }

  /* Somme de contrôle pondérée par la position, modulo 103. */
  let checksum = values[0];
  for (let i = 1; i < values.length; i += 1) checksum += i * values[i];
  values.push(checksum % 103, STOP);

  const modules = values
    .flatMap((value) => [...PATTERNS[value]].map(Number))
    /* Marge silencieuse finale : 10 modules d'espace, exigés par la norme
       pour que le lecteur sache où le symbole s'arrête. */
    .concat(10);

  return {
    modules,
    width: modules.reduce((sum, n) => sum + n, 0),
    humanReadable: ref
      ? `(17)${expiry} (10)${lot} (240)${ref}`
      : `(17)${expiry} (10)${lot}`,
  };
}
