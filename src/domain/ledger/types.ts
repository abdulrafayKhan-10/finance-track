import type { IsoDate } from "../dates";
import type { CurrencyCode, Money } from "../money";

export const ACCOUNT_TYPES = [
  "cash",
  "bank",
  "digital_wallet",
  "savings",
  "investment",
  "credit_card",
  "loan",
  "other_asset",
  "other_liability",
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export type AccountClass = "asset" | "liability";
export type AccountStatus = "active" | "closed" | "archived";

const LIABILITY_TYPES: readonly AccountType[] = ["credit_card", "loan", "other_liability"];

/** Mirrors the generated `accounts.class` column. */
export function classOf(type: AccountType): AccountClass {
  return LIABILITY_TYPES.includes(type) ? "liability" : "asset";
}

export const TRANSACTION_KINDS = [
  "income",
  "expense",
  "refund",
  "transfer",
  "adjustment",
  "opening_holding",
  "buy",
  "sell",
  "dividend",
  "interest",
  "investment_fee",
  "split",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

/** Kinds that can be entered before investments exist (Phase 5). */
export const CASH_KINDS = ["expense", "income", "transfer", "refund", "adjustment"] as const;
export type CashKind = (typeof CASH_KINDS)[number];

export type TransactionStatus = "cleared" | "pending";

export type Account = {
  id: string;
  name: string;
  type: AccountType;
  class: AccountClass;
  currency: CurrencyCode;
  /** Signed by net-worth effect: an amount owed on a liability is negative. */
  openingBalance: Money;
  openingDate: IsoDate;
  status: AccountStatus;
  includeInNetWorth: boolean;
  isLiquid: boolean;
};

/** One posting to a balance-sheet account, signed by net-worth effect (§4.1). */
export type LedgerLine = {
  transactionId: string;
  accountId: string;
  amount: Money;
  categoryId: string | null;
  occurredOn: IsoDate;
  status: TransactionStatus;
  kind: TransactionKind;
};

/** The minimum a balance calculation needs: a line, or a pre-summed group of lines. */
export type Posting = Pick<LedgerLine, "accountId" | "amount" | "occurredOn" | "status">;
