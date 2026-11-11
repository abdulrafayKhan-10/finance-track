import { type IsoMonth, lastDay, monthOf, monthsBetween } from "../dates";
import { type ExchangeRate, sumConverted } from "../fx/fx";
import type { CurrencyCode, Money } from "../money";
import type { InvestmentData } from "./portfolio";
import type { AssetCashLine } from "./types";
import { computePositions } from "./wac";

export type InvestmentMonth = {
  month: IsoMonth;
  /** Dividends and interest received (counted as income, §4.3). */
  income: Money;
  /** Realized gain or loss from sales dated in the month (INV-5: never mixed with unrealized). */
  realized: Money;
  /** Investment fee transactions. */
  fees: Money;
  excluded: Money[];
};

/**
 * Investment income, realized gains and fees per month in [from, to], each
 * event converted at its own date's rate (ACC-FX-2).
 */
export function investmentMonths(
  data: InvestmentData,
  cashLines: readonly AssetCashLine[],
  from: IsoMonth,
  to: IsoMonth,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
): InvestmentMonth[] {
  const assets = new Map(data.assets.map((a) => [a.id, a]));
  const realizedEvents = [...computePositions(assets, data.movements, lastDay(to)).values()].flatMap(
    (p) => p.realizedEvents,
  );
  return monthsBetween(from, to).map((month) => {
    const inMonth = <T extends { occurredOn: string }>(xs: readonly T[]) =>
      xs.filter((x) => monthOf(x.occurredOn) === month);
    const income = sumConverted(
      inMonth(cashLines)
        .filter((l) => l.kind === "dividend" || l.kind === "interest")
        .map((l) => ({ money: l.amount, on: l.occurredOn })),
      currency,
      rates,
    );
    const fees = sumConverted(
      inMonth(cashLines)
        .filter((l) => l.kind === "investment_fee")
        .map((l) => ({ money: l.amount.negate(), on: l.occurredOn })),
      currency,
      rates,
    );
    const realized = sumConverted(
      inMonth(realizedEvents).map((e) => ({ money: e.amount, on: e.occurredOn })),
      currency,
      rates,
    );
    return {
      month,
      income: income.total,
      realized: realized.total,
      fees: fees.total,
      excluded: [...income.excluded, ...fees.excluded, ...realized.excluded],
    };
  });
}
