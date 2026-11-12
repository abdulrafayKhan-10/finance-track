import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, e2eEnv, type TestUser } from "./support/env";

/**
 * Security checklist (docs/05 §5.3) against the REAL dev project, through the
 * same API the browser uses: two users, A and B. B must not be able to read,
 * change or delete anything of A's in any table, nor reach it through an RPC.
 * Also checks anonymous access. Every temporary user is deleted afterwards.
 */
test.describe.configure({ mode: "serial" });

const { url, publishable } = e2eEnv();
const users: TestUser[] = [];
let a: SupabaseClient;
let b: SupabaseClient;
const ids: Record<string, string> = {};

const client = () => createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(user: TestUser) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return c;
}

test.beforeAll(async () => {
  users.push(await createTestUser("iso-a"), await createTestUser("iso-b"));
  a = await signedIn(users[0]!);
  b = await signedIn(users[1]!);
});

test.afterAll(async () => {
  const failed: string[] = [];
  for (const u of users) await deleteTestUser(u.id).catch(() => failed.push(u.email));
  if (failed.length) throw new Error(`Could not delete test users (is migration 0012 applied?): ${failed.join(", ")}`);
});

test("A creates records in every kind of table", async () => {
  const one = async (
    p: PromiseLike<{ data: unknown; error: { message: string; code?: string } | null }>,
    label: string,
  ) => {
    const { data, error } = await p;
    if (error) throw new Error(`${label}: ${error.code} ${error.message}`);
    return data as { id: string };
  };
  ids.account = (
    await one(
      a
        .from("accounts")
        .insert({ name: "A bank", type: "bank", currency: "PKR", opening_balance: "1000", opening_date: "2026-01-01" })
        .select("id")
        .single(),
      "account",
    )
  ).id;
  ids.broker = (
    await one(
      a
        .from("accounts")
        .insert({
          name: "A broker",
          type: "investment",
          currency: "PKR",
          opening_balance: "0",
          opening_date: "2026-01-01",
        })
        .select("id")
        .single(),
      "broker",
    )
  ).id;
  const cat = await one(a.from("categories").select("id").eq("name", "Food & groceries").single(), "category");
  ids.category = cat.id;
  ids.transaction = (await one(
    a.rpc("create_transaction", {
      p: {
        kind: "expense",
        occurred_on: "2026-03-01",
        description: "A secret",
        lines: [{ account_id: ids.account, amount: "-10", category_id: ids.category }],
      },
    }),
    "transaction",
  )) as unknown as string;
  ids.budget = (
    await one(
      a
        .from("budgets")
        .insert({ month: "2026-03-01", category_id: ids.category, amount: "500", currency: "PKR" })
        .select("id")
        .single(),
      "budget",
    )
  ).id;
  ids.goal = (
    await one(
      a
        .from("savings_goals")
        .insert({ name: "A goal", target_amount: "1000", currency: "PKR", funding_mode: "allocations" })
        .select("id")
        .single(),
      "goal",
    )
  ).id;
  ids.rate = (
    await one(
      a
        .from("exchange_rates")
        .insert({ base: "USD", quote: "PKR", rate: "280", effective_on: "2026-01-01" })
        .select("id")
        .single(),
      "rate",
    )
  ).id;
  try {
    ids.asset = (
      await one(
        a
          .from("assets")
          .insert({
            name: "A gold",
            category: "gold",
            currency: "PKR",
            quantity_scale: 4,
            unit_label: "tola",
            valuation_mode: "manual",
          })
          .select("id")
          .single(),
        "asset",
      )
    ).id;
    ids.valuation = (
      await one(
        a
          .from("asset_valuations")
          .insert({ asset_id: ids.asset, valued_on: "2026-03-01", unit_price: "200000", entered_as: "unit_price" })
          .select("id")
          .single(),
        "valuation",
      )
    ).id;
    await one(
      a.rpc("create_transaction", {
        p: {
          kind: "opening_holding",
          occurred_on: "2026-02-01",
          asset_id: ids.asset,
          movements: [{ account_id: ids.broker, quantity: "1", cost_amount: "150000" }],
        },
      }),
      "holding",
    );
  } catch (error) {
    missing.push(`0010 investments (${(error as Error).message.slice(0, 80)})`);
  }
  try {
    ids.batch = (await one(
      a.rpc("import_transactions", {
        p: {
          file_name: "a.csv",
          summary: {},
          rows: [
            {
              kind: "expense",
              occurred_on: "2026-03-02",
              description: "A import",
              lines: [{ account_id: ids.account, amount: "-1", category_id: ids.category }],
            },
          ],
        },
      }),
      "import",
    )) as unknown as string;
  } catch (error) {
    missing.push(`0011 imports (${(error as Error).message.slice(0, 80)})`);
  }
});

