import type { IsoDate } from "../dates";
import { convert, type ExchangeRate } from "../fx/fx";
import { type Dec, Dec as D, Money } from "../money";

export type Goal = {
  id: string;
  name: string;
  target: Money;
  targetDate: IsoDate | null;
  status: "active" | "completed" | "archived";
  fundingMode: "linked_account" | "allocations";
  linkedAccountId: string | null;
};

export type Allocation = { goalId: string; amount: Money; sourceAccountId: string | null; on: IsoDate };

export type GoalProgress =
  | {
      status: "ok";
      progress: Money;
      /** min(progress ÷ target, 1), for the meter. */
      fraction: Dec;
      /** Unclamped progress ÷ target. */
      ratio: Dec;
      reached: boolean;
      remaining: Money;
    }
  | { status: "unavailable"; reason: "missing_rate" | "missing_account" };

/**
 * Progress towards a goal (§4.5). Linked goals follow the account's balance
 * (converted at today's rate); allocation goals sum their earmarks. Neither
 * changes balances or net worth (ACC-GOAL-1).
 */
export function goalProgress(
  goal: Goal,
  allocations: readonly Allocation[],
  linkedBalance: Money | undefined,
  today: IsoDate,
  rates: readonly ExchangeRate[],
): GoalProgress {
  let progress: Money;
  if (goal.fundingMode === "linked_account") {
    if (!linkedBalance) return { status: "unavailable", reason: "missing_account" };
    const c = convert(linkedBalance, goal.target.currency, today, rates);
    if (c.status === "unavailable") return { status: "unavailable", reason: "missing_rate" };
    progress = c.money;
  } else {
    progress = Money.sum(
      allocations.filter((a) => a.goalId === goal.id).map((a) => a.amount),
      goal.target.currency,
    );
  }
  const ratio = progress.amount.dividedBy(goal.target.amount);
  return {
    status: "ok",
    progress,
    ratio,
    fraction: D.max(0, D.min(1, ratio)),
    reached: progress.compare(goal.target) >= 0,
    remaining: Money.max0(goal.target.minus(progress)),
  };
}

export type OverAllocation = { accountId: string; allocated: Money; balance: Money };

/**
 * Accounts whose earmarks across active goals exceed what they hold (ACC-GOAL-2).
 * Allocation sources share their goal's currency (enforced in the database).
 */
export function overAllocations(
  goals: readonly Goal[],
  allocations: readonly Allocation[],
  balances: ReadonlyMap<string, Money>,
): OverAllocation[] {
  const active = new Set(
    goals.filter((g) => g.status === "active" && g.fundingMode === "allocations").map((g) => g.id),
  );
  const byAccount = new Map<string, Money>();
  for (const a of allocations) {
    if (!a.sourceAccountId || !active.has(a.goalId)) continue;
    byAccount.set(
      a.sourceAccountId,
      (byAccount.get(a.sourceAccountId) ?? Money.zero(a.amount.currency)).plus(a.amount),
    );
  }
  const out: OverAllocation[] = [];
  for (const [accountId, allocated] of byAccount) {
    const balance = balances.get(accountId);
    if (balance && balance.currency === allocated.currency && allocated.compare(balance) > 0) {
      out.push({ accountId, allocated, balance });
    }
  }
  return out;
}
