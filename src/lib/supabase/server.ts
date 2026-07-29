import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

/** Client serveur : lit la session dans les cookies, donc RLS voit l'utilisateur. */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            /* Depuis un Server Component les en-têtes sont déjà figés :
               c'est le proxy qui réécrit les cookies de session. */
          }
        },
      },
    }
  );
}
