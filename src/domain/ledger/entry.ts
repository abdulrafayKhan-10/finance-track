import type { Money } from "../money";
import { storedFromDisplay } from "./balances";
import type { AccountClass } from "./types";

/**
 * What the user types in a transaction form: positive amounts plus intent.
 * `buildLines` turns it into signed ledger lines (§4.1), so forms never deal
 * with signs.
 */
export type EntryInput =
  | { kind: "expense" | "income" | "refund"; accountId: string; amount: Money; categoryId: string }
  | {
      kind: "transfer";
      fromAccountId: string;
      toAccountId: string;
      /** Leaves the source account, in its currency. */
      amount: Money;
      /** Arrives in the destination account, in its currency (equal to `amount` for same-currency transfers). */
      received: Money;
    }
  | {
      kind: "adjustment";
      accountId: string;
      accountClass: AccountClass;
      /** "increase" means a larger displayed balance: more money, or more owed on a liability. */
      direction: "increase" | "decrease";
      amount: Money;
    };

export type BuiltLine = { accountId: string; amount: Money; categoryId: string | null };

export class EntryError extends Error {
  constructor(
    readonly code: "non_positive_amount" | "same_account" | "currency_mismatch",
    message: string,
  ) {
    super(message);
    this.name = "EntryError";
  }
}

function assertPositive(m: Money) {
  if (!m.isPositive()) throw new EntryError("non_positive_amount", "Amounts must be greater than zero.");
}

export function buildLines(input: EntryInput): BuiltLine[] {
  switch (input.kind) {
    case "expense":
      assertPositive(input.amount);
      return [{ accountId: input.accountId, amount: input.amount.negate(), categoryId: input.categoryId }];
    case "income":
    case "refund":
      assertPositive(input.amount);
      return [{ accountId: input.accountId, amount: input.amount, categoryId: input.categoryId }];
    case "transfer":
      assertPositive(input.amount);
      assertPositive(input.received);
      if (input.fromAccountId === input.toAccountId) {
        throw new EntryError("same_account", "Choose two different accounts.");
      }
      if (input.amount.currency === input.received.currency && !input.amount.equals(input.received)) {
        throw new EntryError("currency_mismatch", "A transfer in one currency must arrive with the same amount.");
      }
      return [
        { accountId: input.fromAccountId, amount: input.amount.negate(), categoryId: null },
        { accountId: input.toAccountId, amount: input.received, categoryId: null },
      ];
    case "adjustment": {
      assertPositive(input.amount);
      const displayed = input.direction === "increase" ? input.amount : input.amount.negate();
      return [
        {
          accountId: input.accountId,
          amount: storedFromDisplay({ class: input.accountClass }, displayed),
          categoryId: null,
        },
      ];
    }
  }
}
