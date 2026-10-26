import type { IsoDate } from "@/domain/dates";
import { minorUnits, type Money } from "@/domain/money";

const SYMBOLS: Partial<Record<string, string>> = { PKR: "Rs", USD: "$", EUR: "€", GBP: "£", INR: "₹", JPY: "¥" };

const numberFormats = new Map<number, Intl.NumberFormat>();
function numberFormat(digits: number) {
  let f = numberFormats.get(digits);
  if (!f) {
    f = new Intl.NumberFormat("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
    numberFormats.set(digits, f);
  }
  return f;
}

/**
 * "Rs 1,250,000.00" / "−Rs 50.00". Rounds half-even to minor units via the
 * domain, then formats the exact decimal string (Intl accepts strings, so no
 * float conversion happens).
 */
export function formatMoney(money: Money, { sign = "auto" }: { sign?: "auto" | "always" | "never" } = {}): string {
  const fixed = money.toFixed();
  const negative = fixed.startsWith("-") && !money.rounded().isZero();
  const digits = numberFormat(minorUnits(money.currency)).format(fixed.replace("-", "") as unknown as number);
  const symbol = SYMBOLS[money.currency] ?? money.currency;
  const body = `${symbol} ${digits}`;
  if (sign === "never") return body;
  if (negative) return `−${body}`;
  return sign === "always" && !money.rounded().isZero() ? `+${body}` : body;
}

const dateFormat = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** "26 Oct 2026" for a calendar date (no timezone shift: the date is the date). */
export function formatDate(date: IsoDate): string {
  return dateFormat.format(new Date(`${date}T00:00:00Z`));
}

/** A UTC timestamp shown in the user's timezone. */
export function formatTimestamp(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone,
  }).format(new Date(iso));
}

const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" });
const longMonthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

/** "Mar 26" for a month or a date in it. */
export function formatMonthShort(monthOrDate: string): string {
  return monthFormat.format(new Date(`${monthOrDate.slice(0, 7)}-01T00:00:00Z`));
}

/** "March 2026". */
export function formatMonthLong(monthOrDate: string): string {
  return longMonthFormat.format(new Date(`${monthOrDate.slice(0, 7)}-01T00:00:00Z`));
}

/** A ratio as a whole-number percentage, e.g. 0.756 → "76%". */
export function formatPercent(ratio: {
  toFixed: (dp: number) => string;
  times: (n: number) => { toFixed: (dp: number) => string };
}): string {
  return `${ratio.times(100).toFixed(0)}%`;
}
