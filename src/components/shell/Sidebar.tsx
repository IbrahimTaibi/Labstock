"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  Boxes,
  ClipboardCheck,
  FileText,
  FlaskConical,
  LayoutDashboard,
  Package,
  Settings,
  Truck,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
};

type NavGroup = { title: string; items: NavItem[] };

/* Les entrées sans href ne sont pas encore construites : elles restent
   visibles pour situer le produit, mais ne promettent pas une page. */
const NAV: NavGroup[] = [
  {
    title: "Pilotage",
    items: [{ label: "Tableau de bord", href: "/", icon: LayoutDashboard }],
  },
  {
    title: "Stock",
    items: [
      { label: "Marchandises", href: "/goods", icon: Boxes },
      { label: "Sorties de stock", href: "/issues", icon: ArrowLeftRight },
      { label: "Produits", icon: Package },
      { label: "Inventaire", icon: ClipboardCheck },
    ],
  },
  {
    title: "Achats",
    items: [
      { label: "Fournisseurs", icon: Truck },
      { label: "Factures", icon: FileText },
    ],
  },
  {
    title: "Système",
    items: [{ label: "Paramètres", icon: Settings }],
  },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-[232px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] lg:flex">
      <div className="flex items-center gap-2.5 border-b border-[var(--border)] px-4 py-4">
        <span
          className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
          style={{ background: "var(--series-1)", color: "#fff" }}
        >
          <FlaskConical size={19} strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[14px] font-bold leading-tight tracking-tight text-[var(--text-primary)]">
            LABSTOCK
          </div>
          <div className="truncate text-[9px] leading-tight text-[var(--text-muted)]">
            Gestion des stocks de laboratoire
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        {NAV.map((group) => (
          <div key={group.title} className="mb-4">
            <div className="mb-1.5 px-2 text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              {group.title}
            </div>
            <ul className="space-y-0.5">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = href
                  ? href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(href)
                  : false;

                if (!href) {
                  return (
                    <li key={label}>
                      <span
                        className="flex cursor-not-allowed items-center gap-2.5 rounded-lg px-2 py-[7px] text-[12px] text-[var(--text-muted)]"
                        title="Module à venir"
                      >
                        <Icon size={15} strokeWidth={2} aria-hidden />
                        {label}
                        <span className="ml-auto rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ring-1 ring-[var(--border)]">
                          Bientôt
                        </span>
                      </span>
                    </li>
                  );
                }

                return (
                  <li key={label}>
                    <Link
                      href={href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "flex items-center gap-2.5 rounded-lg px-2 py-[7px] text-[12px] font-medium transition-colors",
                        active
                          ? "text-white"
                          : "text-[var(--text-secondary)] hover:bg-[var(--page)]"
                      )}
                      style={active ? { background: "var(--series-1)" } : undefined}
                    >
                      <Icon size={15} strokeWidth={2} aria-hidden />
                      {label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="text-[9px] leading-relaxed text-[var(--text-muted)]">
          Conforme ISO 15189:2022
        </div>
      </div>
    </aside>
  );
}
