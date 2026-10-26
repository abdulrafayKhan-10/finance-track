import type { IsoDate } from "../dates";
import { convert, type ExchangeRate, type RateUsed } from "../fx/fx";
import { accountBalance, type Account, type Posting } from "../ledger";
import { type CurrencyCode, Money } from "../money";

/** Bumped whenever the calculation changes, so stored snapshots say how they were made. */
export const NET_WORTH_METHOD_VERSION = 1;

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
  /** Cash held in investment accounts (holdings are valued separately, Phase 5). */
  investmentCash: Money;
  accounts: AccountContribution[];
  /** Accounts left out of every total because their currency could not be converted. */
  unconvertible: AccountContribution[];
  usedStaleRate: boolean;
};

/**
 * Net worth = assets − liabilities as of a date (docs/04-accounting-rules.md §4.9).
 * Only accounts marked "include in net worth" count. Each balance is
 * converted at the rate in force on `asOf`; amounts with no rate are listed,
 * never added nominally (INV-6). Goal allocations are not assets (ACC-GOAL-1).
 */
export function computeNetWorth(
  accounts: readonly Account[],
  postings: readonly Posting[],
  asOf: IsoDate,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
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

  return {
    asOf,
    currency,
    assets,
    liabilities,
    netWorth: assets.minus(liabilities),
    liquid,
    investmentCash,
    accounts: contributions,
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
  };
}
