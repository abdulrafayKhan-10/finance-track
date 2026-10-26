import "server-only";
import { type AccountRecord, accountTotals, getAccount, listAccounts } from "@/data/repositories/accounts";
import { listReconciliations, type Reconciliation } from "@/data/repositories/reconciliations";
import { type AccountPosting, accountPostings } from "@/data/repositories/transactions";
import { accountBalance, displayBalance, runningBalances } from "@/domain/ledger";
import { type CurrencyCode, Money } from "@/domain/money";

export type AccountSummary = {
  account: AccountRecord;
  /** Displayed balance: money held, or amount owed for liabilities. */
  balance: Money;
  clearedBalance: Money;
};

export type AccountGroup = {
  key: "assets" | "liabilities" | "inactive";
  title: string;
  items: AccountSummary[];
  /** One total per currency: amounts in different currencies are never added (INV-6). */
  totals: Money[];
};

function totalsByCurrency(items: readonly AccountSummary[]): Money[] {
  const map = new Map<CurrencyCode, Money>();
  for (const { account, balance } of items) {
    map.set(account.currency, (map.get(account.currency) ?? Money.zero(account.currency)).plus(balance));
  }
  return [...map.values()].sort((a, b) => a.currency.localeCompare(b.currency));
}

export async function getAccountsOverview(): Promise<{ groups: AccountGroup[]; count: number }> {
  const accounts = await listAccounts();
  const postings = await accountTotals(accounts);
  const summaries = accounts.map((account) => ({
    account,
    balance: displayBalance(account, accountBalance(account, postings)),
    clearedBalance: displayBalance(account, accountBalance(account, postings, { clearedOnly: true })),
  }));
  const active = summaries.filter((s) => s.account.status === "active");
  const groups: AccountGroup[] = [
    { key: "assets", title: "Assets", items: active.filter((s) => s.account.class === "asset"), totals: [] },
    {
      key: "liabilities",
      title: "Liabilities (owed)",
      items: active.filter((s) => s.account.class === "liability"),
      totals: [],
    },
    {
      key: "inactive",
      title: "Closed and archived",
      items: summaries.filter((s) => s.account.status !== "active"),
      totals: [],
    },
  ];
  for (const g of groups) g.totals = totalsByCurrency(g.items);
  return { groups, count: accounts.length };
}

export type LedgerRow = { posting: AccountPosting; balanceAfter: Money };

export type ReconciliationStatus = Reconciliation & {
  /** True when the cleared balance on the statement date no longer matches what was reconciled. */
  changedSince: boolean;
};

export type AccountDetail = {
  account: AccountRecord;
  balance: Money;
  clearedBalance: Money;
  /** Newest first, with the displayed balance after each posting. */
  rows: LedgerRow[];
  reconciliations: ReconciliationStatus[];
  accountNames: Map<string, string>;
};

export async function getAccountDetail(id: string): Promise<AccountDetail | null> {
  const account = await getAccount(id);
  if (!account) return null;
  const [postings, reconciliations, accounts] = await Promise.all([
    accountPostings(account),
    listReconciliations(account),
    listAccounts(),
  ]);
  const rows = runningBalances(account, postings)
    .map((e) => ({ posting: e.line, balanceAfter: displayBalance(account, e.balanceAfter) }))
    .reverse();

  return {
    account,
    balance: displayBalance(account, accountBalance(account, postings)),
    clearedBalance: displayBalance(account, accountBalance(account, postings, { clearedOnly: true })),
    rows,
    reconciliations: reconciliations.map((r) => {
      const expected = r.adjustmentTransactionId ? r.statementBalance : r.computedClearedBalance;
      const now = accountBalance(account, postings, { asOf: r.statementDate, clearedOnly: true });
      return { ...r, changedSince: !now.equals(expected) };
    }),
    accountNames: new Map(accounts.map((a) => [a.id, a.name])),
  };
}

/** Plain, serialisable account data for client forms. */
export type AccountOption = {
  id: string;
  name: string;
  currency: CurrencyCode;
  class: "asset" | "liability";
  status: AccountRecord["status"];
};

export async function getAccountOptions(): Promise<AccountOption[]> {
  const accounts = await listAccounts();
  return accounts.map((a) => ({ id: a.id, name: a.name, currency: a.currency, class: a.class, status: a.status }));
}
