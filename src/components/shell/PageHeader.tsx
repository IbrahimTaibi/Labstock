import { Bell } from "lucide-react";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getCurrentUser } from "@/lib/auth";
import { UserMenu } from "./UserMenu";

/** Bandeau haut commun : titre de page à gauche, actions à droite. */
export async function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
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

        {/* Le centre de notifications n'est pas construit : la cloche reste
            visible pour situer le produit, mais n'en promet pas l'usage.
            Les alertes chiffrées sont déjà portées par chaque page. */}
        <span
          aria-disabled="true"
          title="Notifications — module à venir"
          className="card grid h-[38px] w-[38px] cursor-not-allowed place-items-center text-[var(--text-muted)] opacity-60"
        >
          <Bell size={15} strokeWidth={2.2} aria-hidden />
          <span className="sr-only">Notifications — module à venir</span>
        </span>

        {user ? <UserMenu user={user} /> : null}
      </div>
    </header>
  );
}
