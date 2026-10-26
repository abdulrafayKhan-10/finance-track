import type { AccountType, TransactionKind } from "@/domain/ledger";

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  cash: "Cash",
  bank: "Bank account",
  digital_wallet: "Digital wallet",
  savings: "Savings account",
  investment: "Investment account",
  credit_card: "Credit card",
  loan: "Loan",
  other_asset: "Other asset",
  other_liability: "Other liability",
};

export const KIND_LABELS: Record<TransactionKind, string> = {
  expense: "Expense",
  income: "Income",
  transfer: "Transfer",
  refund: "Refund",
  adjustment: "Adjustment",
  opening_holding: "Opening holding",
  buy: "Buy",
  sell: "Sell",
  dividend: "Dividend",
  interest: "Interest",
  investment_fee: "Investment fee",
  split: "Split",
};
