"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";

/** Barre d'actions du document : absente de l'impression elle-même. */
export function PrintToolbar({ backHref }: { backHref: string }) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-[820px] items-center justify-between print:hidden">
      <Link
        href={backHref}
        className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--text-secondary)] hover:underline"
      >
        <ArrowLeft size={13} strokeWidth={2.2} aria-hidden />
        Retour aux factures
      </Link>

      <button
        type="button"
        onClick={() => window.print()}
        className="flex h-8 items-center gap-1.5 rounded-lg px-3 text-[11px] font-semibold text-white"
        style={{ background: "var(--series-1)" }}
      >
        <Printer size={13} strokeWidth={2.4} aria-hidden />
        Imprimer
      </button>
    </div>
  );
}
