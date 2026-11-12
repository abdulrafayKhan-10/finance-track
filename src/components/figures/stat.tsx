import { cn } from "@/lib/utils";

/** A figure with its label: the label first in small text, the value in the display face. */
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
    <div className={cn("grid content-start gap-1.5 rounded-xl border bg-card px-4 py-3.5", className)}>
      <span className="text-[0.8rem] text-muted-foreground">{label}</span>
      <span className="font-display text-[1.45rem] leading-none font-semibold tracking-tight">{children}</span>
      {note && <span className="text-xs leading-snug text-muted-foreground">{note}</span>}
    </div>
  );
}
