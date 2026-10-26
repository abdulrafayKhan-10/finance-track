import { TriangleAlert } from "lucide-react";
import type { Money } from "@/domain/money";
import { formatMoney } from "@/lib/format";

/** States plainly which amounts were left out because no exchange rate exists (ACC-FX-3). */
export function ExcludedNote({ excluded, stale }: { excluded: Money[]; stale?: boolean }) {
  if (excluded.length === 0 && !stale) return null;
  const byCurrency = new Map<string, Money>();
  // Absolute amounts: income and spending left out should add up, not cancel.
  for (const m of excluded)
    byCurrency.set(m.currency, byCurrency.has(m.currency) ? byCurrency.get(m.currency)!.plus(m.abs()) : m.abs());
  return (
    <p className="flex items-start gap-2 rounded-md border border-warning/40 p-3 text-xs text-muted-foreground">
      <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
      <span>
        {excluded.length > 0 && (
          <>
            Not included (no exchange rate): {[...byCurrency.values()].map((m) => formatMoney(m)).join(", ")}. Add a
            rate under Settings → Exchange rates.{" "}
          </>
        )}
        {stale && "Some conversions use a rate more than 31 days old."}
      </span>
    </p>
  );
}
