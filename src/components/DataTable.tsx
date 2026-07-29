import { cn } from "@/lib/utils";

export function DataTable({ children }: { children: React.ReactNode }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[280px] border-collapse text-[11px]">
        {children}
      </table>
    </div>
  );
}

type Align = "left" | "right" | "center";

const alignClass: Record<Align, string> = {
  left: "text-left",
  right: "text-right",
  center: "text-center",
};

export function Th({
  children,
  align = "left",
  className,
}: {
  children: React.ReactNode;
  align?: Align;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "border-b border-[var(--border)] px-2 py-1.5 font-medium text-[var(--text-muted)]",
        alignClass[align],
        className
      )}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "left",
  className,
  nowrap,
}: {
  children: React.ReactNode;
  align?: Align;
  className?: string;
  nowrap?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-b border-[var(--border)] px-2 py-[7px] text-[var(--text-primary)]",
        alignClass[align],
        align === "right" && "tnum",
        nowrap && "whitespace-nowrap",
        className
      )}
    >
      {children}
    </td>
  );
}

export function ViewAllLink({ label = "Voir tous" }: { label?: string }) {
  return (
    <div className="pt-2 text-center">
      <button
        type="button"
        className="text-[11px] font-medium text-[var(--series-1)] hover:underline"
      >
        {label}
      </button>
    </div>
  );
}
