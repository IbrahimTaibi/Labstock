import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "./UserMenu";

/** Bandeau haut commun : titre de page à gauche, actions à droite. */
export async function PageHeader({
  title,
  subtitle,
  actions,
  alertCount = 0,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  alertCount?: number;
}) {
  const user = await getCurrentUser();
  return (
    <header className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[17px] font-semibold leading-tight text-[var(--text-primary)]">
          {title}
        </h1>
        {subtitle ? (
          <p className="text-[11px] text-[var(--text-muted)]">{subtitle}</p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {actions}
        <ThemeToggle />

        <span className="card relative grid h-[38px] w-[38px] place-items-center text-[var(--text-secondary)]">
          <Bell size={15} strokeWidth={2.2} aria-hidden />
          {alertCount > 0 ? (
            <span
              className="tnum absolute -right-1 -top-1 grid h-[16px] min-w-[16px] place-items-center rounded-full px-1 text-[9px] font-bold text-white"
              style={{ background: "var(--critical)" }}
            >
              {alertCount > 99 ? "99+" : alertCount}
            </span>
          ) : null}
          <span className="sr-only">{alertCount} alertes en cours</span>
        </span>

        {user ? <UserMenu user={user} /> : null}
      </div>
    </header>
  );
}
