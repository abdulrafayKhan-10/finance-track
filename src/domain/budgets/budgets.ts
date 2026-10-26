import { firstDay, type IsoMonth, lastDay } from "../dates";
import { type ExchangeRate, sumConverted } from "../fx/fx";
import { isBudgetEligible, type LedgerLine } from "../ledger";
import { type Dec, Money } from "../money";

export type Budget = { id: string; month: IsoMonth; categoryId: string | null; amount: Money };

/** Category → its top-level category (itself when it has no parent). */
export type CategoryParents = ReadonlyMap<string, string | null>;

export const WARNING_THRESHOLD = "0.85";

export type BudgetStatus = {
  budget: Budget;
  /** Net eligible spending (expenses − refunds) in the budget currency (§4.4). */
  actual: Money;
  remaining: Money;
  /** actual ÷ budgeted (budget > 0 is enforced). */
  used: Dec;
  state: "ok" | "warning" | "over";
  /** Eligible lines left out because their currency could not be converted (ACC-BUD-2). */
  excluded: Money[];
};

function topLevel(categoryId: string, parents: CategoryParents): string {
  return parents.get(categoryId) ?? categoryId;
}

/**
 * Spending against each budget for its month. A category budget covers its
 * subcategories; the overall budget (categoryId null) covers all eligible
 * spending. Transfers, card payments, buys and fees are never eligible (ACC-BUD-1).
 */
export function budgetStatuses(
  budgets: readonly Budget[],
  lines: readonly LedgerLine[],
  parents: CategoryParents,
  rates: readonly ExchangeRate[],
): BudgetStatus[] {
  return budgets.map((budget) => {
    const from = firstDay(budget.month);
    const to = lastDay(budget.month);
    const eligible = lines.filter(
      (l) =>
        isBudgetEligible(l.kind) &&
        l.occurredOn >= from &&
        l.occurredOn <= to &&
        l.categoryId !== null &&
        (budget.categoryId === null || topLevel(l.categoryId, parents) === budget.categoryId),
    );
    const total = sumConverted(
      eligible.map((l) => ({ money: l.amount, on: l.occurredOn })),
      budget.amount.currency,
      rates,
    );
    const actual = total.total.negate();
    const used = actual.amount.dividedBy(budget.amount.amount);
    return {
      budget,
      actual,
      remaining: budget.amount.minus(actual),
      used,
      state:
        actual.compare(budget.amount) > 0 ? "over" : used.greaterThanOrEqualTo(WARNING_THRESHOLD) ? "warning" : "ok",
      excluded: total.excluded,
    };
  });
}
