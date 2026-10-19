/* Lecture d'un code saisi par une douchette.

   Une douchette USB se comporte comme un clavier : elle « tape » le contenu
   du symbole puis Entrée. On reçoit donc une chaîne brute, qu'il faut
   rapprocher d'une ligne de comptage. Trois formes sont reconnues :
     - le GS1-128 imprimé par l'application : (17) péremption, (10) lot,
       (240) référence — voir barcode.ts ;
     - le GS1-128 d'un fabricant : (01) GTIN, (17), (10)… On n'exploite que
       le lot et la péremption, le GTIN n'étant pas au référentiel ;
     - un code nu : numéro de lot ou référence article.

   Module pur : importé côté client. */

import { expiryToYYMMDD, sanitize } from "./barcode";

/** Ce qu'il faut savoir d'un lot pour le reconnaître à la douchette. */
export type ScanTarget = {
  lot_number: string;
  expiry_date: string;
  /** Référence de l'article porteur du lot. */
  reference: string;
};

/** Séparateur FNC1 transmis par la douchette (ASCII 29). */
export const GS = "\x1D";

/* Longueur fixe des AI numériques usuels ; les autres sont variables et se
   terminent par GS ou par la fin de la chaîne. */
const FIXED: Record<string, number> = {
  "01": 14,
  "02": 14,
  "11": 6,
  "13": 6,
  "15": 6,
  "17": 6,
};
const VARIABLE = ["10", "21", "240", "241", "30", "37", "91", "92"];

type Gs1Fields = Record<string, string>;

/**
 * Découpe une chaîne GS1 en champs. Renvoie null si elle ne commence pas
 * par un AI connu : c'est alors un code nu.
 */
export function parseGs1(raw: string): Gs1Fields | null {
  /* Préfixe d'identification de symbologie (]C1 pour GS1-128, ]d2 pour
     DataMatrix, ]Q3 pour QR), ajouté par certaines douchettes. */
  const text = raw.replace(/^\][A-Za-z]\d/, "");
  const fields: Gs1Fields = {};
  let i = 0;

  while (i < text.length) {
    if (text[i] === GS) {
      i += 1;
      continue;
    }
    const two = text.slice(i, i + 2);
    const three = text.slice(i, i + 3);

    if (FIXED[two] !== undefined) {
      const value = text.slice(i + 2, i + 2 + FIXED[two]);
      if (value.length !== FIXED[two] || !/^\d+$/.test(value))
        return Object.keys(fields).length ? fields : null;
      fields[two] = value;
      i += 2 + FIXED[two];
      continue;
    }

    const ai = VARIABLE.find((code) => code === three) ?? VARIABLE.find((code) => code === two);
    if (!ai) return Object.keys(fields).length ? fields : null;

    const end = text.indexOf(GS, i + ai.length);
    fields[ai] = text.slice(i + ai.length, end === -1 ? undefined : end);
    i = end === -1 ? text.length : end + 1;
  }

  return Object.keys(fields).length ? fields : null;
}

export type ScanMatch<T extends ScanTarget> =
  | { kind: "lot"; line: T }
  | { kind: "product"; lines: T[] }
  | { kind: "none" };

/** Rapproche un code scanné d'une liste de lots (comptage, sortie…). */
export function matchScan<T extends ScanTarget>(
  raw: string,
  lines: T[]
): ScanMatch<T> {
  const code = raw.trim();
  if (!code) return { kind: "none" };
  const plain = sanitize(code);

  // 1. Code nu égal à un numéro de lot.
  const byLot = lines.find((line) => sanitize(line.lot_number) === plain);
  if (byLot) return { kind: "lot", line: byLot };

  // 2. Symbole GS1 portant un lot.
  const fields = parseGs1(code);
  const scannedLot = fields?.["10"] ? sanitize(fields["10"]) : null;
  if (scannedLot) {
    const expiry = fields?.["17"] ?? null;
    const candidates = lines.filter((line) => {
      const lot = sanitize(line.lot_number);
      if (!lot) return false;
      if (scannedLot === lot) return true;
      /* Sans séparateur GS (douchette mal paramétrée), le lot avale l'AI
         variable qui le suit : « LOT123240REF » au lieu de « LOT123 ». */
      return (
        scannedLot.startsWith(lot) &&
        /^(240|241|21|91|92)/.test(scannedLot.slice(lot.length))
      );
    });
    /* La péremption départage deux lots dont l'un serait le préfixe de
       l'autre ; elle n'exclut rien si elle ne correspond à aucun. */
    const dated = expiry
      ? candidates.filter((line) => expiryToYYMMDD(line.expiry_date) === expiry)
      : [];
    const pool = dated.length ? dated : candidates;
    if (pool.length) {
      // Le lot le plus long est la lecture la plus précise.
      const best = [...pool].sort(
        (a, b) => sanitize(b.lot_number).length - sanitize(a.lot_number).length
      )[0];
      return { kind: "lot", line: best };
    }
  }

  // 3. Référence article, scannée nue ou portée par l'AI (240).
  const refs = [plain, fields?.["240"] ? sanitize(fields["240"]) : null].filter(
    (value): value is string => Boolean(value)
  );
  const byProduct = lines.filter((line) =>
    refs.includes(sanitize(line.reference))
  );
  if (byProduct.length === 1) return { kind: "lot", line: byProduct[0] };
  if (byProduct.length > 1) return { kind: "product", lines: byProduct };

  return { kind: "none" };
}
