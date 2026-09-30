import { createClient } from "@supabase/supabase-js";

/**
 * Réception des analyses prescrites depuis le logiciel de laboratoire (§9).
 *
 * Contrat attendu (corps JSON) :
 *   {
 *     "prescription_id": "LIS-88213",
 *     "prescribed_at": "2026-09-30T08:12:00Z",
 *     "analyses": [{ "code": "AN-NFS", "sample_count": 10 }]
 *   }
 *
 * En-têtes :
 *   X-Labstock-Source     slug du connecteur déclaré dans `lis_sources`
 *   X-Labstock-Signature  sha256=<hmac hexadécimal du corps brut>
 *
 * L'authentification tient entièrement dans la signature : la vérification
 * a lieu en base, sur le corps brut, par `ingest_lis_analyses()`. Cette
 * route ne détient aucun secret et ne fait que transporter.
 */

/* Le corps doit être lu tel quel : re-sérialiser le JSON changerait les
   octets signés et invaliderait la signature. */
export const dynamic = "force-dynamic";

/** Verdicts de la fonction d'ingestion, traduits en codes HTTP. */
const HTTP_STATUS: Record<string, number> = {
  /* 202 et non 200 : la prescription est enregistrée, la déduction de stock
     reste un acte distinct, déclenché depuis l'écran des sorties. */
  accepted: 202,
  /* 200 sur un doublon : l'appel a bien été traité, il n'y avait rien à
     faire. Un code d'erreur ferait rejouer le LIS indéfiniment. */
  duplicate: 200,
  invalid_signature: 401,
  unknown_source: 404,
  unknown_analysis: 422,
  malformed: 400,
};

const MESSAGE: Record<string, string> = {
  accepted: "Prescription intégrée.",
  duplicate: "Prescription déjà intégrée, aucun traitement supplémentaire.",
  invalid_signature: "Signature invalide.",
  unknown_source: "Connecteur inconnu ou désactivé.",
  unknown_analysis: "Un ou plusieurs codes analyse sont absents du référentiel.",
  malformed: "Corps de requête invalide.",
};

export async function POST(request: Request) {
  const slug = request.headers.get("x-labstock-source");
  const signature = request.headers.get("x-labstock-signature");

  if (!slug || !signature) {
    return Response.json(
      {
        status: "malformed",
        message:
          "En-têtes X-Labstock-Source et X-Labstock-Signature obligatoires.",
      },
      { status: 400 }
    );
  }

  const payload = await request.text();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return Response.json(
      { status: "error", message: "Configuration Supabase absente." },
      { status: 500 }
    );
  }

  /* Client sans session : un webhook n'a pas d'utilisateur. L'écriture est
     autorisée par la signature, pas par un rôle — d'où l'absence de clé de
     service ici. */
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("ingest_lis_analyses", {
    p_slug: slug,
    p_signature: signature,
    p_payload: payload,
  });

  if (error) {
    /* 503 plutôt que 500 : l'échec est transitoire côté base, le LIS a
       raison de rejouer. */
    return Response.json(
      { status: "error", message: `Ingestion indisponible : ${error.message}` },
      { status: 503 }
    );
  }

  const result = data as { status: string; [key: string]: unknown };
  const status = HTTP_STATUS[result.status] ?? 500;

  return Response.json(
    { ...result, message: MESSAGE[result.status] ?? "Statut inconnu." },
    { status }
  );
}

/** Sonde de disponibilité pour le LIS et la supervision. */
export async function GET() {
  return Response.json({
    service: "labstock-lis-webhook",
    status: "ready",
    expects: {
      method: "POST",
      headers: ["X-Labstock-Source", "X-Labstock-Signature"],
      body: {
        prescription_id: "string",
        prescribed_at: "ISO 8601 (optionnel)",
        analyses: [{ code: "string", sample_count: "integer > 0" }],
      },
    },
  });
}
