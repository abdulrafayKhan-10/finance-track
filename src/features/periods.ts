import { addMonths, firstDay, type IsoDate, isIsoDate, lastDay, monthOf, type Period } from "@/domain/dates";

export const PERIOD_KEYS = ["this-month", "last-month", "this-year", "last-12-months", "custom"] as const;
export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "this-month": "This month",
  "last-month": "Last month",
  "this-year": "This year",
  "last-12-months": "Last 12 months",
  custom: "Custom",
};

export type SelectedPeriod = Period & { key: PeriodKey };

/** Reporting period from URL params, relative to the user's "today". Invalid input falls back to this month. */
export function parsePeriod(params: Record<string, string | string[] | undefined>, today: IsoDate): SelectedPeriod {
  const key = PERIOD_KEYS.find((k) => k === params.period) ?? "this-month";
  const month = monthOf(today);
  switch (key) {
    case "last-month":
      return { key, from: firstDay(addMonths(month, -1)), to: lastDay(addMonths(month, -1)) };
    case "this-year":
      return { key, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "last-12-months":
      return { key, from: firstDay(addMonths(month, -11)), to: today };
    case "custom": {
      const from = typeof params.from === "string" && isIsoDate(params.from) ? params.from : null;
      const to = typeof params.to === "string" && isIsoDate(params.to) ? params.to : null;
      if (from && to && from <= to) return { key, from, to };
      return { key: "this-month", from: firstDay(month), to: lastDay(month) };
    }
    default:
      return { key: "this-month", from: firstDay(month), to: lastDay(month) };
  }
}
