import { cn } from "@/lib/utils";

export function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return <section className={cn("card p-4", className)}>{children}</section>;
}

export function CardTitle({
  title,
  sub,
  right,
  icon,
}: {
  title: string;
  sub?: string;
  right?: React.ReactNode;
  icon?: React.ReactNode;
}) {
  return (
    <header className="mb-3 flex items-start justify-between gap-3">
      <div className="flex items-center gap-2">
        {icon}
        <h2 className="text-[13px] font-semibold tracking-wide text-[var(--text-primary)]">
          {title}
          {sub ? (
            <span className="ml-1.5 font-normal text-[var(--text-muted)]">
              ({sub})
            </span>
          ) : null}
        </h2>
      </div>
      {right}
    </header>
  );
}
