import type { IsoDate } from "../dates";
import type { Money } from "../money";
import { accountBalance } from "./balances";
import type { Account, Posting } from "./types";

export type ReconciliationCheck = {
  clearedBalance: Money;
  /** statement − cleared; zero means the account is reconciled. */
  difference: Money;
};

/**
 * Compares a statement balance (stored sign convention) with the cleared
 * balance as of the statement date.
 */
export function checkReconciliation(
  account: Account,
  lines: readonly Posting[],
  statementDate: IsoDate,
  statementBalance: Money,
): ReconciliationCheck {
  const clearedBalance = accountBalance(account, lines, { asOf: statementDate, clearedOnly: true });
  return { clearedBalance, difference: statementBalance.minus(clearedBalance) };
}
