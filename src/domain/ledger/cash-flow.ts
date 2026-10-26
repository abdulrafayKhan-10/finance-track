import type { IsoDate } from "../dates";
import { type ConvertedTotal, type ExchangeRate, sumConverted } from "../fx/fx";
import { type CurrencyCode, type Dec, Money } from "../money";
import { FLOW_CLASS } from "./classification";
import type { LedgerLine } from "./types";

export type CashFlowSummary = {
  currency: CurrencyCode;
  /** Household income + dividends + interest received (§4.3). */
  income: Money;
  /** Expenses net of refunds, as a positive number when money went out. */
  householdSpend: Money;
  netCashFlow: Money;
  /** netCashFlow ÷ income; null when income ≤ 0 (ACC-SR-1). */
  savingsRate: Dec | null;
  investmentIncome: Money;
  investmentCosts: Money;
  /** Net effect of adjustments; not part of income, spending or the savings rate. */
  adjustments: Money;
  /** Original-currency amounts that could not be converted and are left out of every figure above. */
  excluded: Money[];
  usedStaleRate: boolean;
};

/**
 * Cash flow for lines dated within [from, to], in `currency`, each line
 * converted at its own date's rate. Transfers and asset conversions never
 * appear (INV-1, INV-4).
 */
export function summarizeCashFlow(
  lines: readonly LedgerLine[],
  period: { from: IsoDate; to: IsoDate },
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
): CashFlowSummary {
  const bucket = (pred: (l: LedgerLine) => boolean): ConvertedTotal =>
    sumConverted(
      lines
        .filter((l) => l.occurredOn >= period.from && l.occurredOn <= period.to && pred(l))
        .map((l) => ({ money: l.amount, on: l.occurredOn })),
      currency,
      rates,
    );

  const household = bucket((l) => FLOW_CLASS[l.kind] === "household_income");
  const investmentIncome = bucket((l) => FLOW_CLASS[l.kind] === "investment_income");
  const spend = bucket((l) => FLOW_CLASS[l.kind] === "household_spend");
  const costs = bucket((l) => FLOW_CLASS[l.kind] === "investment_cost");
  const adjustments = bucket((l) => FLOW_CLASS[l.kind] === "adjustment");

  const income = household.total.plus(investmentIncome.total);
  const householdSpend = spend.total.negate();
  const netCashFlow = income.minus(householdSpend);
  const all = [household, investmentIncome, spend, costs, adjustments];

  return {
    currency,
    income,
    householdSpend,
    netCashFlow,
    savingsRate: income.isPositive() ? netCashFlow.amount.dividedBy(income.amount) : null,
    investmentIncome: investmentIncome.total,
    investmentCosts: costs.total.negate(),
    adjustments: adjustments.total,
    excluded: all.flatMap((b) => b.excluded),
    usedStaleRate: all.some((b) => b.usedStaleRate),
  };
}
