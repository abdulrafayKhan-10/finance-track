import { Plus, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/app-shell/page-header";
import { GoalCard } from "@/components/goals/goal-card";
import { Amount } from "@/components/money/amount";
import { Button } from "@/components/ui/button";
import { getGoals } from "@/features/goals/queries";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Savings goals" };

export default async function GoalsPage() {
  await requireUser();
  const { goals, overAllocated } = await getGoals();
  const active = goals.filter((g) => g.goal.status === "active");
  const others = goals.filter((g) => g.goal.status !== "active");
  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <PageHeader
          title="Savings goals"
          description="Goals measure money you already have. They are never added to net worth a second time."
        />
        <Button asChild>
          <Link href="/goals/new">
            <Plus aria-hidden /> New goal
          </Link>
        </Button>
      </div>
      {overAllocated.map((o) => (
        <p key={o.accountId} className="mb-4 flex items-start gap-2 rounded-md border border-warning/40 p-3 text-sm">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
          <span>
            More is earmarked from {o.accountName} (<Amount money={o.allocated} colored={false} />) than it holds (
            <Amount money={o.balance} colored={false} />
            ).
          </span>
        </p>
      ))}
      {goals.length === 0 ? (
        <section className="grid justify-items-start gap-3 rounded-xl border border-dashed p-6">
          <h2 className="font-medium">No goals yet</h2>
          <p className="text-sm text-muted-foreground">
            Set a target, such as an emergency fund or a trip, and track progress from an account or from earmarked
            amounts.
          </p>
          <Button asChild>
            <Link href="/goals/new">Create a goal</Link>
          </Button>
        </section>
      ) : (
        <div className="grid gap-6">
          <div className="grid gap-3 md:grid-cols-2">
            {active.map((g) => (
              <GoalCard key={g.goal.id} view={g} />
            ))}
          </div>
          {others.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm text-muted-foreground">
                Completed and archived ({others.length})
              </summary>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {others.map((g) => (
                  <GoalCard key={g.goal.id} view={g} />
                ))}
              </div>
            </details>
          )}
        </div>
      )}
    </>
  );
}
