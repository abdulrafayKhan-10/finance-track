import DecimalJs from "decimal.js";

/**
 * The only decimal implementation used for money. 40 significant digits is far
 * beyond numeric(20,4) and numeric(28,10); ROUND_HALF_EVEN is the default
 * rounding mode (docs/04-accounting-rules.md §4.6, ACC-RND).
 */
export const Dec = DecimalJs.clone({
  precision: 40,
  rounding: DecimalJs.ROUND_HALF_EVEN,
  toExpNeg: -40,
  toExpPos: 40,
});
export type Dec = InstanceType<typeof Dec>;

// Covers every numeric column: numeric(20,4) money, numeric(28,10) quantities, numeric(24,12) rates.
const DECIMAL_STRING = /^-?\d{1,18}(\.\d{1,12})?$/;

/** Parses a database or form value. Rejects JS numbers so floats can never leak in. */
export function dec(value: string | Dec): Dec {
  if (value instanceof Dec) return value;
  if (typeof value !== "string" || !DECIMAL_STRING.test(value.trim())) {
    throw new TypeError(`Not a decimal string: ${String(value)}`);
  }
  return new Dec(value.trim());
}

export const ZERO = new Dec(0);
