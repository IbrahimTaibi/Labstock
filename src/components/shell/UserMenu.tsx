import { LogOut } from "lucide-react";
import { signOut } from "@/app/login/actions";
import type { CurrentUser } from "@/lib/auth";

export function UserMenu({ user }: { user: CurrentUser }) {
  return (
    <div className="card flex items-center gap-2 px-2.5 py-1.5">
      <span
        className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[10px] font-bold text-white"
        style={{ background: "var(--series-5)" }}
      >
        {user.initials}
      </span>
      <div className="leading-tight">
        <div className="text-[11px] font-semibold text-[var(--text-primary)]">
          {user.fullName}
        </div>
        <div className="text-[9px] text-[var(--text-muted)]">{user.jobTitle}</div>
      </div>

      <form action={signOut}>
        <button
          type="submit"
          title="Se déconnecter"
          className="ml-1 grid h-7 w-7 place-items-center rounded-lg text-[var(--text-muted)] transition-colors hover:bg-[var(--page)] hover:text-[var(--critical)]"
        >
          <LogOut size={14} strokeWidth={2.2} aria-hidden />
          <span className="sr-only">Se déconnecter</span>
        </button>
      </form>
    </div>
  );
}
