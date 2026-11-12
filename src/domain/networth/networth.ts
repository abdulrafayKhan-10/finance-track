import type { IsoDate } from "../dates";
import { convert, type ExchangeRate, type RateUsed } from "../fx/fx";
import { type Holding, type InvestmentData, valueHoldings } from "../investments/portfolio";
import { accountBalance, type Account, type Posting } from "../ledger";
import { type CurrencyCode, Money } from "../money";

/**
 * Bumped whenever the calculation changes, so stored snapshots say how they were made.
 * 1: account balances only. 2: adds valued investment holdings.
 */
export const NET_WORTH_METHOD_VERSION = 2;

export type AccountContribution = {
  accountId: string;
  name: string;
  class: Account["class"];
  isLiquid: boolean;
  type: Account["type"];
  /** Stored sign, account currency. */
  balance: Money;
  /** Converted into the reporting currency, or null when no rate exists. */
  converted: Money | null;
  rate: RateUsed | null;
};

export type NetWorth = {
  asOf: IsoDate;
  currency: CurrencyCode;
  /** Σ asset-account balances (an overdrawn account counts negative). */
  assets: Money;
  /** −Σ liability-account balances: what is owed, as a positive number. */
  liabilities: Money;
  netWorth: Money;
  /** Cash, bank, wallet and savings accounts marked liquid. */
  liquid: Money;
  /** Cash held in investment accounts (holdings are counted separately below). */
  investmentCash: Money;
  /** Estimated value of valued holdings at the as-of rate. Already part of `assets`. */
  holdingsValue: Money;
  accounts: AccountContribution[];
  /** Open positions in included investment accounts, valued or not. */
  holdings: Holding[];
  /** Holdings with no valuation on or before asOf: listed, never added (ACC-VAL-1). */
  unvaluedHoldings: Holding[];
  /** Valued holdings whose currency has no rate to the reporting currency. */
  unconvertibleHoldings: Holding[];
  /** Accounts left out of every total because their currency could not be converted. */
  unconvertible: AccountContribution[];
  usedStaleRate: boolean;
};

/**
 * Net worth = assets − liabilities as of a date (docs/04-accounting-rules.md §4.9).
 * Only accounts marked "include in net worth" count. Each balance is
 * converted at the rate in force on `asOf`; amounts with no rate are listed,
 * never added nominally (INV-6). Goal allocations are not assets (ACC-GOAL-1).
 * An investment account's ledger lines are its cash only; its holdings are
 * added separately at their estimated value, so nothing is counted twice (ACC-NW-1).
 */
export function computeNetWorth(
  accounts: readonly Account[],
  postings: readonly Posting[],
  asOf: IsoDate,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
  investments?: InvestmentData,
): NetWorth {
  let assets = Money.zero(currency);
  let liabilities = Money.zero(currency);
  let liquid = Money.zero(currency);
  let investmentCash = Money.zero(currency);
  let usedStaleRate = false;
  const contributions: AccountContribution[] = [];
  const unconvertible: AccountContribution[] = [];

  for (const account of accounts) {
    if (!account.includeInNetWorth || account.openingDate > asOf) continue;
    const balance = accountBalance(account, postings, { asOf });
    const c = convert(balance, currency, asOf, rates);
    const entry: AccountContribution = {
      accountId: account.id,
      name: account.name,
      class: account.class,
      isLiquid: account.isLiquid,
      type: account.type,
      balance,
      converted: c.status === "converted" ? c.money : null,
      rate: c.status === "converted" ? c.rateUsed : null,
    };
    contributions.push(entry);
    if (c.status === "unavailable") {
      if (!balance.isZero()) unconvertible.push(entry);
      continue;
    }
    usedStaleRate ||= c.rateUsed?.stale ?? false;
    if (account.class === "asset") {
      assets = assets.plus(c.money);
      if (account.isLiquid) liquid = liquid.plus(c.money);
      if (account.type === "investment") investmentCash = investmentCash.plus(c.money);
    } else {
      liabilities = liabilities.minus(c.money);
    }
  }

  const included = new Set(
    accounts.filter((a) => a.includeInNetWorth && a.openingDate <= asOf && a.class === "asset").map((a) => a.id),
  );
  const holdings = investments ? valueHoldings(investments, asOf, currency, rates, (id) => included.has(id)) : [];
  let holdingsValue = Money.zero(currency);
  const unvaluedHoldings: Holding[] = [];
  const unconvertibleHoldings: Holding[] = [];
  for (const h of holdings) {
    if (h.valuation.status === "unvalued") {
      unvaluedHoldings.push(h);
    } else if (!h.converted) {
      unconvertibleHoldings.push(h);
    } else {
      holdingsValue = holdingsValue.plus(h.converted);
      usedStaleRate ||= h.rate?.stale ?? false;
    }
  }
  assets = assets.plus(holdingsValue);

  return {
    asOf,
    currency,
    assets,
    liabilities,
    netWorth: assets.minus(liabilities),
    liquid,
    investmentCash,
    holdingsValue,
    accounts: contributions,
    holdings,
    unvaluedHoldings,
    unconvertibleHoldings,
    unconvertible,
    usedStaleRate,
  };
}

/** The frozen record stored for a snapshot: results plus every input used (ACC-NW-4). */
export function snapshotDetails(nw: NetWorth) {
  return {
    method_version: NET_WORTH_METHOD_VERSION,
    liquid: nw.liquid.toStorage(),
    investment_cash: nw.investmentCash.toStorage(),
    holdings_value: nw.holdingsValue.toStorage(),
    used_stale_rate: nw.usedStaleRate,
    accounts: nw.accounts.map((a) => ({
      account_id: a.accountId,
      name: a.name,
      class: a.class,
      currency: a.balance.currency,
      balance: a.balance.toStorage(),
      converted: a.converted?.toStorage() ?? null,
      rate: a.rate
        ? { rate: a.rate.rate.toString(), effective_on: a.rate.effectiveOn, inverted: a.rate.inverted }
        : null,
    })),
    unconvertible: nw.unconvertible.map((a) => a.accountId),
    positions: nw.holdings.map((h) => ({
      account_id: h.position.accountId,
      asset_id: h.asset.id,
      asset_name: h.asset.name,
      currency: h.asset.currency,
      quantity: h.position.quantity.toString(),
      cost_basis: h.position.costBasis.toStorage(),
      valuation:
        h.valuation.status === "valued"
          ? {
              basis: h.valuation.basis,
              unit_price: h.valuation.unitPrice.toString(),
              valued_on: h.valuation.valuedOn,
              value: h.valuation.value.toStorage(),
            }
          : null,
      converted: h.valuation.status === "valued" ? (h.converted?.toStorage() ?? null) : null,
      rate: h.rate
        ? { rate: h.rate.rate.toString(), effective_on: h.rate.effectiveOn, inverted: h.rate.inverted }
        : null,
    })),
    unvalued_positions: nw.unvaluedHoldings.map((h) => ({ account_id: h.position.accountId, asset_id: h.asset.id })),
  };
}
