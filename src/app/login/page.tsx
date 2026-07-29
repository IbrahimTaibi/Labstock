import type { Metadata } from "next";
import { FlaskConical } from "lucide-react";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = {
  title: "Connexion — LABSTOCK",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: requested } = await searchParams;
  /* N'accepte qu'un chemin interne : bloque les redirections ouvertes. */
  const next =
    requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/";

  return (
    <main className="flex min-h-screen items-center justify-center bg-[var(--page)] p-4">
      <div className="w-full max-w-[380px]">
        <div className="mb-5 flex items-center justify-center gap-2.5">
          <span
            className="grid h-10 w-10 place-items-center rounded-xl"
            style={{ background: "var(--series-1)", color: "#fff" }}
          >
            <FlaskConical size={21} strokeWidth={2.2} aria-hidden />
          </span>
          <div>
            <div className="text-[17px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
              LABSTOCK
            </div>
            <div className="text-[10px] leading-tight text-[var(--text-muted)]">
              Gestion des stocks de laboratoire
            </div>
          </div>
        </div>

        <section className="card p-5">
          <h1 className="mb-1 text-[15px] font-semibold text-[var(--text-primary)]">
            Connexion
          </h1>
          <p className="mb-4 text-[11px] text-[var(--text-muted)]">
            Accès réservé au personnel du laboratoire.
          </p>

          <LoginForm next={next} />
        </section>

        <p className="mt-4 text-center text-[10px] text-[var(--text-muted)]">
          Conforme ISO 15189:2022
        </p>
      </div>
    </main>
  );
}
