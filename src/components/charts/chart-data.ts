import type { Money } from "@/domain/money";
import { formatMoney } from "@/lib/format";
import type { ChartPoint } from "./types";

/** Plot value (float, geometry only) plus the exact display string. */
export function point(label: string, money: Money): ChartPoint {
  return { label, value: Number(money.toFixed()), display: formatMoney(money) };
}
