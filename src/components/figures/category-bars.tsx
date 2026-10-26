import type { CategorySpend } from "@/domain/reports/reports";
import type { Money } from "@/domain/money";
import { Amount } from "@/components/money/amount";

/**
 * Spending by category as horizontal bars in one hue (a single series:
 * magnitude, not identity). Values sit at the bar tip as text.
 */
export function CategoryBars({
  rows,
  total,
  name,
  limit = 8,
}: {
  rows: CategorySpend[];
  total: Money;
  name: (id: string | null) => string;
  limit?: number;
}) {
  const positive = rows.filter((r) => r.amount.isPositive());
  const shown = positive.slice(0, limit);
  const max = shown[0]?.amount.amount;
  if (!max || !total.isPositive()) return <p className="text-sm text-muted-foreground">No spending in this period.</p>;
  return (
    <ul className="grid gap-2.5">
      {shown.map((r) => {
        const pct = Number(r.amount.amount.dividedBy(max).times(100).toFixed(1));
        const share = Number(r.amount.amount.dividedBy(total.amount).times(100).toFixed(0));
        return (
          <li key={r.categoryId ?? "none"} className="grid gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate">{name(r.categoryId)}</span>
              <span className="text-muted-foreground">
                <Amount money={r.amount} colored={false} className="text-foreground" /> · {share}%
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-series-1" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
      {positive.length > shown.length && (
        <li className="text-xs text-muted-foreground">
          + {positive.length - shown.length} more categories (see Reports)
        </li>
      )}
    </ul>
  );
}
