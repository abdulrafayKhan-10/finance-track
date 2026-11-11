import { describe, expect, it } from "vitest";
import type { ExchangeRate } from "@/domain/fx/fx";
import {
  type Asset,
  type AssetCashLine,
  averageCost,
  computePortfolio,
  computePositions,
  type HoldingMovement,
  latestValuation,
  positionKey,
  PositionError,
  quantityOn,
  unitPriceFromTotal,
  type Valuation,
  valuePosition,
} from "@/domain/investments";
import type { TransactionKind } from "@/domain/ledger";
import { dec, Money } from "@/domain/money";
import { computeNetWorth } from "@/domain/networth/networth";
import { ledger } from "../support/ledger-builder";

const asset = (id: string, extra: Partial<Asset> = {}): Asset => ({
  id,
  name: id,
  symbol: null,
  category: "stock_etf",
  currency: "PKR",
  quantityScale: 4,
  unitLabel: "shares",
  valuationMode: "manual",
  status: "active",
  ...extra,
});

let seq = 0;
function move(
  kind: TransactionKind,
  assetId: string,
  quantity: string,
  on: string,
  extra: Partial<{ price: string; fee: string; cost: string; account: string }> = {},
): HoldingMovement {
  seq += 1;
  const id = `m${String(seq).padStart(4, "0")}`;
  return {
    id,
    transactionId: `t${String(seq).padStart(4, "0")}`,
    accountId: extra.account ?? "Broker",
    assetId,
    kind,
    occurredOn: on,
    createdAt: `2026-01-01T00:00:00.${String(seq).padStart(6, "0")}Z`,
    quantity: dec(quantity),
    unitPrice: extra.price ? dec(extra.price) : null,
    fee: dec(extra.fee ?? "0"),
    costAmount: extra.cost ? dec(extra.cost) : null,
  };
}

const valuation = (assetId: string, on: string, price: string): Valuation => ({
  id: `v-${assetId}-${on}`,
  assetId,
  valuedOn: on,
  unitPrice: dec(price),
  enteredAs: "unit_price",
  enteredTotal: null,
  quantityAtEntry: null,
  sourceNote: null,
});

const pkr = (s: string) => Money.of(s, "PKR");
const one = (assets: Asset[], moves: HoldingMovement[], asOf?: string) => {
  const positions = computePositions(new Map(assets.map((a) => [a.id, a])), moves, asOf);
  return positions.get(positionKey("Broker", assets[0]!.id))!;
};

describe("weighted-average cost (§4.7)", () => {
  const A = asset("OGDC");

  it("adds buys with their fees to cost basis", () => {
    const p = one(
      [A],
      [
        move("buy", "OGDC", "100", "2026-01-10", { price: "100", fee: "50" }),
        move("buy", "OGDC", "100", "2026-02-10", { price: "120", fee: "50" }),
      ],
    );
    expect(p.quantity.toString()).toBe("200");
    expect(p.costBasis.equals(pkr("22100"))).toBe(true);
    expect(averageCost(p)!.equals(pkr("110.5"))).toBe(true);
    expect(p.tradingFees.equals(pkr("100"))).toBe(true);
  });

  it("partial sell removes average cost and realizes the rest (ACC-WAC-1)", () => {
    const p = one(
      [A],
      [
        move("buy", "OGDC", "100", "2026-01-10", { price: "100" }),
        move("buy", "OGDC", "100", "2026-02-10", { price: "120" }),
        move("sell", "OGDC", "-50", "2026-03-10", { price: "130", fee: "25" }),
      ],
    );
    // avg 110; removed 5,500; proceeds 6,500 − 25
    expect(p.quantity.toString()).toBe("150");
    expect(p.costBasis.equals(pkr("16500"))).toBe(true);
    expect(p.realized.equals(pkr("975"))).toBe(true);
    expect(averageCost(p)!.equals(pkr("110"))).toBe(true);
  });

  it("a full exit leaves no residual cost even with repeating decimals (ACC-WAC-3)", () => {
    const p = one(
      [A],
      [
        move("buy", "OGDC", "3", "2026-01-10", { price: "100" }),
        move("buy", "OGDC", "3", "2026-01-11", { price: "101" }),
        move("sell", "OGDC", "-1", "2026-02-01", { price: "105" }),
        move("sell", "OGDC", "-5", "2026-02-02", { price: "90" }),
      ],
    );
    expect(p.quantity.isZero()).toBe(true);
    expect(p.costBasis.isZero()).toBe(true);
    // Total realized = proceeds − total cost = (105 + 450) − 603
    expect(p.realized.rounded().equals(pkr("-48"))).toBe(true);
    expect(averageCost(p)).toBeNull();
  });

  it("opening holdings bring their own cost; splits change quantity, not cost", () => {
    const p = one(
      [A],
      [
        move("opening_holding", "OGDC", "10", "2026-01-01", { cost: "1000" }),
        move("split", "OGDC", "10", "2026-02-01"),
      ],
    );
    expect(p.quantity.toString()).toBe("20");
    expect(p.costBasis.equals(pkr("1000"))).toBe(true);
    expect(averageCost(p)!.equals(pkr("50"))).toBe(true);
  });

  it("processes movements in ledger order and respects as-of", () => {
    const moves = [
      move("sell", "OGDC", "-5", "2026-03-01", { price: "20" }),
      move("buy", "OGDC", "10", "2026-01-01", { price: "10" }),
    ];
    expect(one([A], moves).quantity.toString()).toBe("5");
    expect(one([A], moves, "2026-02-01").quantity.toString()).toBe("10");
  });

  it("refuses a sell larger than the position (ACC-WAC-4)", () => {
    expect(() => one([A], [move("sell", "OGDC", "-1", "2026-01-01", { price: "1" })])).toThrow(PositionError);
  });

  it("keeps positions per account, so the same asset in two accounts never overlaps", () => {
    const positions = computePositions(new Map([[A.id, A]]), [
      move("buy", "OGDC", "10", "2026-01-01", { price: "10" }),
      move("buy", "OGDC", "5", "2026-01-01", { price: "12", account: "Broker 2" }),
    ]);
    expect(positions.size).toBe(2);
    expect(positions.get(positionKey("Broker 2", "OGDC"))!.costBasis.equals(pkr("60"))).toBe(true);
  });

  it("quantityOn sums movements up to a date", () => {
    const moves = [move("buy", "OGDC", "10", "2026-01-01", { price: "1" }), move("split", "OGDC", "10", "2026-02-01")];
    expect(quantityOn(moves, "Broker", "OGDC", "2026-01-31").toString()).toBe("10");
    expect(quantityOn(moves, null, "OGDC", "2026-02-01").toString()).toBe("20");
  });
});

