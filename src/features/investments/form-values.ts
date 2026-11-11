import type { TransactionRecord } from "@/data/repositories/transactions";
import type { Asset, InvestmentKind } from "@/domain/investments/types";
import { isInvestmentKind } from "@/domain/investments/types";
import { minorUnits } from "@/domain/money";

/** Field values of the investment transaction form, as strings. */
export type InvestmentFormValues = {
  kind: InvestmentKind;
  occurred_on: string;
  asset_id: string;
  account_id: string;
  cash_account_id: string;
  quantity: string;
  quantity_change: string;
  unit_price: string;
  fee: string;
  cash_amount: string;
  cost_amount: string;
  amount: string;
  description: string;
  notes: string;
  status: "cleared" | "pending";
};

export function emptyInvestmentValues(
  defaults: Partial<InvestmentFormValues> & { occurred_on: string },
): InvestmentFormValues {
  return {
    kind: "buy",
    asset_id: "",
    account_id: "",
    cash_account_id: "",
    quantity: "",
    quantity_change: "",
    unit_price: "",
    fee: "",
    cash_amount: "",
    cost_amount: "",
    amount: "",
    description: "",
    notes: "",
    status: "cleared",
    ...defaults,
  };
}

/** Converts a stored investment transaction back into form values (the inverse of parseInvestmentForm). */
export function investmentValuesFromRecord(
  record: TransactionRecord,
  assets: readonly Asset[],
): InvestmentFormValues | null {
  if (!isInvestmentKind(record.kind)) return null;
  const asset = assets.find((a) => a.id === record.assetId);
  const move = record.movements[0];
  const line = record.lines[0];
  const scale = asset ? minorUnits(asset.currency) : 2;
  const qty = move ? move.quantity.abs().toFixed() : "";
  return emptyInvestmentValues({
    kind: record.kind,
    occurred_on: record.occurredOn,
    asset_id: record.assetId ?? "",
    account_id: move?.accountId ?? "",
    cash_account_id: line?.accountId ?? "",
    quantity: record.kind === "split" ? "" : qty,
    quantity_change: record.kind === "split" && move ? move.quantity.toFixed() : "",
    unit_price: move?.unitPrice?.toFixed() ?? "",
    fee: move && !move.fee.isZero() ? move.fee.toFixed(scale) : "",
    // The cash leg is shown so a cross-currency buy or sell keeps its amount.
    cash_amount: line && (record.kind === "buy" || record.kind === "sell") ? line.amount.abs().toFixed() : "",
    cost_amount: move?.costAmount?.toFixed(scale) ?? "",
    amount: line && !(record.kind === "buy" || record.kind === "sell") ? line.amount.abs().toFixed() : "",
    description: record.description,
    notes: record.notes ?? "",
    status: record.status,
  });
}
