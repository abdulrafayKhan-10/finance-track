import "server-only";
import { listBudgets } from "@/data/repositories/budgets";
import { ledgerLines } from "@/data/repositories/ledger";
import { type BudgetStatus, budgetStatuses } from "@/domain/budgets/budgets";
import { addMonths, firstDay, type IsoMonth, lastDay, monthsBetween } from "@/domain/dates";
import { Money } from "@/domain/money";
import { spendingByCategory } from "@/domain/reports/reports";
import { loadFinanceContext } from "../finance-context";

export const HISTORY_MONTHS = 3;

export type BudgetRowView = {
  categoryId: string | null;
  name: string;
  status: BudgetStatus | null;
  /** Spending in this month even when no budget is set. */
  spent: Money;
  /** Spending in the previous months, oldest first, for comparison. */
  history: { month: IsoMonth; spent: Money }[];
};

export async function getBudgetMonth(month: IsoMonth) {
  const ctx = await loadFinanceContext();
  const currency = ctx.profile.baseCurrency;
  const historyFrom = addMonths(month, -HISTORY_MONTHS);
  const [budgets, lines] = await Promise.all([
    listBudgets(month, month),
    ledgerLines(ctx.accounts, firstDay(historyFrom), lastDay(month)),
  ]);
  const statuses = budgetStatuses(budgets, lines, ctx.parents, ctx.rates);
  const spendIn = (m: IsoMonth) =>
    spendingByCategory(lines, { from: firstDay(m), to: lastDay(m) }, ctx.parents, currency, ctx.rates);
  const thisMonth = spendIn(month);
  const past = monthsBetween(historyFrom, addMonths(month, -1)).map((m) => ({ month: m, spend: spendIn(m) }));
  const spentFor = (spend: ReturnType<typeof spendIn>, id: string | null) =>
    id === null ? spend.total : (spend.rows.find((r) => r.categoryId === id)?.amount ?? Money.zero(currency));

  const topLevel = ctx.categories.filter(
    (c) => c.kind === "expense" && c.parentId === null && (!c.isArchived || budgets.some((b) => b.categoryId === c.id)),
  );
  const row = (categoryId: string | null, name: string): BudgetRowView => ({
    categoryId,
    name,
    status: statuses.find((s) => s.budget.categoryId === categoryId) ?? null,
    spent: spentFor(thisMonth, categoryId),
    history: past.map((p) => ({ month: p.month, spent: spentFor(p.spend, categoryId) })),
  });

  return {
    ctx,
    currency,
    overall: row(null, "All spending"),
    rows: topLevel.map((c) => row(c.id, c.name)),
    excluded: thisMonth.excluded,
    hasBudgets: budgets.length > 0,
  };
}