describe("valuations (§4.8)", () => {
  const A = asset("Gold", { category: "gold", unitLabel: "tola" });
  const p = one([A], [move("buy", "Gold", "2", "2026-01-05", { price: "200000" })]);
  const vals = [valuation("Gold", "2026-01-31", "210000"), valuation("Gold", "2026-03-31", "230000")];

  it("uses the latest valuation on or before the date, never a later one (INV-9)", () => {
    expect(latestValuation(vals, "Gold", "2026-02-15")!.valuedOn).toBe("2026-01-31");
    expect(latestValuation(vals, "Gold", "2026-04-01")!.valuedOn).toBe("2026-03-31");
    expect(latestValuation(vals, "Gold", "2026-01-30")).toBeNull();
  });

  it("values quantity × unit price and reports unrealized gain separately (ACC-VAL-2)", () => {
    const v = valuePosition(p, A, vals, "2026-02-15");
    expect(v.status).toBe("valued");
    if (v.status !== "valued") return;
    expect(v.value.equals(pkr("420000"))).toBe(true);
    expect(v.unrealized.equals(pkr("20000"))).toBe(true);
    expect(v.basis).toBe("manual");
  });

  it("is unvalued without a valuation, rather than falling back to cost (ACC-VAL-1)", () => {
    expect(valuePosition(p, A, vals, "2026-01-10")).toEqual({ status: "unvalued" });
  });

  it("par assets are worth 1 per unit, labelled as par", () => {
    const tbill = asset("T-bill", { category: "fixed_income", valuationMode: "par" });
    const pos = one([tbill], [move("buy", "T-bill", "100000", "2026-01-01", { price: "0.95" })]);
    const v = valuePosition(pos, tbill, [], "2026-02-01");
    expect(v.status === "valued" && v.basis === "par" && v.value.equals(pkr("100000"))).toBe(true);
  });

  it("turns a total value into a unit price using the quantity held", () => {
    expect(unitPriceFromTotal(pkr("525000"), dec("2.5"))!.toString()).toBe("210000");
    expect(unitPriceFromTotal(pkr("100"), dec("3"))!.toString()).toBe("33.3333333333");
    expect(unitPriceFromTotal(pkr("100"), dec("0"))).toBeNull();
  });
});

