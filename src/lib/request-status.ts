import type { RequestPriority, RequestStatus } from "./types";

/* Constantes partagées serveur/client. Hors de `lib/purchase-requests.ts`,
   qui importe le client Supabase serveur : l'importer depuis un composant
   client embarquerait tout cela dans le bundle navigateur. */

/** Ordre d'affichage des statuts, dans le sens du cycle de vie (§9.1). */
export const REQUEST_STATUS_ORDER: RequestStatus[] = [
  "pending",
  "approved",
  "converted",
  "rejected",
];

/** Du plus urgent au moins urgent (§4.2). */
export const REQUEST_PRIORITY_ORDER: RequestPriority[] = [
  "critical",
  "urgent",
  "normal",
];
