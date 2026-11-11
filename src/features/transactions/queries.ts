import "server-only";
import { type AccountRecord, listAccounts } from "@/data/repositories/accounts";
import { transactionAudit } from "@/data/repositories/audit";
import {
  type Cursor,
  getTransaction,
  listTransactions,
  type TransactionRecord,
} from "@/data/repositories/transactions";
import type { TransactionFilterPayload } from "@/data/supabase/database.types";
import { listAssets } from "@/data/repositories/investments";
import { TRANSACTION_KINDS, type TransactionKind } from "@/domain/ledger";
import { Dec, type Money } from "@/domain/money";
import { isIsoDate } from "@/domain/dates";
import { formatQuantity } from "@/lib/format";
import { getCategoryNames } from "../categories/queries";

async function assetInfo(): Promise<Map<string, AssetInfo>> {
  const assets = await listAssets();
  return new Map(assets.map((a) => [a.id, { name: a.name, unitLabel: a.unitLabel }]));
}

export type TransactionView = TransactionRecord & {
  /**
   * What the list shows: signed effect for single-account kinds, amount sent
   * for transfers. Null for opening holdings and splits, which move no cash.
   */
  headline: Money | null;
  /** For investment transactions: "+100 shares" or "−2.5 tola". */
  quantityLabel: string | null;
  accountLabel: string;
  /** The category, or for investment transactions the asset. */
  categoryLabel: string | null;
};

type AssetInfo = { name: string; unitLabel: string };

function describe(
  t: TransactionRecord,
  accounts: Map<string, AccountRecord>,
  categories: Map<string, string>,
  assets: Map<string, AssetInfo>,
): TransactionView {
  const name = (id: string) => accounts.get(id)?.name ?? "Unknown account";
  const first = t.lines[0];
  if (t.assetId !== null || t.movements.length > 0 || !first) {
    const asset = t.assetId ? assets.get(t.assetId) : undefined;
    const accountIds = [...new Set([...t.movements.map((m) => m.accountId), ...t.lines.map((l) => l.accountId)])];
    const qty = t.movements.reduce((sum, m) => sum.plus(m.quantity), new Dec(0));
    return {
      ...t,
      headline: first ? t.lines.slice(1).reduce((sum, l) => sum.plus(l.amount), first.amount) : null,
      quantityLabel:
        t.movements.length > 0
          ? `${qty.isNegative() ? "" : "+"}${formatQuantity(qty)} ${asset?.unitLabel ?? "units"}`
          : null,
      accountLabel: accountIds.map(name).join(", "),
      categoryLabel: asset?.name ?? null,
    };
  }
  if (t.kind === "transfer") {
    const out = t.lines.find((l) => l.amount.isNegative()) ?? first!;
    const into = t.lines.find((l) => l.amount.isPositive()) ?? first!;
    return {
      ...t,
      headline: out.amount.abs(),
      quantityLabel: null,
      accountLabel: `${name(out.accountId)} → ${name(into.accountId)}`,
      categoryLabel: null,
    };
  }
  const accountIds = [...new Set(t.lines.map((l) => l.accountId))];
  const headline = t.lines.slice(1).reduce((sum, l) => sum.plus(l.amount), first!.amount);
  const cats = [...new Set(t.lines.map((l) => l.categoryId).filter((c): c is string => c !== null))];
  return {
    ...t,
    headline,
    quantityLabel: null,
    accountLabel: accountIds.map(name).join(", "),
    categoryLabel: cats.length ? cats.map((c) => categories.get(c) ?? "Unknown").join(", ") : null,
  };
}

/** URL search params → validated filter. Unknown or malformed values are dropped. */
export type TransactionSearch = {
  q?: string;
  account?: string;
  category?: string;
  kind?: TransactionKind;
  status?: "cleared" | "pending";
  from?: string;
  to?: string;
  tag?: string;
  order?: "asc" | "desc";
  cursor?: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseSearch(params: Record<string, string | string[] | undefined>): TransactionSearch {
  const one = (k: string) => {
    const v = params[k];
    return typeof v === "string" && v.length > 0 && v.length <= 200 ? v : undefined;
  };
  const s: TransactionSearch = {};
  const q = one("q");
  if (q) s.q = q.trim().slice(0, 100);
  const account = one("account");
  if (account && UUID.test(account)) s.account = account;
  const category = one("category");
  if (category && UUID.test(category)) s.category = category;
  const kind = one("kind");
  if (kind && (TRANSACTION_KINDS as readonly string[]).includes(kind)) s.kind = kind as TransactionKind;
  const status = one("status");
  if (status === "cleared" || status === "pending") s.status = status;
  const from = one("from");
  if (from && isIsoDate(from)) s.from = from;
  const to = one("to");
  if (to && isIsoDate(to)) s.to = to;
  const tag = one("tag");
  if (tag) s.tag = tag.trim().toLowerCase().slice(0, 30);
  if (one("order") === "asc") s.order = "asc";
  const cursor = one("cursor");
  if (cursor) s.cursor = cursor;
  return s;
}

export function encodeCursor(c: Cursor): string {
  return Buffer.from(JSON.stringify(c)).toString("base64url");
}

function decodeCursor(value: string | undefined): Cursor | undefined {
  if (!value) return undefined;
  try {
    const c = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<Cursor>;
    if (
      typeof c.id === "string" &&
      UUID.test(c.id) &&
      typeof c.created_at === "string" &&
      isIsoDate(String(c.occurred_on))
    ) {
      return { id: c.id, created_at: c.created_at.slice(0, 40), occurred_on: String(c.occurred_on) };
    }
  } catch {
    // fall through: an invalid cursor starts from the first page
  }
  return undefined;
}

export async function getTransactionPage(search: TransactionSearch, pageSize = 50) {
  const [accounts, categories, assets] = await Promise.all([listAccounts(), getCategoryNames(), assetInfo()]);
  const filter: TransactionFilterPayload = {
    q: search.q,
    account_id: search.account,
    category_id: search.category,
    kinds: search.kind ? [search.kind] : undefined,
    status: search.status,
    from: search.from,
    to: search.to,
    tag: search.tag,
    order: search.order,
    cursor: decodeCursor(search.cursor),
  };
  const page = await listTransactions(accounts, filter, pageSize);
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return {
    items: page.items.map((t) => describe(t, byId, categories, assets)),
    nextCursor: page.nextCursor ? encodeCursor(page.nextCursor) : null,
    accounts,
  };
}

export async function getTransactionDetail(id: string) {
  const [accounts, categories, assets] = await Promise.all([listAccounts(), getCategoryNames(), assetInfo()]);
  const record = await getTransaction(accounts, id);
  if (!record) return null;
  const byId = new Map(accounts.map((a) => [a.id, a]));
  return { view: describe(record, byId, categories, assets), accounts, audit: await transactionAudit(id) };
}
