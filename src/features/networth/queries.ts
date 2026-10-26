import "server-only";
import { ledgerLines } from "@/data/repositories/ledger";
import { listSnapshots, type Snapshot } from "@/data/repositories/snapshots";
import { addMonths, type IsoDate, lastDay, monthOf } from "@/domain/dates";
import type { Account, LedgerLine } from "@/domain/ledger";
import { computeNetWorth, type NetWorth } from "@/domain/networth/networth";
import type { CurrencyCode } from "@/domain/money";
import type { ExchangeRate } from "@/domain/fx/fx";
import { loadFinanceContext } from "../finance-context";

export type TrendPoint = { date: IsoDate; netWorth: NetWorth; snapshot: Snapshot | null };

/** Net worth at each of the last `months` month-ends, the current month ending today. */
export function netWorthTrend(
  accounts: readonly Account[],
  lines: readonly LedgerLine[],
  today: IsoDate,
  currency: CurrencyCode,
  rates: readonly ExchangeRate[],
  snapshots: readonly Snapshot[],
  months = 12,
): TrendPoint[] {
  const current = monthOf(today);
  const earliest = accounts.reduce<IsoDate | null>(
    (min, a) => (min === null || a.openingDate < min ? a.openingDate : min),
    null,
  );
  const points: TrendPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const month = addMonths(current, -i);
    const date = i === 0 ? today : lastDay(month);
    if (earliest === null || date < earliest) continue;
    points.push({
      date,
      netWorth: computeNetWorth(accounts, lines, date, currency, rates),
      snapshot: snapshots.find((s) => s.asOf === date) ?? null,
    });
  }
  return points;
}

export async function getNetWorthPage() {
  const ctx = await loadFinanceContext();
  const [lines, snapshots] = await Promise.all([ledgerLines(ctx.accounts), listSnapshots()]);
  const currency = ctx.profile.baseCurrency;
  return {
    ctx,
    current: computeNetWorth(ctx.accounts, lines, ctx.today, currency, ctx.rates),
    trend: netWorthTrend(ctx.accounts, lines, ctx.today, currency, ctx.rates, snapshots, 24),
    snapshots,
    lines,
  };
}
