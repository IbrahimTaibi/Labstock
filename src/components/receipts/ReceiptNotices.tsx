import {
  ClipboardList,
  PackageCheck,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";
import { formatInt } from "@/lib/utils";

export type Notice = {
  key: string;
  title: string;
  detail: string;
  tone: "warning" | "good" | "info" | "neutral";
};

const TONE: Record<Notice["tone"], { color: string; Icon: typeof TriangleAlert }> = {
  warning: { color: "var(--serious)", Icon: TriangleAlert },
  good: { color: "var(--good)", Icon: PackageCheck },
  info: { color: "var(--series-1)", Icon: RefreshCw },
  neutral: { color: "var(--series-2)", Icon: ClipboardList },
};

/**
 * Bandeau d'état système (§8). Un encadré n'apparaît que lorsque ce qu'il
 * affirme est vrai : annoncer « stock mis à jour » avant toute validation
 * apprendrait à l'opérateur à ne plus lire ces messages.
 */
export function ReceiptNotices({ notices }: { notices: Notice[] }) {
  if (notices.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
      {notices.map((notice) => {
        const { color, Icon } = TONE[notice.tone];
        return (
          <article
            key={notice.key}
            className="flex items-start gap-2 rounded-lg px-3 py-2"
            style={{
              background: `color-mix(in srgb, ${color} 10%, transparent)`,
              boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 30%, transparent)`,
            }}
          >
            <Icon
              size={13}
              strokeWidth={2.4}
              className="mt-px shrink-0"
              style={{ color }}
              aria-hidden
            />
            <div className="min-w-0">
              <div
                className="text-[10px] font-semibold leading-tight"
                style={{ color }}
              >
                {notice.title}
              </div>
              <div className="text-[9px] leading-relaxed text-[var(--text-secondary)]">
                {notice.detail}
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

/** Construit le bandeau à partir de l'état réel de l'écran. */
export function buildNotices(input: {
  outstandingLines: number;
  unitsRemaining: number;
  lastReceipt: {
    quantity: number;
    lotNumber: string;
    lotCreated: boolean;
    fefoRank: number | null;
  } | null;
}): Notice[] {
  const notices: Notice[] = [];

  if (input.outstandingLines > 0) {
    notices.push({
      key: "partial",
      title: "Réception partielle",
      detail: `Il reste ${formatInt(input.outstandingLines)} article${
        input.outstandingLines > 1 ? "s" : ""
      } à recevoir, soit ${formatInt(input.unitsRemaining)} unités.`,
      tone: "warning",
    });
  } else {
    notices.push({
      key: "complete",
      title: "Commande soldée",
      detail: "Toutes les lignes de ce bon de commande ont été reçues.",
      tone: "good",
    });
  }

  /* Les trois suivants décrivent ce que la dernière validation a réellement
     produit : sans validation dans cette session, ils n'ont rien à dire. */
  if (input.lastReceipt) {
    notices.push({
      key: "stock",
      title: "Stock mis à jour",
      detail: `+${formatInt(input.lastReceipt.quantity)} unités sur le lot « ${
        input.lastReceipt.lotNumber
      } » (${input.lastReceipt.lotCreated ? "créé" : "complété"}).`,
      tone: "good",
    });
    notices.push({
      key: "fefo",
      title: "FEFO recalculé",
      detail:
        input.lastReceipt.fefoRank === null
          ? "La priorité de sortie a été recalculée pour ce produit."
          : `Ce lot occupe désormais le rang ${input.lastReceipt.fefoRank} de la rotation.`,
      tone: "info",
    });
    notices.push({
      key: "movements",
      title: "Mouvements enregistrés",
      detail:
        "L'entrée en stock et la ligne de réception sont tracées avec l'opérateur.",
      tone: "neutral",
    });
  }

  return notices;
}
