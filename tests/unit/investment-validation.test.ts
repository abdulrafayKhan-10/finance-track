import { describe, expect, it } from "vitest";
import type { Asset } from "@/domain/investments";
import type { Account } from "@/domain/ledger";
import { Money } from "@/domain/money";
import { parseAssetForm, parseInvestmentForm, parseQuantity } from "@/lib/validation/investments";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const account = (n: number, type: Account["type"], currency: Account["currency"] = "PKR"): Account => ({
  id: id(n),
  name: `A${n}`,
  type,
  class: type === "credit_card" ? "liability" : "asset",
  currency,
  openingBalance: Money.zero(currency),
  openingDate: "2026-01-01",
  status: "active",
  includeInNetWorth: true,
  isLiquid: type === "bank",
});

const BANK = account(1, "bank");
const BROKER = account(2, "investment");
const USD_BANK = account(3, "bank", "USD");
const CARD = account(4, "credit_card");
const accounts = [BANK, BROKER, USD_BANK, CARD];

const asset = (n: number, extra: Partial<Asset> = {}): Asset => ({
  id: id(100 + n),
  name: `Asset ${n}`,
  symbol: null,
  category: "stock_etf",
  currency: "PKR",
  quantityScale: 0,
  unitLabel: "shares",
  valuationMode: "manual",
  status: "active",
  ...extra,
});
const STOCK = asset(1);
const GOLD = asset(2, { category: "gold", quantityScale: 4, unitLabel: "tola" });
const assets = [STOCK, GOLD];

const form = (values: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
};

const parse = (values: Record<string, string>) =>
  parseInvestmentForm(form({ occurred_on: "2026-03-01", ...values }), accounts, assets);

describe("parseQuantity", () => {
  it("respects the asset's decimal places and never rounds", () => {
    expect(parseQuantity("1,000", 0)).toMatchObject({ ok: true });
    expect(parseQuantity("1.5", 0)).toEqual({ ok: false, error: "This asset is counted in whole units." });
    expect(parseQuantity("2.12345", 4)).toMatchObject({ ok: false });
    expect(parseQuantity("-5", 0)).toMatchObject({ ok: false });
    expect(parseQuantity("-5", 0, { allowNegative: true })).toMatchObject({ ok: true });
    expect(parseQuantity("0", 2)).toMatchObject({ ok: false });
  });
});

describe("parseInvestmentForm", () => {
  it("builds a buy: cash out = quantity × price + fee, movement in", () => {
    const r = parse({
      kind: "buy",
      asset_id: STOCK.id,
      account_id: BROKER.id,
      cash_account_id: BANK.id,
      quantity: "100",
      unit_price: "120.505",
      fee: "50",
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // 12,050.50 + 50, half-even to 2 dp
    expect(r.values.lines).toEqual([{ account_id: BANK.id, amount: "-12100.50", category_id: null }]);
    expect(r.values.movements).toEqual([{ account_id: BROKER.id, quantity: "100", unit_price: "120.505", fee: "50" }]);
    expect(r.values.asset_id).toBe(STOCK.id);
    expect(r.values.description).toBe("Buy · Asset 1");
  });

  it("builds a sell: cash in = quantity × price − fee, movement out", () => {
    const r = parse({
      kind: "sell",
      asset_id: STOCK.id,
      account_id: BROKER.id,
      cash_account_id: BROKER.id,
      quantity: "10",
      unit_price: "130",
      fee: "25",
    });
    expect(r.ok && r.values.lines[0]!.amount).toBe("1275.00");
    expect(r.ok && r.values.movements![0]!.quantity).toBe("-10");
  });

  it("asks for the amount actually paid when the cash account uses another currency", () => {
    const base = {
      kind: "buy",
      asset_id: STOCK.id,
      account_id: BROKER.id,
      cash_account_id: USD_BANK.id,
      quantity: "10",
      unit_price: "100",
    };
    const missing = parse(base);
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.fieldErrors.cash_amount).toBeTruthy();
    const ok = parse({ ...base, cash_amount: "3.60" });
    expect(ok.ok && ok.values.lines[0]).toEqual({ account_id: USD_BANK.id, amount: "-3.60", category_id: null });
  });

  it("rejects holdings outside investment accounts and payments from liabilities", () => {
    const r = parse({
      kind: "buy",
      asset_id: STOCK.id,
      account_id: BANK.id,
      cash_account_id: CARD.id,
      quantity: "1",
      unit_price: "1",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.fieldErrors.account_id).toContain("investment account");
      expect(r.fieldErrors.cash_account_id).toBeTruthy();
    }
  });

  it("refuses a fee larger than the sale", () => {
    const r = parse({
      kind: "sell",
      asset_id: STOCK.id,
      account_id: BROKER.id,
      cash_account_id: BANK.id,
      quantity: "1",
      unit_price: "10",
      fee: "10",
    });
    expect(r.ok).toBe(false);
  });

  it("opening holding: cost, no cash; split: signed quantity change", () => {
    const o = parse({
      kind: "opening_holding",
      asset_id: GOLD.id,
      account_id: BROKER.id,
      quantity: "2.5",
      cost_amount: "500,000",
    });
    expect(o.ok && o.values.lines).toEqual([]);
    expect(o.ok && o.values.movements).toEqual([{ account_id: BROKER.id, quantity: "2.5", cost_amount: "500000.00" }]);
    const s = parse({ kind: "split", asset_id: STOCK.id, account_id: BROKER.id, quantity_change: "-50" });
    expect(s.ok && s.values.movements).toEqual([{ account_id: BROKER.id, quantity: "-50" }]);
  });

  it("dividends are positive cash lines; fees negative, with an optional asset", () => {
    const d = parse({ kind: "dividend", asset_id: STOCK.id, cash_account_id: BANK.id, amount: "500" });
    expect(d.ok && d.values.lines[0]!.amount).toBe("500.00");
    const f = parse({ kind: "investment_fee", cash_account_id: BROKER.id, amount: "150" });
    expect(f.ok && f.values.lines[0]!.amount).toBe("-150.00");
    expect(f.ok && f.values.asset_id).toBeNull();
    const noAsset = parse({ kind: "dividend", cash_account_id: BANK.id, amount: "500" });
    expect(noAsset.ok).toBe(false);
  });
});

describe("parseAssetForm", () => {
  it("keeps only the category's detail fields and validates them", () => {
    const r = parseAssetForm(
      form({
        name: "Gold",
        category: "gold",
        currency: "PKR",
        unit_label: "tola",
        quantity_scale: "4",
        valuation_mode: "manual",
        detail_karat: "24K",
        detail_isin: "ignored",
      }),
    );
    expect(r.ok && r.values.details).toEqual({ karat: "24K" });
    const bad = parseAssetForm(
      form({
        name: "NSS",
        category: "fixed_income",
        currency: "PKR",
        unit_label: "units",
        quantity_scale: "2",
        detail_coupon_rate: "abc",
      }),
    );
    expect(bad.ok).toBe(false);
  });

  it("allows par value only for fixed income and cash-like assets", () => {
    const base = { name: "X", currency: "PKR", unit_label: "units", quantity_scale: "2", valuation_mode: "par" };
    expect(parseAssetForm(form({ ...base, category: "cash_like" })).ok).toBe(true);
    expect(parseAssetForm(form({ ...base, category: "stock_etf" })).ok).toBe(false);
  });
});
