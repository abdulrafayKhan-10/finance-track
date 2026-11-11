import type { IsoDate } from "../dates";
import type { TransactionKind } from "../ledger/types";
import type { CurrencyCode, Dec, Money } from "../money";

export const ASSET_CATEGORIES = ["stock_etf", "fund", "gold", "crypto", "fixed_income", "cash_like", "custom"] as const;
export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export type ValuationMode = "manual" | "par";
export type AssetStatus = "active" | "archived";

/** Par value (1 per unit) is only meaningful for deposits, bonds and cash-like holdings (§4.8). */
export const PAR_CATEGORIES: readonly AssetCategory[] = ["fixed_income", "cash_like"];

export const INVESTMENT_KINDS = [
  "buy",
  "sell",
  "opening_holding",
  "dividend",
  "interest",
  "investment_fee",
  "split",
] as const satisfies readonly TransactionKind[];
export type InvestmentKind = (typeof INVESTMENT_KINDS)[number];

export function isInvestmentKind(kind: TransactionKind): kind is InvestmentKind {
  return (INVESTMENT_KINDS as readonly string[]).includes(kind);
}

export type Asset = {
  id: string;
  name: string;
  symbol: string | null;
  category: AssetCategory;
  /** Pricing currency: cost basis, valuations and gains are in it. */
  currency: CurrencyCode;
  /** Decimal places a quantity may have. */
  quantityScale: number;
  unitLabel: string;
  valuationMode: ValuationMode;
  status: AssetStatus;
};

/** One change to an (account, asset) position. Quantity is signed: + in, − out. */
export type HoldingMovement = {
  id: string;
  transactionId: string;
  accountId: string;
  assetId: string;
  kind: TransactionKind;
  occurredOn: IsoDate;
  createdAt: string;
  quantity: Dec;
  /** Asset currency; set for buy and sell. */
  unitPrice: Dec | null;
  /** Asset currency. */
  fee: Dec;
  /** Only for opening_holding: the cost basis brought in (asset currency). */
  costAmount: Dec | null;
};

/** A cash line of a transaction about an asset (dividend, interest, fee, or a buy/sell cash leg). */
export type AssetCashLine = {
  transactionId: string;
  assetId: string;
  kind: TransactionKind;
  occurredOn: IsoDate;
  accountId: string;
  /** Signed by net-worth effect, in the account's currency. */
  amount: Money;
};

export type Valuation = {
  id: string;
  assetId: string;
  valuedOn: IsoDate;
  /** Asset currency. */
  unitPrice: Dec;
  enteredAs: "unit_price" | "total_value";
  enteredTotal: Dec | null;
  quantityAtEntry: Dec | null;
  sourceNote: string | null;
};
