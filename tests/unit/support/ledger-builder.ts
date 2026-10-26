import type { IsoDate } from "@/domain/dates";
import { type CurrencyCode, Money } from "@/domain/money";
import {
  type Account,
  type AccountType,
  buildLines,
  classOf,
  type EntryInput,
  type LedgerLine,
  storedFromDisplay,
  type TransactionKind,
  type TransactionStatus,
} from "@/domain/ledger";

/**
 * Readable fixtures: ledger().account("Bank", "PKR", "1000").expense("Bank", "250", "Food", "2026-01-05")
 * Amounts are what a user would type; signs come from buildLines, like the app.
 */
export function ledger() {
  const accounts = new Map<string, Account>();
  const lines: LedgerLine[] = [];
  let seq = 0;

  const acc = (name: string) => {
    const a = accounts.get(name);
    if (!a) throw new Error(`No account ${name}`);
    return a;
  };
  const post = (kind: TransactionKind, input: EntryInput, on: IsoDate, status: TransactionStatus) => {
    const transactionId = `t${++seq}`;
    for (const l of buildLines(input)) {
      lines.push({
        transactionId,
        accountId: l.accountId,
        amount: l.amount,
        categoryId: l.categoryId,
        occurredOn: on,
        status,
        kind,
      });
    }
  };

  const api = {
    accounts,
    lines,
    acc,
    /** Opening balance as displayed (amount owed for liabilities). */
    account(
      name: string,
      currency: CurrencyCode,
      opening = "0",
      type: AccountType = "bank",
      openingDate: IsoDate = "2026-01-01",
    ) {
      const cls = classOf(type);
      accounts.set(name, {
        id: name,
        name,
        type,
        class: cls,
        currency,
        openingBalance: storedFromDisplay({ class: cls }, Money.of(opening, currency)),
        openingDate,
        status: "active",
        includeInNetWorth: true,
        isLiquid: cls === "asset",
      });
      return api;
    },
    income(
      account: string,
      amount: string,
      category = "Salary",
      on: IsoDate = "2026-01-15",
      status: TransactionStatus = "cleared",
    ) {
      post(
        "income",
        { kind: "income", accountId: account, amount: Money.of(amount, acc(account).currency), categoryId: category },
        on,
        status,
      );
      return api;
    },
    expense(
      account: string,
      amount: string,
      category = "Food",
      on: IsoDate = "2026-01-15",
      status: TransactionStatus = "cleared",
    ) {
      post(
        "expense",
        { kind: "expense", accountId: account, amount: Money.of(amount, acc(account).currency), categoryId: category },
        on,
        status,
      );
      return api;
    },
    refund(account: string, amount: string, category = "Food", on: IsoDate = "2026-01-20") {
      post(
        "refund",
        { kind: "refund", accountId: account, amount: Money.of(amount, acc(account).currency), categoryId: category },
        on,
        "cleared",
      );
      return api;
    },
    transfer(
      from: string,
      to: string,
      amount: string,
      received = amount,
      on: IsoDate = "2026-01-10",
      status: TransactionStatus = "cleared",
    ) {
      post(
        "transfer",
        {
          kind: "transfer",
          fromAccountId: from,
          toAccountId: to,
          amount: Money.of(amount, acc(from).currency),
          received: Money.of(received, acc(to).currency),
        },
        on,
        status,
      );
      return api;
    },
    adjust(account: string, direction: "increase" | "decrease", amount: string, on: IsoDate = "2026-01-31") {
      const a = acc(account);
      post(
        "adjustment",
        {
          kind: "adjustment",
          accountId: account,
          accountClass: a.class,
          direction,
          amount: Money.of(amount, a.currency),
        },
        on,
        "cleared",
      );
      return api;
    },
    /** A raw line of any kind, for kinds without an entry builder yet (dividend, interest, fees). */
    raw(kind: TransactionKind, account: string, signedAmount: string, on: IsoDate = "2026-01-15") {
      lines.push({
        transactionId: `t${++seq}`,
        accountId: account,
        amount: Money.of(signedAmount, acc(account).currency),
        categoryId: null,
        occurredOn: on,
        status: "cleared",
        kind,
      });
      return api;
    },
  };
  return api;
}
