"use client";

import { useState, type RefObject } from "react";
import { CheckCircle2, ScanBarcode, TriangleAlert } from "lucide-react";
import { GS } from "@/lib/barcode-scan";

export type ScanMode = "increment" | "locate";

export type ScanOutcome = { ok: boolean; title: string; detail?: string };

/** Bip court : confirme la lecture sans quitter l'étiquette des yeux. */
export function beep(ok: boolean) {
  try {
    const AudioCtx =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = ok ? 1320 : 220;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.08 : 0.25));
    osc.onended = () => void ctx.close();
  } catch {
    /* Pas de son disponible : la lecture reste valable. */
  }
}

export function ScanBox({
  onScan,
  inputRef,
}: {
  onScan: (code: string, mode: ScanMode) => ScanOutcome;
  /** Permet au tableau de rendre la main au scanner après une saisie. */
  inputRef: RefObject<HTMLInputElement | null>;
}) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState<ScanMode>("increment");
  const [last, setLast] = useState<ScanOutcome | null>(null);
  const [active, setActive] = useState(false);

  function submit() {
    const code = value;
    setValue("");
    if (!code.trim()) return;
    const outcome = onScan(code, mode);
    setLast(outcome);
    beep(outcome.ok);
  }

  return (
    <section className="card p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h2 className="mr-auto flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--text-secondary)]">
          <ScanBarcode size={13} aria-hidden />
          Scanner
        </h2>
        <div
          role="radiogroup"
          aria-label="Effet d'une lecture"
          className="flex rounded-lg border border-[var(--border)] p-0.5 text-[10px]"
        >
          {(
            [
              ["increment", "+1 par scan"],
              ["locate", "Saisir la quantité"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={mode === key}
              onClick={() => {
                setMode(key);
                inputRef.current?.focus();
              }}
              className="rounded-md px-2.5 py-1 font-medium transition-colors"
              style={
                mode === key
                  ? { background: "var(--series-1)", color: "white" }
                  : { color: "var(--text-secondary)" }
              }
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="relative">
        <ScanBarcode
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
          style={{ color: active ? "var(--series-1)" : "var(--text-muted)" }}
          aria-hidden
        />
        <input
          ref={inputRef}
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onFocus={() => setActive(true)}
          onBlur={() => setActive(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              submit();
            } else if (event.ctrlKey && event.key === "]") {
              /* Le séparateur FNC1 arrive en Ctrl+] sur une douchette en
                 émulation clavier ; le navigateur ne l'insère pas seul. */
              event.preventDefault();
              setValue((current) => current + GS);
            }
          }}
          autoComplete="off"
          spellCheck={false}
          placeholder={
            active
              ? "Prêt — scannez une étiquette de lot"
              : "Cliquez ici, puis scannez avec la douchette"
          }
          aria-label="Code scanné"
          className="w-full rounded-lg border-2 bg-[var(--surface)] py-2.5 pl-9 pr-3 text-[12px] outline-none placeholder:text-[var(--text-muted)]"
          style={{
            borderColor: active ? "var(--series-1)" : "var(--border)",
          }}
        />
      </div>

      {last ? (
        <p
          role="status"
          className="mt-2 flex items-start gap-2 rounded-lg px-3 py-2 text-[11px]"
          style={{
            color: last.ok ? "var(--good)" : "var(--critical)",
            background: `color-mix(in srgb, ${
              last.ok ? "var(--good)" : "var(--critical)"
            } 10%, transparent)`,
          }}
        >
          {last.ok ? (
            <CheckCircle2 size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
          ) : (
            <TriangleAlert size={13} strokeWidth={2.4} className="mt-px shrink-0" aria-hidden />
          )}
          <span>
            <span className="font-semibold">{last.title}</span>
            {last.detail ? (
              <span className="text-[var(--text-secondary)]"> — {last.detail}</span>
            ) : null}
          </span>
        </p>
      ) : (
        <p className="mt-2 text-[10px] text-[var(--text-muted)]">
          {mode === "increment"
            ? "Chaque lecture ajoute une unité au lot scanné. Corrigez au besoin dans le tableau ci-dessous."
            : "Chaque lecture ouvre la quantité du lot scanné : tapez le nombre compté puis Entrée."}
        </p>
      )}
    </section>
  );
}
