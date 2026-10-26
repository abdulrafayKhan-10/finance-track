import type { TransactionRecord } from "@/data/repositories/transactions";
import { type Account, type CashKind, CASH_KINDS, displayBalance } from "@/domain/ledger";

/** Field values of the transaction form, as strings (what the inputs hold). */
export type TransactionFormValues = {
  kind: CashKind;
  occurred_on: string;
  account_id: string;
  category_id: string;
  amount: string;
  from_account_id: string;
  to_account_id: string;
  received_amount: string;
  direction: "increase" | "decrease";
  description: string;
  payee: string;
  notes: string;
  tags: string;
  status: "cleared" | "pending";
};

export function emptyFormValues(
  defaults: Partial<TransactionFormValues> & { occurred_on: string },
): TransactionFormValues {
  return {
    kind: "expense",
    account_id: "",
    category_id: "",
    amount: "",
    from_account_id: "",
    to_account_id: "",
    received_amount: "",
    direction: "decrease",
    description: "",
    payee: "",
    notes: "",
    tags: "",
    status: "cleared",
    ...defaults,
  };
}

export type EditableResult =
  | { editable: true; values: TransactionFormValues }
  | { editable: false; reason: "investment_kind" | "split" | "unknown_account" };

/** Converts a stored transaction back into form values (the inverse of parse + buildLines). */
export function formValuesFromRecord(record: TransactionRecord, accounts: readonly Account[]): EditableResult {
  if (!(CASH_KINDS as readonly string[]).includes(record.kind)) return { editable: false, reason: "investment_kind" };
  const byId = new Map(accounts.map((a) => [a.id, a]));
  if (record.lines.some((l) => !byId.has(l.accountId))) return { editable: false, reason: "unknown_account" };

  const base = emptyFormValues({
    kind: record.kind as CashKind,
    occurred_on: record.occurredOn,
    description: record.description,
    payee: record.payee ?? "",
    notes: record.notes ?? "",
    tags: record.tags.join(", "),
    status: record.status,
  });

  if (record.kind === "transfer") {
    const out = record.lines.find((l) => l.amount.isNegative());
    const into = record.lines.find((l) => l.amount.isPositive());
    if (!out || !into || record.lines.length !== 2) return { editable: false, reason: "split" };
    return {
      editable: true,
      values: {
        ...base,
        from_account_id: out.accountId,
        to_account_id: into.accountId,
        amount: out.amount.abs().toFixed(),
        received_amount: into.amount.toFixed(),
      },
    };
  }

  if (record.lines.length !== 1) return { editable: false, reason: "split" };
  const line = record.lines[0]!;
  if (record.kind === "adjustment") {
    const shown = displayBalance(byId.get(line.accountId)!, line.amount);
    return {
      editable: true,
      values: {
        ...base,
        account_id: line.accountId,
        amount: shown.abs().toFixed(),
        direction: shown.isPositive() ? "increase" : "decrease",
      },
    };
  }
  return {
    editable: true,
    values: {
      ...base,
      account_id: line.accountId,
      category_id: line.categoryId ?? "",
      amount: line.amount.abs().toFixed(),
    },
  };
}
