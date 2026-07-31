"use client";

import { useEffect, useRef, useState } from "react";
import { DayPicker, type DateRange } from "react-day-picker";
import { fr } from "react-day-picker/locale";
import { CalendarDays, Check } from "lucide-react";
import { formatDate } from "@/lib/utils";

/** Raccourcis usuels ; « Personnalisé » se lit dans le calendrier. */
const PRESETS: { label: string; months: number }[] = [
  { label: "3 mois", months: 3 },
  { label: "6 mois", months: 6 },
  { label: "12 mois", months: 12 },
  { label: "24 mois", months: 24 },
];

function toIso(date: Date) {
  /* Date locale sans décalage : toISOString() bascule d'un jour selon le
     fuseau, ce qui décalerait la période demandée. */
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function monthsAgo(months: number) {
  const date = new Date();
  date.setDate(1);
  date.setMonth(date.getMonth() - (months - 1));
  return date;
}

export function PeriodPicker({
  start,
  end,
  pending,
  onApply,
}: {
  start: string;
  end: string;
  pending: boolean;
  onApply: (start: string, end: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange | undefined>({
    from: new Date(start),
    to: new Date(end),
  });
  const popoverRef = useRef<HTMLDivElement>(null);

  /* Fermeture au clic extérieur et à Échap : le calendrier est un panneau
     flottant, il ne doit pas piéger l'utilisateur. */
  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!popoverRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function apply(from: Date, to: Date) {
    setOpen(false);
    onApply(toIso(from), toIso(to));
  }

  const canApply = Boolean(range?.from && range?.to);

  return (
    <div ref={popoverRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        disabled={pending}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="card flex items-center gap-2 px-3 py-2 text-left text-[11px] transition-colors hover:bg-[var(--page)] disabled:opacity-50"
      >
        <CalendarDays
          size={14}
          className="text-[var(--text-muted)]"
          aria-hidden
        />
        <span className="leading-tight">
          <span className="block text-[9px] uppercase tracking-wider text-[var(--text-muted)]">
            Période
          </span>
          <span className="tnum block font-medium text-[var(--text-primary)]">
            {formatDate(start)} – {formatDate(end)}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label="Choisir la période"
          className="card absolute right-0 z-50 mt-1 flex flex-col gap-2 p-3 shadow-lg sm:flex-row"
        >
          <div className="flex flex-row gap-1 sm:flex-col">
            {PRESETS.map((preset) => (
              <button
                key={preset.months}
                type="button"
                onClick={() => apply(monthsAgo(preset.months), new Date())}
                className="whitespace-nowrap rounded-lg px-2.5 py-1.5 text-left text-[11px] font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)] hover:text-[var(--text-primary)]"
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="border-t border-[var(--border)] pt-2 sm:border-l sm:border-t-0 sm:pl-3 sm:pt-0">
            <DayPicker
              mode="range"
              locale={fr}
              selected={range}
              onSelect={setRange}
              numberOfMonths={1}
              defaultMonth={range?.from}
              disabled={{ after: new Date() }}
              className="labstock-calendar"
            />
            <button
              type="button"
              disabled={!canApply}
              onClick={() => {
                if (range?.from && range?.to) apply(range.from, range.to);
              }}
              className="mt-1 flex h-8 w-full items-center justify-center gap-1.5 rounded-lg text-[11px] font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--series-1)" }}
            >
              <Check size={13} strokeWidth={2.4} aria-hidden />
              {canApply ? "Appliquer" : "Choisissez deux dates"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
