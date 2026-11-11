import { Amount } from "@/components/money/amount";
import type { Portfolio } from "@/domain/investments";
import { ASSET_CATEGORY_LABELS } from "@/lib/asset-meta";

/** Allocation by category as single-hue bars (magnitude, not identity), with value and share as text. */
export function AllocationBars({ allocation }: { allocation: Portfolio["allocation"] }) {
  if (allocation.length === 0) return <p className="text-sm text-muted-foreground">No valued holdings yet.</p>;
  const max = allocation[0]!.value.amount;
  return (
    <ul className="grid gap-2.5">
      {allocation.map((a) => {
        const width = max.isZero() ? 0 : Number(a.value.amount.dividedBy(max).times(100).toFixed(1));
        return (
          <li key={a.category} className="grid gap-1">
            <div className="flex justify-between gap-3 text-sm">
              <span className="truncate">{ASSET_CATEGORY_LABELS[a.category]}</span>
              <span className="text-muted-foreground">
                <Amount money={a.value} colored={false} className="text-foreground" />
                {` · ${a.share.times(100).toFixed(0)}%`}
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-muted" aria-hidden>
              <div className="h-full rounded-full bg-series-1" style={{ width: `${width}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
