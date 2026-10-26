import "server-only";
import type { IsoDate } from "@/domain/dates";
import type { Account, Posting, TransactionKind, TransactionStatus } from "@/domain/ledger";
import { Money } from "@/domain/money";
import { DataError, throwIfError } from "@/lib/errors";
import type { TransactionFilterPayload, TransactionListPayload, TransactionPayload } from "../supabase/database.types";
import { createClient } from "../supabase/server";

export type TransactionLineRecord = {
  id: string;
  accountId: string;
  amount: Money;
  categoryId: string | null;
  memo: string | null;
};

export type TransactionRecord = {
  id: string;
  kind: TransactionKind;
  occurredOn: IsoDate;
  description: string;
  payee: string | null;
  notes: string | null;
  tags: string[];
  status: TransactionStatus;
  refundOfId: string | null;
  reconciliationId: string | null;
  createdAt: string;
  /** Opaque version token for optimistic concurrency; pass back unchanged. */
  updatedAt: string;
  lines: TransactionLineRecord[];
};

export type Cursor = NonNullable<TransactionFilterPayload["cursor"]>;
export type TransactionPage = { items: TransactionRecord[]; nextCursor: Cursor | null };

function currencyLookup(accounts: readonly Account[]) {
  const map = new Map(accounts.map((a) => [a.id, a.currency]));
  return (accountId: string) => {
    const c = map.get(accountId);
    if (!c) throw new DataError("unknown_account");
    return c;
  };
}

function toRecord(
  item: TransactionListPayload["items"][number],
  currencyOf: (id: string) => Account["currency"],
): TransactionRecord {
  return {
    id: item.id,
    kind: item.kind,
    occurredOn: item.occurred_on,
    description: item.description,
    payee: item.payee,
    notes: item.notes,
    tags: item.tags,
    status: item.status,
    refundOfId: item.refund_of_id,
    reconciliationId: item.reconciliation_id,
    createdAt: item.created_at,
    updatedAt: item.updated_at,
    lines: item.lines.map((l) => ({
      id: l.id,
      accountId: l.account_id,
      amount: Money.of(l.amount, currencyOf(l.account_id)),
      categoryId: l.category_id,
      memo: l.memo,
    })),
  };
}

export async function listTransactions(
  accounts: readonly Account[],
  filter: TransactionFilterPayload,
  limit = 50,
): Promise<TransactionPage> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("list_transactions", { p_filter: filter, p_limit: limit });
  throwIfError(error);
  const payload = data as TransactionListPayload;
  const currencyOf = currencyLookup(accounts);
  const items = payload.items.map((i) => toRecord(i, currencyOf));
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      payload.has_more && last ? { occurred_on: last.occurredOn, created_at: last.createdAt, id: last.id } : null,
  };
}

export async function getTransaction(accounts: readonly Account[], id: string): Promise<TransactionRecord | null> {
  const page = await listTransactions(accounts, { id }, 1);
  return page.items[0] ?? null;
}

export async function createTransactionRpc(payload: TransactionPayload): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_transaction", { p: payload });
  throwIfError(error);
  return data as string;
}

export async function updateTransactionRpc(
  id: string,
  payload: TransactionPayload,
  expectedUpdatedAt: string,
  unlock: boolean,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_transaction", {
    p_id: id,
    p: payload,
    p_expected_updated_at: expectedUpdatedAt,
    p_unlock: unlock,
  });
  throwIfError(error);
}

export async function deleteTransactionRpc(id: string, expectedUpdatedAt: string, unlock: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_transaction", {
    p_id: id,
    p_expected_updated_at: expectedUpdatedAt,
    p_unlock: unlock,
  });
  throwIfError(error);
}

export type AccountPosting = Posting & {
  transactionId: string;
  createdAt: string;
  kind: TransactionKind;
  description: string;
  payee: string | null;
  categoryId: string | null;
  locked: boolean;
  otherAccountId: string | null;
};

/** Every posting on one account in ledger order (oldest first). */
export async function accountPostings(account: Account): Promise<AccountPosting[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("account_postings", { p_account_id: account.id });
  throwIfError(error);
  return (data ?? []).map((r) => ({
    transactionId: r.transaction_id,
    accountId: account.id,
    amount: Money.of(r.amount, account.currency),
    occurredOn: r.occurred_on,
    status: r.status,
    createdAt: r.created_at,
    kind: r.kind,
    description: r.description,
    payee: r.payee,
    categoryId: r.category_id,
    locked: r.reconciliation_id !== null,
    otherAccountId: r.other_account_id,
  }));
}
