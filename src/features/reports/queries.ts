import "server-only";
import { listBudgets } from "@/data/repositories/budgets";
import { ledgerLines } from "@/data/repositories/ledger";
import { budgetStatuses } from "@/domain/budgets/budgets";
import { type IsoMonth, monthOf, type Period } from "@/domain/dates";
import { monthlyCashFlow, spendingByCategory, yearlyTotals } from "@/domain/reports/reports";
import { loadFinanceContext } from "../finance-context";

export async function getMonthlyReport(year: string) {
  const ctx = await loadFinanceContext();
  const lines = await ledgerLines(ctx.accounts, `${year}-01-01`, `${year}-12-31`);
  const last: IsoMonth = year === ctx.today.slice(0, 4) ? monthOf(ctx.today) : `${year}-12`;
  const months = monthlyCashFlow(lines, `${year}-01`, last, ctx.profile.baseCurrency, ctx.rates);
  return { ctx, months, total: yearlyTotals(months)[0] ?? null };
}

export async function getCategoryReport(period: Period) {
  const ctx = await loadFinanceContext();
  const lines = await ledgerLines(ctx.accounts, period.from, period.to);
  return { ctx, ...spendingByCategory(lines, period, ctx.parents, ctx.profile.baseCurrency, ctx.rates) };
}

/** Budgeted vs actual for every budget in a year, grouped by month. */
export async function getBudgetReport(year: string) {
  const ctx = await loadFinanceContext();
  const [budgets, lines] = await Promise.all([
    listBudgets(`${year}-01`, `${year}-12`),
    ledgerLines(ctx.accounts, `${year}-01-01`, `${year}-12-31`),
  ]);
  const statuses = budgetStatuses(budgets, lines, ctx.parents, ctx.rates);
  return { ctx, statuses };
}

export async function getYearlyReport() {
  const ctx = await loadFinanceContext();
  const lines = await ledgerLines(ctx.accounts);
  const first = lines[0]?.occurredOn;
  if (!first) return { ctx, years: [] };
  const months = monthlyCashFlow(lines, monthOf(first), monthOf(ctx.today), ctx.profile.baseCurrency, ctx.rates);
  return { ctx, years: yearlyTotals(months).reverse() };
}
