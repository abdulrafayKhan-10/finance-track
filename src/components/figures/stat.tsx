import { cn } from "@/lib/utils";

/** Stat tile: label, value, optional note. */
export function Stat({
  label,
  children,
  note,
  className,
}: {
  label: string;
  children: React.ReactNode;
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid content-start gap-1 rounded-xl border bg-card p-4", className)}>
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xl font-semibold">{children}</span>
      {note && <span className="text-xs text-muted-foreground">{note}</span>}
    </div>
  );
}
