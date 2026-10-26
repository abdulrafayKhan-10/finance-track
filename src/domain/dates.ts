/**
 * Financial events are calendar dates ("YYYY-MM-DD") in the user's timezone,
 * with no time of day (docs/04-accounting-rules.md §4.10). ISO date strings
 * compare correctly as strings.
 */
export type IsoDate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: string): value is IsoDate {
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: IsoDate, b: IsoDate): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

/** Today's calendar date in `timeZone` (never the server's UTC date; ACC-DATE-1). */
export function todayIn(timeZone: string, now: Date = new Date()): IsoDate {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** "YYYY-MM" for a calendar month. */
export type IsoMonth = string;

export function isIsoMonth(value: string): value is IsoMonth {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7);
}

export function firstDay(month: IsoMonth): IsoDate {
  return `${month}-01`;
}

export function lastDay(month: IsoMonth): IsoDate {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${String(d).padStart(2, "0")}`;
}

export function addMonths(month: IsoMonth, n: number): IsoMonth {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Inclusive list of months from `from` to `to`. */
export function monthsBetween(from: IsoMonth, to: IsoMonth): IsoMonth[] {
  const out: IsoMonth[] = [];
  for (let m = from; m <= to && out.length < 1200; m = addMonths(m, 1)) out.push(m);
  return out;
}

export type Period = { from: IsoDate; to: IsoDate };
