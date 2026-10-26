import Link from "next/link";
import { Meter } from "@/components/figures/meter";
import { Amount } from "@/components/money/amount";
import { Badge } from "@/components/ui/badge";
import type { GoalView } from "@/features/goals/queries";
import { formatDate, formatPercent } from "@/lib/format";

export function GoalCard({ view }: { view: GoalView }) {
  const { goal, progress } = view;
  return (
    <Link href={`/goals/${goal.id}`} className="grid gap-3 rounded-xl border bg-card p-4 hover:bg-accent/40">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <span className="font-medium">{goal.name}</span>
        <span className="flex gap-1">
          {goal.status !== "active" && <Badge variant="outline">{goal.status}</Badge>}
          {progress.status === "ok" && progress.reached && goal.status === "active" && (
            <Badge variant="positive">target reached</Badge>
          )}
        </span>
      </div>
      {progress.status === "ok" ? (
        <>
          <div className="text-sm text-muted-foreground">
            <Amount money={progress.progress} colored={false} className="text-lg font-semibold text-foreground" /> of{" "}
            <Amount money={goal.target} colored={false} /> · {formatPercent(progress.ratio)}
          </div>
          <Meter fraction={progress.fraction} label={`${goal.name}: ${formatPercent(progress.ratio)} of target`} />
        </>
      ) : (
        <p className="text-sm text-warning">
          {progress.reason === "missing_rate"
            ? "Add an exchange rate to measure progress."
            : "The linked account is no longer available."}
        </p>
      )}
      <span className="text-xs text-muted-foreground">
        {view.linkedAccountName ? `Follows ${view.linkedAccountName}` : "Funded by allocations"}
        {goal.targetDate && ` · target ${formatDate(goal.targetDate)}`}
      </span>
    </Link>
  );
}
