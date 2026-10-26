import { z } from "zod";
import type { Account, EntryInput, TransactionStatus } from "@/domain/ledger";
import { CASH_KINDS } from "@/domain/ledger";
import { type Money, parseAmount } from "@/domain/money";
import { fieldErrors, type FieldErrors } from "./auth";
import { AMOUNT_ERRORS, formObject, isoDate, optionalText, tags, uuid } from "./form";

const base = z.object({
  occurred_on: isoDate,
  description: optionalText(200),
  payee: optionalText(100),
  notes: optionalText(2000),
  tags,
  status: z.enum(["cleared", "pending"]).default("cleared"),
});

const schema = z.discriminatedUnion("kind", [
  base.extend({
    kind: z.enum(["expense", "income", "refund"]),
    account_id: uuid("an account"),
    category_id: uuid("a category"),
    amount: z.string().default(""),
  }),
  base.extend({
    kind: z.literal("transfer"),
    from_account_id: uuid("the account money leaves"),
    to_account_id: uuid("the account money arrives in"),
    amount: z.string().default(""),
    received_amount: z.string().optional(),
  }),
  base.extend({
    kind: z.literal("adjustment"),
    account_id: uuid("an account"),
    direction: z.enum(["increase", "decrease"], { error: "Choose whether the balance goes up or down." }),
    amount: z.string().default(""),
    notes: z
      .string({ error: "Explain the adjustment; it is kept in the audit history." })
      .trim()
      .min(1, { error: "Explain the adjustment; it is kept in the audit history." })
      .max(2000),
  }),
]);

export type TransactionMeta = {
  occurredOn: string;
  description: string;
  payee: string | null;
  notes: string | null;
  tags: string[];
  status: TransactionStatus;
};

export type ParsedTransaction =
  { ok: true; entry: EntryInput; meta: TransactionMeta } | { ok: false; fieldErrors: FieldErrors };

/**
 * Validates a transaction form against the user's accounts: amounts are
 * parsed in each account's currency (never rounded), and the result is a
 * domain EntryInput whose signs come from buildLines.
 */
export function parseTransactionForm(formData: FormData, accounts: readonly Account[]): ParsedTransaction {
  const raw = formObject(formData);
  if (!(CASH_KINDS as readonly string[]).includes(raw.kind ?? "")) {
    return { ok: false, fieldErrors: { kind: "Choose a transaction type." } };
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) return { ok: false, fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  const errors: FieldErrors = {};

  const account = (field: string, id: string) => {
    const a = byId.get(id);
    if (!a) errors[field] = "That account is not available.";
    return a;
  };
  const amount = (field: string, input: string, a: Account | undefined): Money | undefined => {
    if (!a) return undefined;
    const r = parseAmount(input, a.currency);
    if (!r.ok) {
      errors[field] = AMOUNT_ERRORS[r.error];
      return undefined;
    }
    if (!r.money.isPositive()) {
      errors[field] = "Enter an amount greater than zero.";
      return undefined;
    }
    return r.money;
  };

  let entry: EntryInput | undefined;
  switch (v.kind) {
    case "expense":
    case "income":
    case "refund": {
      const a = account("account_id", v.account_id);
      const m = amount("amount", v.amount, a);
      if (a && m) entry = { kind: v.kind, accountId: a.id, amount: m, categoryId: v.category_id };
      break;
    }
    case "transfer": {
      const from = account("from_account_id", v.from_account_id);
      const to = account("to_account_id", v.to_account_id);
      const sent = amount("amount", v.amount, from);
      if (from && to && from.id === to.id) errors.to_account_id = "Choose two different accounts.";
      let received: Money | undefined;
      if (from && to && sent) {
        received = from.currency === to.currency ? sent : amount("received_amount", v.received_amount ?? "", to);
      }
      if (from && to && sent && received && from.id !== to.id) {
        entry = { kind: "transfer", fromAccountId: from.id, toAccountId: to.id, amount: sent, received };
      }
      break;
    }
    case "adjustment": {
      const a = account("account_id", v.account_id);
      const m = amount("amount", v.amount, a);
      if (a && m)
        entry = { kind: "adjustment", accountId: a.id, accountClass: a.class, direction: v.direction, amount: m };
      break;
    }
  }

  if (!entry || Object.keys(errors).length > 0) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    entry,
    meta: {
      occurredOn: v.occurred_on,
      description: v.description ?? "",
      payee: v.payee,
      notes: v.notes,
      tags: v.tags,
      status: v.status,
    },
  };
}
