import type { IsoDate } from "../dates";
import { daysBetween } from "../dates";
import { type CurrencyCode, Dec, Money } from "../money";

/** 1 unit of `base` = `rate` units of `quote`, effective from `effectiveOn` (§4.6). */
export type ExchangeRate = { base: CurrencyCode; quote: CurrencyCode; rate: Dec; effectiveOn: IsoDate };

export type RateUsed = { rate: Dec; effectiveOn: IsoDate; inverted: boolean; stale: boolean };

export type Conversion =
  | { status: "converted"; money: Money; original: Money; rateUsed: RateUsed | null }
  | { status: "unavailable"; original: Money; reason: "missing_rate" };

export const STALE_RATE_DAYS = 31;

/**
 * The multiplier from `from` to `to` on `onDate`: the latest rate with
 * effectiveOn ≤ onDate, direct or inverse. Future-dated rates are never used
 * (ACC-FX-1). There is no triangulation in v1.
 */
export function findRate(
  rates: readonly ExchangeRate[],
  from: CurrencyCode,
  to: CurrencyCode,
  onDate: IsoDate,
): RateUsed | null {
  let best: { r: ExchangeRate; inverted: boolean } | null = null;
  for (const r of rates) {
    if (r.effectiveOn > onDate) continue;
    const inverted = r.base === to && r.quote === from;
    if (!(r.base === from && r.quote === to) && !inverted) continue;
    // Prefer the most recent date; on the same date prefer a direct quote.
    if (
      !best ||
      r.effectiveOn > best.r.effectiveOn ||
      (r.effectiveOn === best.r.effectiveOn && best.inverted && !inverted)
    ) {
      best = { r, inverted };
    }
  }
  if (!best) return null;
  return {
    rate: best.inverted ? new Dec(1).dividedBy(best.r.rate) : best.r.rate,
    effectiveOn: best.r.effectiveOn,
    inverted: best.inverted,
    stale: daysBetween(best.r.effectiveOn, onDate) > STALE_RATE_DAYS,
  };
}

/** Converts at full precision; round only the final presented total. Missing rate → unavailable (ACC-FX-3). */
export function convert(money: Money, to: CurrencyCode, onDate: IsoDate, rates: readonly ExchangeRate[]): Conversion {
  if (money.currency === to) return { status: "converted", money, original: money, rateUsed: null };
  const rateUsed = findRate(rates, money.currency, to, onDate);
  if (!rateUsed) return { status: "unavailable", original: money, reason: "missing_rate" };
  return { status: "converted", money: money.times(rateUsed.rate, to), original: money, rateUsed };
}

export type ConvertedTotal = {
  /** Sum of everything that could be converted. */
  total: Money;
  /** Amounts left out because no rate existed, in their original currency. */
  excluded: Money[];
  /** True when any conversion used a rate older than STALE_RATE_DAYS. */
  usedStaleRate: boolean;
};

/** Converts each dated amount at its own date's rate (ACC-FX-2) and sums the results. */
export function sumConverted(
  items: readonly { money: Money; on: IsoDate }[],
  to: CurrencyCode,
  rates: readonly ExchangeRate[],
): ConvertedTotal {
  let total = Money.zero(to);
  const excluded: Money[] = [];
  let usedStaleRate = false;
  for (const { money, on } of items) {
    const c = convert(money, to, on, rates);
    if (c.status === "unavailable") {
      excluded.push(c.original);
    } else {
      total = total.plus(c.money);
      usedStaleRate ||= c.rateUsed?.stale ?? false;
    }
  }
  return { total, excluded, usedStaleRate };
}