/** Tables or functions a migration hasn't created yet on this project: reported at the end, never silently passed. */
const missing: string[] = [];
const absent = (error: { code?: string } | null) => error?.code === "PGRST205" || error?.code === "PGRST202";

test("B sees none of A's rows in any table", async () => {
  for (const table of [
    "accounts",
    "transactions",
    "transaction_lines",
    "budgets",
    "savings_goals",
    "goal_allocations",
    "exchange_rates",
    "net_worth_snapshots",
    "reconciliations",
    "assets",
    "asset_valuations",
    "holding_movements",
    "import_batches",
    "audit_events",
  ]) {
    const { data, error } = await b.from(table).select("*");
    if (absent(error)) continue;
    expect(error, table).toBeNull();
    expect(data, table).toEqual([]);
  }
  const cats = await b.from("categories").select("id").eq("id", ids.category);
  expect(cats.data).toEqual([]);
  const profiles = await b.from("profiles").select("user_id");
  expect(profiles.data?.map((p) => p.user_id)).toEqual([users[1]!.id]);
});

test("B can't change or delete A's rows", async () => {
  for (const [table, id, patch] of [
    ["accounts", ids.account, { name: "pwned" }],
    ["budgets", ids.budget, { amount: "1" }],
    ["savings_goals", ids.goal, { name: "pwned" }],
    ["assets", ids.asset, { name: "pwned" }],
    ["categories", ids.category, { name: "pwned" }],
  ] as const) {
    if (!id) continue;
    const upd = await b.from(table).update(patch).eq("id", id).select("id");
    expect(upd.data ?? [], `update ${table}`).toEqual([]);
    const del = await b.from(table).delete().eq("id", id).select("id");
    expect(del.data ?? [], `delete ${table}`).toEqual([]);
  }
  const still = await a.from("accounts").select("name").eq("id", ids.account).single();
  expect(still.data?.name).toBe("A bank");
});

test("B can't reach A's data through RPCs", async () => {
  const list = await b.rpc("list_transactions", { p_filter: { id: ids.transaction }, p_limit: 10 });
  expect((list.data as { items: unknown[] }).items).toEqual([]);
  const del = await b.rpc("delete_transaction", {
    p_id: ids.transaction,
    p_expected_updated_at: new Date().toISOString(),
    p_unlock: true,
  });
  expect(del.error?.code).toBe("FT404");
  const post = await b.rpc("create_transaction", {
    p: {
      kind: "expense",
      occurred_on: "2026-03-01",
      lines: [{ account_id: ids.account, amount: "-1", category_id: ids.category }],
    },
  });
  expect(post.error).not.toBeNull();
  if (ids.batch) {
    const undo = await b.rpc("undo_import", { p_batch_id: ids.batch, p_unlock: true });
    expect(undo.error?.code).toBe("FT404");
  }
  for (const fn of ["ledger_lines", "holding_movements_list", "asset_cash_lines", "account_line_totals"]) {
    const r = await b.rpc(fn, {});
    if (absent(r.error)) continue;
    expect(r.error, fn).toBeNull();
    expect(r.data ?? [], fn).toEqual([]);
  }
  const ok = await a.from("transactions").select("id").eq("id", ids.transaction);
  expect(ok.data).toHaveLength(1);
});

test("anonymous callers get nothing", async () => {
  const anon = client();
  for (const table of ["accounts", "transactions", "assets", "currencies"]) {
    const r = await anon.from(table).select("*").limit(1);
    if (absent(r.error)) continue;
    expect(r.error?.code, table).toBe("42501");
  }
  const rpc = await anon.rpc("create_transaction", { p: {} });
  expect(rpc.error?.code).toBe("42501");
});

test("every migration is applied to this project", () => {
  expect(missing, "Apply the missing migrations in the Supabase SQL Editor").toEqual([]);
});
