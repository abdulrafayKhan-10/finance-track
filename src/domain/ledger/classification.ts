import type { TransactionKind } from "./types";

/**
 * How each kind is reported (docs/04-accounting-rules.md §4.2). The single
 * place that decides what counts as income or spending.
 */
export type FlowClass =
  | "household_income" // income
  | "household_spend" // expense, refund (a refund reduces spending)
  | "investment_income" // dividend, interest
  | "investment_cost" // investment_fee
  | "transfer" // never income or spending (ACC-TRF-1)
  | "adjustment" // shown separately (ACC-ADJ-1)
  | "asset_conversion"; // buy, sell, split, opening_holding (ACC-INV-1)

export const FLOW_CLASS: Record<TransactionKind, FlowClass> = {
  income: "household_income",
  expense: "household_spend",
  refund: "household_spend",
  transfer: "transfer",
  adjustment: "adjustment",
  opening_holding: "asset_conversion",
  buy: "asset_conversion",
  sell: "asset_conversion",
  split: "asset_conversion",
  dividend: "investment_income",
  interest: "investment_income",
  investment_fee: "investment_cost",
};

/** Lines that count towards budgets and the category spending report (ACC-BUD-1). */
export function isBudgetEligible(kind: TransactionKind): boolean {
  return FLOW_CLASS[kind] === "household_spend";
}
