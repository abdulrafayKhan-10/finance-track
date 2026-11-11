import type { AssetCategory } from "@/domain/investments/types";
import type { InvestmentKind } from "@/domain/investments/types";

export const ASSET_CATEGORY_LABELS: Record<AssetCategory, string> = {
  stock_etf: "Stocks & ETFs",
  fund: "Funds",
  gold: "Gold",
  crypto: "Crypto",
  fixed_income: "Fixed income",
  cash_like: "Cash-like",
  custom: "Custom",
};

export const ASSET_CATEGORY_HINTS: Record<AssetCategory, string> = {
  stock_etf: "PSX or foreign shares and ETFs",
  fund: "Mutual funds such as Meezan or Al Meezan",
  gold: "Bars, coins or jewellery",
  crypto: "Coins and tokens",
  fixed_income: "NSS / Behbood certificates, T-bills, bonds, term deposits",
  cash_like: "Prize bonds, money-market or other near-cash holdings",
  custom: "Anything else with a quantity",
};

/** Sensible defaults when a category is chosen; the user can change them. */
export const CATEGORY_DEFAULTS: Record<AssetCategory, { unitLabel: string; quantityScale: number }> = {
  stock_etf: { unitLabel: "shares", quantityScale: 0 },
  fund: { unitLabel: "units", quantityScale: 4 },
  gold: { unitLabel: "tola", quantityScale: 4 },
  crypto: { unitLabel: "coins", quantityScale: 8 },
  fixed_income: { unitLabel: "units", quantityScale: 2 },
  cash_like: { unitLabel: "units", quantityScale: 2 },
  custom: { unitLabel: "units", quantityScale: 4 },
};

/** 1 tola = 11.6638038 g (the traditional South Asian unit). Shown as a hint, never converted silently. */
export const GRAMS_PER_TOLA = "11.6638038";

export type DetailField = {
  key: string;
  label: string;
  type: "text" | "date" | "percent";
  max?: number;
  hint?: string;
};

/** Optional category-specific fields stored in `assets.details`. Never account numbers or keys. */
export const DETAIL_FIELDS: Record<AssetCategory, DetailField[]> = {
  stock_etf: [
    { key: "exchange", label: "Exchange", type: "text", max: 30, hint: "e.g. PSX, NYSE" },
    { key: "isin", label: "ISIN", type: "text", max: 12 },
  ],
  fund: [
    { key: "manager", label: "Fund manager", type: "text", max: 60 },
    { key: "fund_type", label: "Fund type", type: "text", max: 40, hint: "e.g. Islamic income, equity" },
  ],
  gold: [
    { key: "karat", label: "Karat", type: "text", max: 10, hint: "e.g. 24K, 22K" },
    { key: "form", label: "Form", type: "text", max: 30, hint: "Bar, coin or jewellery" },
  ],
  crypto: [
    { key: "network", label: "Network", type: "text", max: 30, hint: "Never store a private key or seed here." },
  ],
  fixed_income: [
    { key: "issuer", label: "Issuer", type: "text", max: 60, hint: "e.g. National Savings" },
    { key: "maturity_date", label: "Maturity date", type: "date" },
    { key: "coupon_rate", label: "Profit / coupon rate (% a year)", type: "percent" },
  ],
  cash_like: [{ key: "institution", label: "Institution", type: "text", max: 60 }],
  custom: [],
};

export const INVESTMENT_KIND_HINTS: Record<InvestmentKind, string> = {
  buy: "Cash goes out, units come in. Not spending.",
  sell: "Units go out, cash comes in. Only the gain is profit.",
  opening_holding: "Something you already held before you started tracking.",
  dividend: "Paid out by a stock or fund. Counts as income.",
  interest: "Profit on a certificate, deposit or bond. Counts as income.",
  investment_fee: "A broker, custody or account fee.",
  split: "More (or fewer) units for the same total cost, e.g. a bonus issue.",
};
