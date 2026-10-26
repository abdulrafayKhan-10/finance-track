import "server-only";
import { accountTotals } from "@/data/repositories/accounts";
import { type AllocationRecord, type GoalRecord, listAllocations, listGoals } from "@/data/repositories/goals";
import { goalProgress, type GoalProgress, type OverAllocation, overAllocations } from "@/domain/goals/goals";
import { accountBalance } from "@/domain/ledger";
import type { Money } from "@/domain/money";
import { loadFinanceContext } from "../finance-context";

export type GoalView = {
  goal: GoalRecord;
  progress: GoalProgress;
  linkedAccountName: string | null;
  allocations: AllocationRecord[];
};

export async function getGoals(): Promise<{
  goals: GoalView[];
  overAllocated: (OverAllocation & { accountName: string })[];
}> {
  const ctx = await loadFinanceContext();
  const goals = await listGoals();
  const [allocations, postings] = await Promise.all([listAllocations(goals), accountTotals(ctx.accounts)]);
  const balances = new Map<string, Money>(ctx.accounts.map((a) => [a.id, accountBalance(a, postings)]));
  const accountName = new Map(ctx.accounts.map((a) => [a.id, a.name]));
  return {
    goals: goals.map((goal) => ({
      goal,
      progress: goalProgress(
        goal,
        allocations,
        goal.linkedAccountId ? balances.get(goal.linkedAccountId) : undefined,
        ctx.today,
        ctx.rates,
      ),
      linkedAccountName: goal.linkedAccountId ? (accountName.get(goal.linkedAccountId) ?? null) : null,
      allocations: allocations.filter((a) => a.goalId === goal.id),
    })),
    overAllocated: overAllocations(goals, allocations, balances).map((o) => ({
      ...o,
      accountName: accountName.get(o.accountId) ?? "An account",
    })),
  };
}
