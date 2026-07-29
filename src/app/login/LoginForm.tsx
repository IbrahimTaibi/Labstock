"use client";

import { useActionState } from "react";
import { LogIn, TriangleAlert } from "lucide-react";
import { signIn, type SignInState } from "./actions";

const INITIAL: SignInState = { error: null, email: "" };

const CONTROL =
  "w-full rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--text-primary)] outline-none transition-colors placeholder:text-[var(--text-muted)] focus:border-[var(--series-1)]";

export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(signIn, INITIAL);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="next" value={next} />

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
          Adresse e-mail
        </span>
        <input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          /* Rejoué après un échec : l'action réinitialise les champs. */
          defaultValue={state.email}
          placeholder="prenom.nom@labstock.com"
          className={CONTROL}
        />
      </label>

      <label className="block">
        <span className="mb-1 block text-[11px] font-medium text-[var(--text-secondary)]">
          Mot de passe
        </span>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          className={CONTROL}
        />
      </label>

      {state.error ? (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-lg px-3 py-2 text-[11px] font-medium"
          style={{
            color: "var(--critical)",
            background: "color-mix(in srgb, var(--critical) 10%, transparent)",
          }}
        >
          <TriangleAlert size={13} strokeWidth={2.4} aria-hidden />
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
        style={{ background: "var(--series-1)" }}
      >
        <LogIn size={14} aria-hidden />
        {pending ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}
