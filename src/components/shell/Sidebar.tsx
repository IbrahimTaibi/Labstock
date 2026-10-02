"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Archive,
  ArrowLeftRight,
  Banknote,
  BarChart3,
  Boxes,
  Building2,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  CloudUpload,
  FileSpreadsheet,
  FileText,
  FlaskConical,
  Info,
  LayoutDashboard,
  Package,
  Settings,
  ShoppingCart,
  Star,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { cn } from "@/lib/utils";

type NavLeaf = {
  label: string;
  href?: string;
  icon: typeof LayoutDashboard;
  /* Réservé à l'administrateur : masqué pour les membres. */
  adminOnly?: boolean;
};

type NavEntry = NavLeaf & { children?: NavLeaf[] };

/* Les entrées sans href ne sont pas encore construites : elles restent
   visibles pour situer le produit, mais ne promettent pas une page. */
const NAV: NavEntry[] = [
  { label: "Tableau de bord", href: "/", icon: LayoutDashboard },
  {
    label: "Marchandises",
    icon: Boxes,
    children: [
      { label: "Lots", href: "/goods", icon: Boxes },
      { label: "Produits", href: "/products", icon: Package },
    ],
  },
  {
    label: "Entrées / Sorties",
    icon: ArrowLeftRight,
    children: [
      { label: "Réceptions", href: "/receipts", icon: Truck },
      { label: "Sorties de stock", href: "/issues", icon: ArrowLeftRight },
    ],
  },
  {
    label: "Inventaire",
    icon: ClipboardCheck,
    children: [
      { label: "Comptage", href: "/inventory", icon: ClipboardCheck },
      { label: "Inventaire analytique", href: "/analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Facturation",
    icon: FileText,
    children: [
      { label: "Factures", href: "/invoices", icon: FileText },
      { label: "Dettes fournisseurs", href: "/debts", icon: Wallet },
      { label: "Règlements", href: "/debts/payments", icon: Banknote },
      { label: "Fournisseurs", href: "/suppliers", icon: Building2 },
    ],
  },
  { label: "Demande d'achat", href: "/requests", icon: ShoppingCart },
  { label: "Bon de commande", href: "/orders", icon: ClipboardList },
  { label: "Satisfaction fournisseur", icon: Star },
  { label: "Stock de bord", icon: Archive },
  { label: "Factures de bord", icon: FileSpreadsheet },
  {
    label: "Paramètres",
    icon: Settings,
    children: [
      { label: "Général", href: "/settings", icon: Settings },
      {
        label: "Laboratoires",
        href: "/labs",
        icon: FlaskConical,
        adminOnly: true,
      },
    ],
  },
  { label: "Utilisateurs", icon: Users },
  { label: "Sauvegarde", icon: CloudUpload },
  { label: "À propos", icon: Info },
];

/* `/` ne doit matcher que lui-même, sinon il reste actif partout. Les autres
   couvrent leurs sous-pages (/goods couvre /goods/12/history), sur une
   frontière de segment : /debts ne doit pas couvrir un futur /debtsxyz. */
function matches(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

const ALL_HREFS = NAV.flatMap((entry) => [
  entry.href,
  ...(entry.children ?? []).map((child) => child.href),
]).filter((href): href is string => href !== undefined);

/* Une seule entrée active : la plus précise. Sans cela, /debts/payments
   allumerait à la fois « Dettes fournisseurs » (/debts) et « Règlements ». */
function isActive(pathname: string, href: string) {
  if (!matches(pathname, href)) return false;
  return !ALL_HREFS.some(
    (other) => other.length > href.length && matches(pathname, other)
  );
}

const ROW =
  "flex w-full items-center gap-2.5 rounded-lg px-2 py-[7px] text-[12px] transition-colors";

export function Sidebar({
  isAdmin = false,
  labName,
}: {
  isAdmin?: boolean;
  labName?: string | null;
}) {
  const pathname = usePathname();

  /* Un groupe s'ouvre de lui-même quand il contient la page courante ; une
     bascule manuelle prend ensuite le pas sur cet automatisme. */
  const [toggled, setToggled] = useState<Record<string, boolean>>({});

  const visible = (leaf: NavLeaf) => !leaf.adminOnly || isAdmin;

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
            {labName ?? "Gestion des stocks de laboratoire"}
          </div>
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-0.5">
          {NAV.map((entry) => {
            const children = entry.children?.filter(visible) ?? [];

            if (children.length === 0) {
              return (
                <li key={entry.label}>
                  <NavRow entry={entry} pathname={pathname} />
                </li>
              );
            }

            const hasActiveChild = children.some(
              (child) => child.href && isActive(pathname, child.href)
            );
            const open = toggled[entry.label] ?? hasActiveChild;
            const panelId = `nav-${entry.label.replace(/\W+/g, "-")}`;

            return (
              <li key={entry.label}>
                <button
                  type="button"
                  aria-expanded={open}
                  aria-controls={panelId}
                  onClick={() =>
                    setToggled((prev) => ({ ...prev, [entry.label]: !open }))
                  }
                  className={cn(
                    ROW,
                    "font-medium",
                    hasActiveChild && !open
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]",
                    "hover:bg-[var(--page)]"
                  )}
                >
                  <entry.icon size={15} strokeWidth={2} aria-hidden />
                  <span className="truncate">{entry.label}</span>
                  <ChevronDown
                    size={13}
                    strokeWidth={2}
                    aria-hidden
                    className={cn(
                      "ml-auto shrink-0 transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </button>

                <ul id={panelId} className="space-y-0.5" hidden={!open}>
                  {children.map((child) => (
                    <li key={child.label}>
                      <NavRow entry={child} pathname={pathname} nested />
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="border-t border-[var(--border)] px-4 py-3">
        <div className="text-[9px] leading-relaxed text-[var(--text-muted)]">
          Conforme ISO 15189:2022
        </div>
      </div>
    </aside>
  );
}

function NavRow({
  entry,
  pathname,
  nested = false,
}: {
  entry: NavLeaf;
  pathname: string;
  nested?: boolean;
}) {
  const { label, href, icon: Icon } = entry;
  const indent = nested ? "pl-7" : undefined;

  if (!href) {
    return (
      <span
        className={cn(
          ROW,
          "cursor-not-allowed text-[var(--text-muted)]",
          indent
        )}
        title="Module à venir"
      >
        <Icon size={15} strokeWidth={2} aria-hidden />
        <span className="truncate">{label}</span>
        <span className="ml-auto shrink-0 rounded px-1 py-px text-[8px] font-semibold uppercase tracking-wide text-[var(--text-muted)] ring-1 ring-[var(--border)]">
          Bientôt
        </span>
      </span>
    );
  }

  const active = isActive(pathname, href);

  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={cn(
        ROW,
        "font-medium",
        active
          ? "text-white"
          : "text-[var(--text-secondary)] hover:bg-[var(--page)]",
        indent
      )}
      style={active ? { background: "var(--series-1)" } : undefined}
    >
      <Icon size={15} strokeWidth={2} aria-hidden />
      <span className="truncate">{label}</span>
    </Link>
  );
}
