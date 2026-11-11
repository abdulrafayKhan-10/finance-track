import "server-only";
import { cache } from "react";
import {
  type AssetRecord,
  listAssetCashLines,
  listAssets,
  listMovements,
  listValuations,
} from "@/data/repositories/investments";
import { listTransactions } from "@/data/repositories/transactions";
import { addMonths, type IsoDate, lastDay, monthOf } from "@/domain/dates";
import {
  type AssetCashLine,
  computePortfolio,
  computePositions,
  type HoldingMovement,
  type InvestmentData,
  type Portfolio,
  type Position,
  type Valuation,
  valueHoldings,
} from "@/domain/investments";
import { Money } from "@/domain/money";
import { loadFinanceContext } from "../finance-context";

/** Structurally an InvestmentData, with the full asset records. */
export type InvestmentContext = {
  assets: AssetRecord[];
  movements: HoldingMovement[];
  valuations: Valuation[];
  cashLines: AssetCashLine[];
};

/** Assets, movements, valuations and asset cash lines, loaded once per request. */
export const loadInvestments = cache(async (): Promise<InvestmentContext> => {
  const ctx = await loadFinanceContext();
  const [assets, movements, valuations, cashLines] = await Promise.all([
    listAssets(),
    listMovements(),
    listValuations(),
    listAssetCashLines(ctx.accounts),
  ]);
  return { assets, movements, valuations, cashLines };
});

export type PortfolioPoint = { date: IsoDate; value: Money; unvaluedCount: number };

/** Portfolio value at each month-end (the current month ends today). Unvalued holdings are excluded and counted. */
export function portfolioHistory(
  data: InvestmentData,
  today: IsoDate,
  currency: Money["currency"],
  rates: Parameters<typeof valueHoldings>[3],
  months = 12,
): PortfolioPoint[] {
  const first = data.movements.reduce<IsoDate | null>(
    (min, m) => (min === null || m.occurredOn < min ? m.occurredOn : min),
    null,
  );
  if (first === null) return [];
  const points: PortfolioPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const date = i === 0 ? today : lastDay(addMonths(monthOf(today), -i));
    if (date < first) continue;
    const holdings = valueHoldings(data, date, currency, rates);
    points.push({
      date,
      value: Money.sum(
        holdings.flatMap((h) => (h.valuation.status === "valued" && h.converted ? [h.converted] : [])),
        currency,
      ),
      unvaluedCount: holdings.filter((h) => h.valuation.status === "unvalued").length,
    });
  }
  return points;
}

export async function getPortfolioPage() {
  const [ctx, inv] = await Promise.all([loadFinanceContext(), loadInvestments()]);
  const currency = ctx.profile.baseCurrency;
  const portfolio: Portfolio = computePortfolio(inv, inv.cashLines, ctx.today, currency, ctx.rates);
  return {
    ctx,
    inv,
    portfolio,
    history: portfolioHistory(inv, ctx.today, currency, ctx.rates, 12),
    accountName: (id: string) => ctx.accounts.find((a) => a.id === id)?.name ?? "Unknown account",
  };
}

export async function getAssetPage(id: string) {
  const [ctx, inv] = await Promise.all([loadFinanceContext(), loadInvestments()]);
  const asset = inv.assets.find((a) => a.id === id);
  if (!asset) return null;
  const currency = ctx.profile.baseCurrency;
  const holdings = valueHoldings(inv, ctx.today, currency, ctx.rates).filter((h) => h.asset.id === id);
  const assetMap = new Map(inv.assets.map((a) => [a.id, a]));
  const allPositions: Position[] = [...computePositions(assetMap, inv.movements).values()].filter(
    (p) => p.assetId === id,
  );
  const cashLines = inv.cashLines.filter((l) => l.assetId === id);
  const page = await listTransactions(ctx.accounts, { asset_id: id }, 100);
  return {
    ctx,
    asset,
    holdings,
    positions: allPositions,
    valuations: inv.valuations.filter((v) => v.assetId === id),
    income: cashLines.filter((l) => l.kind === "dividend" || l.kind === "interest"),
    fees: cashLines.filter((l) => l.kind === "investment_fee"),
    transactions: page.items,
    movements: inv.movements.filter((m) => m.assetId === id),
    hasHistory: page.items.length > 0 || inv.valuations.some((v) => v.assetId === id),
  };
}
