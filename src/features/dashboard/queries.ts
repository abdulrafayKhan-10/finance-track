import "server-only";
import { accountTotals } from "@/data/repositories/accounts";
import { listBudgets } from "@/data/repositories/budgets";
import { ledgerLines } from "@/data/repositories/ledger";
import { listSnapshots } from "@/data/repositories/snapshots";
import { budgetStatuses } from "@/domain/budgets/budgets";
import { monthOf } from "@/domain/dates";
import { accountBalance, displayBalance, summarizeCashFlow } from "@/domain/ledger";
import { computeNetWorth } from "@/domain/networth/networth";
import { spendingByCategory } from "@/domain/reports/reports";
import { loadFinanceContext } from "../finance-context";
import { getGoals } from "../goals/queries";
import { netWorthTrend } from "../networth/queries";
import type { SelectedPeriod } from "../periods";
import { getTransactionPage } from "../transactions/queries";

export async function getDashboard(period: SelectedPeriod) {
  const ctx = await loadFinanceContext();
  const currency = ctx.profile.baseCurrency;
  const month = monthOf(ctx.today);
  const [lines, snapshots, postings, budgets, goals, recent] = await Promise.all([
    ledgerLines(ctx.accounts),
    listSnapshots(),
    accountTotals(ctx.accounts),
    listBudgets(month, month),
    getGoals(),
    getTransactionPage({}, 5),
  ]);
  return {
    ctx,
    currency,
    period,
    netWorth: computeNetWorth(ctx.accounts, lines, ctx.today, currency, ctx.rates),
    trend: netWorthTrend(ctx.accounts, lines, ctx.today, currency, ctx.rates, snapshots, 12),
    cashFlow: summarizeCashFlow(lines, period, currency, ctx.rates),
    spending: spendingByCategory(lines, period, ctx.parents, currency, ctx.rates),
    budgets: budgetStatuses(budgets, lines, ctx.parents, ctx.rates),
    goals,
    recent: recent.items,
    balances: ctx.accounts
      .filter((a) => a.status === "active")
      .map((a) => ({ account: a, balance: displayBalance(a, accountBalance(a, postings)) })),
  };
}
