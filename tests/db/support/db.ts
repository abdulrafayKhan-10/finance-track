import { randomUUID } from "node:crypto";
import { Pool, type PoolClient } from "pg";
import { afterAll, inject } from "vitest";

const pool = new Pool({ connectionString: inject("databaseUrl"), max: 4 });
afterAll(() => pool.end());

export type Query = PoolClient["query"];

/** Runs `fn` as the superuser (bypasses RLS) inside a committed transaction. */
export async function asAdmin<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  return inTransaction(fn);
}

/**
 * Runs `fn` exactly as PostgREST would for a signed-in user: role
 * `authenticated` with the JWT claims set for the transaction. The
 * transaction commits, so deferred constraint triggers run.
 */
export async function asUser<T>(
  userId: string,
  fn: (q: Query) => Promise<T>,
  { aal = "aal1" }: { aal?: "aal1" | "aal2" } = {},
): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated", aal });
  return inTransaction(async (q) => {
    await q("select set_config('request.jwt.claims', $1, true)", [claims]);
    await q("set local role authenticated");
    return fn(q);
  });
}

export async function asAnon<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  return inTransaction(async (q) => {
    await q("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
    await q("set local role anon");
    return fn(q);
  });
}

async function inTransaction<T>(fn: (q: Query) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  const q = client.query.bind(client) as Query;
  try {
    await q("begin");
    const result = await fn(q);
    await q("commit");
    return result;
  } catch (error) {
    await q("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

/** Creates an auth user; the bootstrap trigger adds their profile and categories. */
export async function createUser(label = "user"): Promise<string> {
  const id = randomUUID();
  await asAdmin((q) => q("insert into auth.users (id, email) values ($1, $2)", [id, `${label}-${id}@test.local`]));
  return id;
}

export async function createAccount(
  userId: string,
  overrides: Partial<{
    name: string;
    type: string;
    currency: string;
    opening_balance: string;
    opening_date: string;
  }> = {},
): Promise<string> {
  const a = {
    name: `Account ${randomUUID().slice(0, 8)}`,
    type: "bank",
    currency: "PKR",
    opening_balance: "0",
    opening_date: "2026-01-01",
    ...overrides,
  };
  const { rows } = await asUser(userId, (q) =>
    q(
      `insert into public.accounts (name, type, currency, opening_balance, opening_date)
       values ($1, $2, $3, $4, $5) returning id`,
      [a.name, a.type, a.currency, a.opening_balance, a.opening_date],
    ),
  );
  return rows[0].id;
}

export async function categoryId(userId: string, name: string): Promise<string> {
  const { rows } = await asAdmin((q) =>
    q("select id from public.categories where user_id = $1 and name = $2", [userId, name]),
  );
  if (!rows[0]) throw new Error(`No category ${name}`);
  return rows[0].id;
}

export type LineInput = { account: string; amount: string; category?: string | null };

/** Inserts a header and its lines in one database transaction as the user. */
export async function insertTransaction(
  userId: string,
  tx: { kind: string; occurred_on?: string; notes?: string; refund_of_id?: string; lines: LineInput[] },
): Promise<string> {
  return asUser(userId, async (q) => {
    const { rows } = await q(
      `insert into public.transactions (kind, occurred_on, notes, refund_of_id)
       values ($1, $2, $3, $4) returning id`,
      [tx.kind, tx.occurred_on ?? "2026-02-01", tx.notes ?? null, tx.refund_of_id ?? null],
    );
    const id: string = rows[0].id;
    for (const line of tx.lines) {
      await q(
        `insert into public.transaction_lines (transaction_id, account_id, amount, category_id)
         values ($1, $2, $3, $4)`,
        [id, line.account, line.amount, line.category ?? null],
      );
    }
    return id;
  });
}
