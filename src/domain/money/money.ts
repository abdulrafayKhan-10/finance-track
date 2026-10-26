import { type CurrencyCode, isCurrencyCode, minorUnits } from "./currencies";
import { Dec, dec, ZERO } from "./decimal";

export class CurrencyMismatchError extends Error {
  constructor(a: CurrencyCode, b: CurrencyCode) {
    super(`Cannot combine ${a} and ${b} without conversion`);
    this.name = "CurrencyMismatchError";
  }
}

/**
 * An exact amount in one currency. Arithmetic is full precision; amounts in
 * different currencies can never be combined (INV-6).
 */
export class Money {
  private constructor(
    readonly amount: Dec,
    readonly currency: CurrencyCode,
  ) {}

  static of(amount: string | Dec, currency: string): Money {
    if (!isCurrencyCode(currency)) throw new TypeError(`Unknown currency: ${currency}`);
    return new Money(dec(amount), currency);
  }

  static zero(currency: CurrencyCode): Money {
    return new Money(ZERO, currency);
  }

  /** Sums amounts that must share `currency` (also the result for an empty list). */
  static sum(items: readonly Money[], currency: CurrencyCode): Money {
    return items.reduce((acc, m) => acc.plus(m), Money.zero(currency));
  }

  /** The larger of this amount and zero. */
  static max0(m: Money): Money {
    return m.isNegative() ? Money.zero(m.currency) : m;
  }

  plus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  minus(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  negate(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  /** Multiplies by a rate or ratio; the result is in `currency` (default: unchanged). */
  times(factor: string | Dec, currency: CurrencyCode = this.currency): Money {
    return new Money(this.amount.times(dec(factor)), currency);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  compare(other: Money): -1 | 0 | 1 {
    this.assertSameCurrency(other);
    return this.amount.comparedTo(other.amount) as -1 | 0 | 1;
  }

  /** Rounded half-even to the currency's minor units: use only when presenting or persisting a result. */
  rounded(): Money {
    return new Money(this.amount.toDecimalPlaces(minorUnits(this.currency), Dec.ROUND_HALF_EVEN), this.currency);
  }

  /** Fixed-point string at the currency's minor units, e.g. "1250.50". */
  toFixed(): string {
    return this.amount.toFixed(minorUnits(this.currency), Dec.ROUND_HALF_EVEN);
  }

  /** Full-precision string for the database (numeric(20,4)). */
  toStorage(): string {
    return this.amount.toFixed(4, Dec.ROUND_HALF_EVEN);
  }

  toString(): string {
    return `${this.toFixed()} ${this.currency}`;
  }

  private assertSameCurrency(other: Money) {
    if (other.currency !== this.currency) throw new CurrencyMismatchError(this.currency, other.currency);
  }
}

export type AmountParseError = "empty" | "invalid" | "too_many_decimals" | "too_large";

/**
 * Parses an amount typed by the user ("1,250.50", "1250"). Thousands separators
 * are allowed; more decimals than the currency supports is an error, never rounded.
 */
export function parseAmount(
  input: string,
  currency: CurrencyCode,
): { ok: true; money: Money } | { ok: false; error: AmountParseError } {
  const cleaned = input.trim().replace(/[,\s_]/g, "");
  if (cleaned === "") return { ok: false, error: "empty" };
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return { ok: false, error: "invalid" };
  const decimals = cleaned.split(".")[1]?.length ?? 0;
  if (decimals > minorUnits(currency)) return { ok: false, error: "too_many_decimals" };
  const value = new Dec(cleaned);
  if (value.abs().greaterThanOrEqualTo("1e15")) return { ok: false, error: "too_large" };
  return { ok: true, money: Money.of(value, currency) };
}
