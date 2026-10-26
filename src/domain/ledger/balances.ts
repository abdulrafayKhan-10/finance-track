import type { IsoDate } from "../dates";
import { Money } from "../money";
import type { Account, Posting } from "./types";

export type BalanceOptions = {
  /** Include only lines dated on or before this date. */
  asOf?: IsoDate;
  /** Cleared balance (reconciliation) instead of the working balance (§4.1, ACC-PEND-1). */
  clearedOnly?: boolean;
};

/**
 * Balance = opening balance + Σ lines on the account (ACC-BAL). This is the
 * single source of truth for account balances; nothing else adds lines up.
 */
export function accountBalance(account: Account, lines: readonly Posting[], options: BalanceOptions = {}): Money {
  let balance = account.openingBalance;
  if (options.asOf !== undefined && account.openingDate > options.asOf) return Money.zero(account.currency);
  for (const line of lines) {
    if (line.accountId !== account.id) continue;
    if (options.asOf !== undefined && line.occurredOn > options.asOf) continue;
    if (options.clearedOnly && line.status !== "cleared") continue;
    balance = balance.plus(line.amount); // throws on a currency mismatch
  }
  return balance;
}

/** What the UI shows: liabilities read as a positive amount owed (§4.1). */
export function displayBalance(account: Pick<Account, "class">, balance: Money): Money {
  return account.class === "liability" ? balance.negate() : balance;
}

/** Converts a user-entered figure (amount owed for liabilities) to the stored signed value. */
export function storedFromDisplay(account: Pick<Account, "class">, displayed: Money): Money {
  return account.class === "liability" ? displayed.negate() : displayed;
}

export type RunningEntry<T extends Posting> = { line: T; balanceAfter: Money };

/**
 * Lines of one account in ledger order with the balance after each.
 * Order: date, then the caller's order within a day (pass lines sorted by creation).
 */
export function runningBalances<T extends Posting>(account: Account, lines: readonly T[]): RunningEntry<T>[] {
  const own = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => line.accountId === account.id)
    .sort((a, b) =>
      a.line.occurredOn === b.line.occurredOn ? a.index - b.index : a.line.occurredOn < b.line.occurredOn ? -1 : 1,
    );
  let balance = account.openingBalance;
  return own.map(({ line }) => {
    balance = balance.plus(line.amount);
    return { line, balanceAfter: balance };
  });
}
