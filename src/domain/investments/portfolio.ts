import type { IsoDate } from "../dates";
import { convert, type ExchangeRate, type RateUsed, sumConverted } from "../fx/fx";
import { type CurrencyCode, Dec, Money } from "../money";
import type { Asset, AssetCashLine, AssetCategory, HoldingMovement, Valuation } from "./types";
import { valuePosition, type PositionValue } from "./valuation";
import { computePositions, type Position } from "./wac";

export type InvestmentData = {
  assets: readonly Asset[];
  movements: readonly HoldingMovement[];
  valuations: readonly Valuation[];
};

export type Holding = {
  position: Position;
  asset: Asset;
  valuation: PositionValue;
  /** Estimated value in the reporting currency at the as-of rate; null when unvalued or unconvertible. */
  converted: Money | null;
  /** Cost basis in the reporting currency at the same rate, or null when no rate exists. */
  convertedCost: Money | null;
  rate: RateUsed | null;
};

export type Portfolio = {
  asOf: IsoDate;
  currency: CurrencyCode;
  /** Open positions (quantity > 0). */
  holdings: Holding[];
  /** Σ estimated value of valued, convertible holdings. */
  value: Money;
  /** Σ cost basis of those same holdings, so value − cost is like for like. */
  cost: Money;
  unrealized: Money;
  /** Positions with no valuation on or before asOf: excluded from value and net worth (ACC-VAL-1). */
  unvalued: Holding[];
  /** Their cost basis, shown as a warning, never as value. */
  unvaluedCost: Money;
  /** Valued holdings whose currency has no rate to the reporting currency. */
  unconvertible: Holding[];
  /** Realized gains, each converted at its sale date (separate from unrealized, ACC-INV-3). */
  realized: Money;
  /** Dividends and interest received, each at its own date. */
  income: Money;
  /** Investment fees charged as their own transactions. */
  fees: Money;
  /** Amounts left out of realized, income or fees for lack of a rate, in their original currency. */
  excluded: Money[];
  allocation: { category: AssetCategory; value: Money; share: Dec }[];
  /** Oldest manual valuation date behind the total, so the reader knows how fresh it is. */
  oldestValuation: IsoDate | null;
  usedStaleRate: boolean;
};

/** Each open position, valued and converted as of a date. Shared by the portfolio and net worth. */
export function valueHoldings(
  data: InvestmentData,
  asOf: IsoDate,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
  includeAccount: (accountId: string) => boolean = () => true,
): Holding[] {
  const assets = new Map(data.assets.map((a) => [a.id, a]));
  const holdings: Holding[] = [];
  for (const position of computePositions(assets, data.movements, asOf).values()) {
    if (!position.quantity.greaterThan(0) || !includeAccount(position.accountId)) continue;
    const asset = assets.get(position.assetId)!;
    const valuation = valuePosition(position, asset, data.valuations, asOf);
    const costC = convert(position.costBasis, currency, asOf, rates);
    const valueC = valuation.status === "valued" ? convert(valuation.value, currency, asOf, rates) : null;
    holdings.push({
      position,
      asset,
      valuation,
      converted: valueC?.status === "converted" ? valueC.money : null,
      convertedCost: costC.status === "converted" ? costC.money : null,
      rate: costC.status === "converted" ? costC.rateUsed : null,
    });
  }
  return holdings.sort((a, b) => a.asset.name.localeCompare(b.asset.name));
}

/**
 * Portfolio summary as of a date (§4.7–4.8). Values use the as-of exchange
 * rate; realized gains, income and fees use each event's own date (ACC-FX-2).
 */
export function computePortfolio(
  data: InvestmentData,
  cashLines: readonly AssetCashLine[],
  asOf: IsoDate,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
  includeAccount?: (accountId: string) => boolean,
): Portfolio {
  const holdings = valueHoldings(data, asOf, currency, rates, includeAccount);
  let value = Money.zero(currency);
  let cost = Money.zero(currency);
  let unvaluedCost = Money.zero(currency);
  let oldestValuation: IsoDate | null = null;
  let usedStaleRate = false;
  const unvalued: Holding[] = [];
  const unconvertible: Holding[] = [];
  const byCategory = new Map<AssetCategory, Money>();

  for (const h of holdings) {
    if (h.valuation.status === "unvalued") {
      unvalued.push(h);
      if (h.convertedCost) unvaluedCost = unvaluedCost.plus(h.convertedCost);
      continue;
    }
    if (!h.converted || !h.convertedCost) {
      unconvertible.push(h);
      continue;
    }
    usedStaleRate ||= h.rate?.stale ?? false;
    value = value.plus(h.converted);
    cost = cost.plus(h.convertedCost);
    byCategory.set(h.asset.category, (byCategory.get(h.asset.category) ?? Money.zero(currency)).plus(h.converted));
    if (h.valuation.basis === "manual" && (oldestValuation === null || h.valuation.valuedOn < oldestValuation)) {
      oldestValuation = h.valuation.valuedOn;
    }
  }

  // Realized gains include closed positions, so replay every position, not only open ones.
  const assets = new Map(data.assets.map((a) => [a.id, a]));
  const realizedEvents = [...computePositions(assets, data.movements, asOf).values()]
    .filter((p) => !includeAccount || includeAccount(p.accountId))
    .flatMap((p) => p.realizedEvents.map((e) => ({ money: e.amount, on: e.occurredOn })));
  const realized = sumConverted(realizedEvents, currency, rates);

  const inPeriod = cashLines.filter((l) => l.occurredOn <= asOf && (!includeAccount || includeAccount(l.accountId)));
  const income = sumConverted(
    inPeriod
      .filter((l) => l.kind === "dividend" || l.kind === "interest")
      .map((l) => ({ money: l.amount, on: l.occurredOn })),
    currency,
    rates,
  );
  const fees = sumConverted(
    inPeriod.filter((l) => l.kind === "investment_fee").map((l) => ({ money: l.amount.negate(), on: l.occurredOn })),
    currency,
    rates,
  );

  const allocation = [...byCategory.entries()]
    .map(([category, v]) => ({
      category,
      value: v,
      share: value.isZero() ? new Dec(0) : v.amount.dividedBy(value.amount),
    }))
    .sort((a, b) => b.value.compare(a.value));

  return {
    asOf,
    currency,
    holdings,
    value,
    cost,
    unrealized: value.minus(cost),
    unvalued,
    unvaluedCost,
    unconvertible,
    realized: realized.total,
    income: income.total,
    fees: fees.total,
    excluded: [...realized.excluded, ...income.excluded, ...fees.excluded],
    allocation,
    oldestValuation,
    usedStaleRate: usedStaleRate || realized.usedStaleRate || income.usedStaleRate || fees.usedStaleRate,
  };
}
