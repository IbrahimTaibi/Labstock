"use client";

import { useTransition } from "react";
import { Info, Plug, RefreshCw } from "lucide-react";
import { syncOrders } from "@/app/(app)/issues/actions";
import type { IssueMode } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

const MODES: Array<{
  value: IssueMode;
  title: string;
  tag: string;
  description: string;
}> = [
  {
    value: "automatic",
    title: "Automatique",
    tag: "Déduction immédiate",
    description:
      "Les consommables nécessaires sont calculés selon les coefficients, puis déduits du stock en une opération.",
  },
  {
    value: "manual",
    title: "Manuel",
    tag: "Validation requise",
    description:
      "Les quantités proposées restent modifiables ; la déduction n'a lieu qu'après votre validation.",
  },
];

export function SourceAndMode({
  mode,
  onModeChange,
  lastSync,
  onMessage,
}: {
  mode: IssueMode;
  onModeChange: (mode: IssueMode) => void;
  lastSync: string | null;
  onMessage: (message: string, ok: boolean) => void;
}) {
  const [pending, start] = useTransition();

  function handleSync() {
    start(async () => {
      const result = await syncOrders();
      onMessage(result.message, result.status === "success");
    });
  }

  return (
    <section className="card p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
        1. Source externe et mode de sortie
      </h2>

      <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border)] bg-[var(--page)] px-3 py-2.5">
        <Info
          size={14}
          strokeWidth={2.2}
          className="shrink-0"
          style={{ color: "var(--series-1)" }}
          aria-hidden
        />
        <p className="min-w-0 flex-1 text-[10px] leading-relaxed text-[var(--text-secondary)]">
          Les analyses prescrites sont importées depuis le logiciel de
          laboratoire.
          {lastSync ? (
            <>
              {" "}
              Dernier import :{" "}
              <span className="tnum font-medium text-[var(--text-primary)]">
                {formatDateTime(lastSync)}
              </span>
              .
            </>
          ) : (
            " Aucun import en attente."
          )}
        </p>

        <button
          type="button"
          onClick={handleSync}
          disabled={pending}
          className="card flex shrink-0 items-center gap-2 px-3 py-2 text-[11px] font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--surface)] disabled:opacity-60"
        >
          <RefreshCw
            size={13}
            className={pending ? "animate-spin" : undefined}
            aria-hidden
          />
          {pending ? "Import…" : "Synchroniser maintenant"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <div>
          <span className="mb-1 block text-[10px] font-medium text-[var(--text-secondary)]">
            Source externe
          </span>
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border)] bg-[var(--page)] px-2.5 py-2">
            <span className="flex min-w-0 items-center gap-2 text-[12px] font-medium">
              <Plug size={13} className="shrink-0 text-[var(--text-muted)]" aria-hidden />
              <span className="truncate">Logiciel de laboratoire (LIS)</span>
            </span>
            {/* Connecteur de démonstration : l'import est simulé côté base. */}
            <span
              className="shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[9px] font-semibold"
              style={{
                color: "var(--serious)",
                background: "color-mix(in srgb, var(--serious) 14%, transparent)",
              }}
              title="Aucun LIS réel n'est branché : l'import est simulé."
            >
              Simulé
            </span>
          </div>
        </div>

        <fieldset>
          <legend className="mb-1 text-[10px] font-medium text-[var(--text-secondary)]">
            Mode de sortie <span style={{ color: "var(--critical)" }}>*</span>
          </legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {MODES.map((option) => {
              const active = mode === option.value;
              return (
                <label
                  key={option.value}
                  className={cn(
                    "cursor-pointer rounded-lg border p-2.5 transition-colors",
                    active
                      ? "border-[var(--series-1)]"
                      : "border-[var(--border)] hover:bg-[var(--page)]"
                  )}
                  style={
                    active
                      ? {
                          background:
                            "color-mix(in srgb, var(--series-1) 6%, transparent)",
                        }
                      : undefined
                  }
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="issue-mode"
                      value={option.value}
                      checked={active}
                      onChange={() => onModeChange(option.value)}
                      className="h-3.5 w-3.5 accent-[var(--series-1)]"
                    />
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">
                      {option.title}
                    </span>
                    <span className="ml-auto rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                      {option.tag}
                    </span>
                  </span>
                  <span className="mt-1 block text-[10px] leading-relaxed text-[var(--text-secondary)]">
                    {option.description}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      </div>
    </section>
  );
}
