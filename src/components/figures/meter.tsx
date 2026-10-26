import { CircleAlert, TriangleAlert } from "lucide-react";
import type { Dec } from "@/domain/money";
import { cn } from "@/lib/utils";

/**
 * A progress meter: the fill carries the state; warning and over states
 * also get an icon and a word, so colour is never the only signal.
 */
export function Meter({
  fraction,
  state = "ok",
  label,
}: {
  /** 0–1 (values above 1 are drawn full). */
  fraction: Dec;
  state?: "ok" | "warning" | "over";
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, Number(fraction.times(100).toFixed(1))));
  return (
    <div className="grid gap-1">
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="h-2 w-full overflow-hidden rounded-full bg-series-1-track/60"
      >
        <div
          className={cn(
            "h-full rounded-full",
            state === "over" ? "bg-destructive" : state === "warning" ? "bg-warning" : "bg-series-1",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      {state !== "ok" && (
        <span className={cn("flex items-center gap-1 text-xs", state === "over" ? "text-destructive" : "text-warning")}>
          {state === "over" ? (
            <CircleAlert className="size-3.5" aria-hidden />
          ) : (
            <TriangleAlert className="size-3.5" aria-hidden />
          )}
          {state === "over" ? "Over budget" : "Nearly used"}
        </span>
      )}
    </div>
  );
}
