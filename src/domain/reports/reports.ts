import { firstDay, type IsoMonth, lastDay, monthsBetween, type Period } from "../dates";
import { type ExchangeRate, sumConverted } from "../fx/fx";
import { type CashFlowSummary, isBudgetEligible, type LedgerLine, summarizeCashFlow } from "../ledger";
import { type CurrencyCode, Money } from "../money";
import type { CategoryParents } from "../budgets/budgets";

export type MonthlyRow = { month: IsoMonth; summary: CashFlowSummary };

/** One cash-flow summary per calendar month in [from, to]. */
export function monthlyCashFlow(
  lines: readonly LedgerLine[],
  from: IsoMonth,
  to: IsoMonth,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
): MonthlyRow[] {
  return monthsBetween(from, to).map((month) => ({
    month,
    summary: summarizeCashFlow(lines, { from: firstDay(month), to: lastDay(month) }, currency, rates),
  }));
}

export type CategorySpend = {
  /** Top-level category id, or null for spending with no category. */
  categoryId: string | null;
  amount: Money;
  /** Breakdown by the categories inside it (including itself). */
  children: { categoryId: string; amount: Money }[];
};

/**
 * Net spending (expenses − refunds) per top-level category over a period,
 * largest first. Only budget-eligible kinds count (ACC-BUD-1).
 */
export function spendingByCategory(
  lines: readonly LedgerLine[],
  period: Period,
  parents: CategoryParents,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
): { rows: CategorySpend[]; total: Money; excluded: Money[] } {
  const eligible = lines.filter(
    (l) => isBudgetEligible(l.kind) && l.occurredOn >= period.from && l.occurredOn <= period.to,
  );
  const byLeaf = new Map<string | null, typeof eligible>();
  for (const l of eligible) byLeaf.set(l.categoryId, [...(byLeaf.get(l.categoryId) ?? []), l]);

  const excluded: Money[] = [];
  const tops = new Map<string | null, CategorySpend>();
  for (const [leaf, group] of byLeaf) {
    const sum = sumConverted(
      group.map((l) => ({ money: l.amount, on: l.occurredOn })),
      currency,
      rates,
    );
    excluded.push(...sum.excluded);
    const amount = sum.total.negate();
    const top = leaf === null ? null : (parents.get(leaf) ?? leaf);
    const row = tops.get(top) ?? { categoryId: top, amount: Money.zero(currency), children: [] };
    row.amount = row.amount.plus(amount);
    if (leaf !== null) row.children.push({ categoryId: leaf, amount });
    tops.set(top, row);
  }
  const rows = [...tops.values()]
    .map((r) => ({ ...r, children: r.children.sort((a, b) => b.amount.compare(a.amount)) }))
    .sort((a, b) => b.amount.compare(a.amount));
  return {
    rows,
    total: Money.sum(
      rows.map((r) => r.amount),
      currency,
    ),
    excluded,
  };
}

/** Yearly totals from the monthly rows (each year = sum of its months). */
export function yearlyTotals(rows: readonly MonthlyRow[]) {
  const years = new Map<string, MonthlyRow[]>();
  for (const r of rows) years.set(r.month.slice(0, 4), [...(years.get(r.month.slice(0, 4)) ?? []), r]);
  return [...years.entries()].map(([year, months]) => {
    const currency = months[0]!.summary.currency;
    const income = Money.sum(
      months.map((m) => m.summary.income),
      currency,
    );
    const spend = Money.sum(
      months.map((m) => m.summary.householdSpend),
      currency,
    );
    const net = income.minus(spend);
    return {
      year,
      income,
      householdSpend: spend,
      netCashFlow: net,
      savingsRate: income.isPositive() ? net.amount.dividedBy(income.amount) : null,
      excluded: months.flatMap((m) => m.summary.excluded),
    };
  });
}