describe("portfolio", () => {
  const stock = asset("OGDC");
  const gold = asset("Gold", { category: "gold" });
  const usd = asset("VOO", { currency: "USD", category: "fund" });
  const rates: ExchangeRate[] = [{ base: "USD", quote: "PKR", rate: dec("280"), effectiveOn: "2026-01-01" }];
  const movements = [
    move("buy", "OGDC", "100", "2026-01-10", { price: "100" }),
    move("sell", "OGDC", "-50", "2026-02-10", { price: "120" }),
    move("buy", "Gold", "1", "2026-01-10", { price: "200000" }),
    move("buy", "VOO", "2", "2026-01-10", { price: "500" }),
  ];
  const cashLines: AssetCashLine[] = [
    {
      transactionId: "d1",
      assetId: "OGDC",
      kind: "dividend",
      occurredOn: "2026-02-20",
      accountId: "Bank",
      amount: pkr("300"),
    },
    {
      transactionId: "f1",
      assetId: "OGDC",
      kind: "investment_fee",
      occurredOn: "2026-02-21",
      accountId: "Bank",
      amount: pkr("-40"),
    },
  ];
  const data = {
    assets: [stock, gold, usd],
    movements,
    valuations: [valuation("OGDC", "2026-02-28", "110"), valuation("VOO", "2026-02-28", "550")],
  };

  it("totals valued holdings, lists unvalued ones with their cost, and keeps realized apart (INV-5)", () => {
    const pf = computePortfolio(data, cashLines, "2026-03-01", "PKR", rates);
    // OGDC 50 × 110 = 5,500; VOO 2 × 550 × 280 = 308,000. Gold is unvalued.
    expect(pf.value.equals(pkr("313500"))).toBe(true);
    expect(pf.cost.equals(pkr("285000"))).toBe(true); // 5,000 + 280,000
    expect(pf.unrealized.equals(pkr("28500"))).toBe(true);
    expect(pf.unvalued.map((h) => h.asset.id)).toEqual(["Gold"]);
    expect(pf.unvaluedCost.equals(pkr("200000"))).toBe(true);
    expect(pf.realized.equals(pkr("1000"))).toBe(true);
    expect(pf.income.equals(pkr("300"))).toBe(true);
    expect(pf.fees.equals(pkr("40"))).toBe(true);
    expect(pf.oldestValuation).toBe("2026-02-28");
    expect(pf.allocation.map((a) => a.category)).toEqual(["fund", "stock_etf"]);
  });

  it("lists holdings whose currency can't be converted instead of adding them nominally (INV-6)", () => {
    const pf = computePortfolio(data, cashLines, "2026-03-01", "PKR", []);
    expect(pf.unconvertible.map((h) => h.asset.id)).toEqual(["VOO"]);
    expect(pf.value.equals(pkr("5500"))).toBe(true);
  });
});

describe("net worth with holdings (§4.9)", () => {
  const stock = asset("OGDC");

  it("a buy moves value from cash to the position: nothing is counted twice (ACC-NW-1, INV-7)", () => {
    const l = ledger().account("Bank", "PKR", "100000").account("Broker", "PKR", "0", "investment");
    const before = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", []);
    // Pay 10,000 from the bank for 100 shares at 100, valued at cost.
    l.raw("buy", "Bank", "-10000", "2026-01-10");
    const data = {
      assets: [stock],
      movements: [move("buy", "OGDC", "100", "2026-01-10", { price: "100" })],
      valuations: [valuation("OGDC", "2026-01-10", "100")],
    };
    const after = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", [], data);
    expect(after.netWorth.equals(before.netWorth)).toBe(true);
    expect(after.holdingsValue.equals(pkr("10000"))).toBe(true);
    expect(after.investmentCash.isZero()).toBe(true);
  });

  it("unvalued holdings are excluded and listed; valuation changes move net worth", () => {
    const l = ledger().account("Broker", "PKR", "0", "investment");
    const data = {
      assets: [stock],
      movements: [move("opening_holding", "OGDC", "10", "2026-01-01", { cost: "1000" })],
      valuations: [valuation("OGDC", "2026-02-01", "150")],
    };
    const jan = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", [], data);
    expect(jan.netWorth.isZero()).toBe(true);
    expect(jan.unvaluedHoldings).toHaveLength(1);
    const feb = computeNetWorth([...l.accounts.values()], l.lines, "2026-02-28", "PKR", [], data);
    expect(feb.netWorth.equals(pkr("1500"))).toBe(true);
    expect(feb.unvaluedHoldings).toHaveLength(0);
  });

  it("skips holdings in accounts excluded from net worth", () => {
    const l = ledger().account("Broker", "PKR", "0", "investment");
    const broker = { ...l.acc("Broker"), includeInNetWorth: false };
    const data = {
      assets: [stock],
      movements: [move("opening_holding", "OGDC", "10", "2026-01-01", { cost: "1000" })],
      valuations: [valuation("OGDC", "2026-01-01", "150")],
    };
    const nw = computeNetWorth([broker], l.lines, "2026-01-31", "PKR", [], data);
    expect(nw.holdings).toHaveLength(0);
    expect(nw.netWorth.isZero()).toBe(true);
  });
});
