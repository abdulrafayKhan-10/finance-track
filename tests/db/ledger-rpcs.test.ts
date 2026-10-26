import { beforeAll, describe, expect, it } from "vitest";
import { accountBalance, type Account, type LedgerLine } from "@/domain/ledger";
import { Money } from "@/domain/money";
import { asAdmin, asUser, categoryId, createAccount, createUser, errorCode, rpc } from "./support/db";

type ListResult = {
  items: Array<{
    id: string;
    kind: string;
    occurred_on: string;
    description: string;
    status: string;
    tags: string[];
    created_at: string;
    updated_at: string;
    reconciliation_id: string | null;
    lines: Array<{ account_id: string; amount: string; category_id: string | null }>;
  }>;
  has_more: boolean;
};

let user: string;
let bank: string;
let wallet: string;
let yen: string;
let salary: string;
let food: string;

beforeAll(async () => {
  user = await createUser("rpc");
  bank = await createAccount(user, { name: "Bank", opening_balance: "10000" });
  wallet = await createAccount(user, { name: "Wallet", type: "digital_wallet" });
  yen = await createAccount(user, { name: "Yen", currency: "JPY" });
  salary = await categoryId(user, "Salary");
  food = await categoryId(user, "Food & groceries");
});

const income = (amount: string, extra: Record<string, unknown> = {}) => ({
  kind: "income",
  occurred_on: "2026-03-01",
  description: "Salary",
  lines: [{ account_id: bank, amount, category_id: salary }],
  ...extra,
});

async function get(id: string) {
  const r = await rpc<ListResult>(user, "list_transactions", [{ id }, 1]);
  return r.items[0]!;
}

async function totals(accountId: string) {
  const rows = await asUser(user, (q) =>
    q("select status, total from public.account_line_totals(null) where account_id = $1", [accountId]),
  );
  return Object.fromEntries(rows.rows.map((r) => [r.status, r.total]));
}

describe("create_transaction", () => {
  it("writes header and lines and returns exact text amounts", async () => {
    const id = await rpc<string>(user, "create_transaction", [income("1250.50", { tags: ["work", " work ", ""] })]);
    const tx = await get(id);
    expect(tx).toMatchObject({ kind: "income", description: "Salary", status: "cleared", tags: ["work"] });
    expect(tx.lines).toEqual([expect.objectContaining({ account_id: bank, amount: "1250.5000", category_id: salary })]);
  });

  it("reports shape errors from the call itself and writes nothing (INV-10)", async () => {
    const before = (
      await asAdmin((q) => q("select count(*)::int n from public.transactions where user_id = $1", [user]))
    ).rows[0].n;
    const code = await errorCode(
      rpc(user, "create_transaction", [
        {
          kind: "transfer",
          occurred_on: "2026-03-02",
          lines: [
            { account_id: bank, amount: "-100" },
            { account_id: wallet, amount: "90" },
          ],
        },
      ]),
    );
    expect(code).toBe("FT001");
    const after = (
      await asAdmin((q) => q("select count(*)::int n from public.transactions where user_id = $1", [user]))
    ).rows[0].n;
    expect(after).toBe(before);
  });

  it("rejects more decimals than the currency allows instead of rounding", async () => {
    expect(await errorCode(rpc(user, "create_transaction", [income("10.005")]))).toBe("FT001");
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          { kind: "adjustment", occurred_on: "2026-03-02", notes: "x", lines: [{ account_id: yen, amount: "1.5" }] },
        ]),
      ),
    ).toBe("FT001");
    // Trailing zeros are fine.
    await rpc(user, "create_transaction", [
      { kind: "adjustment", occurred_on: "2026-03-02", notes: "x", lines: [{ account_id: yen, amount: "15.00" }] },
    ]);
  });

  it("rejects malformed payloads", async () => {
    expect(await errorCode(rpc(user, "create_transaction", [{ ...income("1"), lines: "nope" }]))).toBe("FT007");
    expect(await errorCode(rpc(user, "create_transaction", [income("abc")]))).toBe("FT007");
  });
});

describe("update_transaction and delete_transaction", () => {
  it("replace lines atomically and keep balances consistent (INV-8)", async () => {
    const acc = await createAccount(user, { name: "Edit target", opening_balance: "500" });
    const mk = (amount: string) => ({
      kind: "expense",
      occurred_on: "2026-03-05",
      lines: [{ account_id: acc, amount, category_id: food }],
    });
    const a = await rpc<string>(user, "create_transaction", [mk("-100")]);
    const b = await rpc<string>(user, "create_transaction", [mk("-50")]);
    await rpc<string>(user, "create_transaction", [mk("-25")]);

    const txA = await get(a);
    await rpc(user, "update_transaction", [a, mk("-60"), txA.updated_at, false]);
    const txB = await get(b);
    await rpc(user, "delete_transaction", [b, txB.updated_at, false]);

    expect(await totals(acc)).toEqual({ cleared: "-85.0000" });
    expect((await get(a)).lines.map((l) => l.amount)).toEqual(["-60.0000"]);
  });

  it("can turn an expense into a transfer, but not into an invalid shape", async () => {
    const id = await rpc<string>(user, "create_transaction", [
      { kind: "expense", occurred_on: "2026-03-06", lines: [{ account_id: bank, amount: "-10", category_id: food }] },
    ]);
    const tx = await get(id);
    const bad = await errorCode(
      rpc(user, "update_transaction", [
        id,
        { kind: "transfer", occurred_on: "2026-03-06", lines: [{ account_id: bank, amount: "-10" }] },
        tx.updated_at,
        false,
      ]),
    );
    expect(bad).toBe("FT001");
    expect((await get(id)).kind).toBe("expense"); // unchanged after the failed edit
    await rpc(user, "update_transaction", [
      id,
      {
        kind: "transfer",
        occurred_on: "2026-03-06",
        lines: [
          { account_id: bank, amount: "-10" },
          { account_id: wallet, amount: "10" },
        ],
      },
      tx.updated_at,
      false,
    ]);
    expect((await get(id)).kind).toBe("transfer");
  });

  it("refuses to overwrite a change made elsewhere (edit conflict)", async () => {
    const id = await rpc<string>(user, "create_transaction", [income("1")]);
    const stale = (await get(id)).updated_at;
    await rpc(user, "update_transaction", [id, income("2"), stale, false]);
    expect(await errorCode(rpc(user, "update_transaction", [id, income("3"), stale, false]))).toBe("FT005");
    expect(await errorCode(rpc(user, "delete_transaction", [id, stale, false]))).toBe("FT005");
  });

  it("keeps archived accounts closed to new postings but editable for old ones", async () => {
    const old = await createAccount(user, { name: "Old wallet", type: "cash" });
    const id = await rpc<string>(user, "create_transaction", [
      { kind: "income", occurred_on: "2026-03-01", lines: [{ account_id: old, amount: "5", category_id: salary }] },
    ]);
    await asUser(user, (q) => q("update public.accounts set status = 'archived' where id = $1", [old]));
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          { kind: "income", occurred_on: "2026-03-02", lines: [{ account_id: old, amount: "5", category_id: salary }] },
        ]),
      ),
    ).toBe("FT004");
    const tx = await get(id);
    await rpc(user, "update_transaction", [
      id,
      {
        kind: "income",
        occurred_on: "2026-03-01",
        description: "fixed",
        lines: [{ account_id: old, amount: "5", category_id: salary }],
      },
      tx.updated_at,
      false,
    ]);
  });

  it("audits edits and deletes with before images", async () => {
    const id = await rpc<string>(user, "create_transaction", [income("7")]);
    await rpc(user, "delete_transaction", [id, (await get(id)).updated_at, false]);
    const { rows } = await asUser(user, (q) =>
      q(
        "select action, before ->> 'kind' as kind from public.audit_events where table_name = 'transactions' and record_id = $1 order by id",
        [id],
      ),
    );
    expect(rows).toEqual([
      { action: "insert", kind: null },
      { action: "delete", kind: "income" },
    ]);
  });
});

describe("list_transactions", () => {
  let listUser: string;
  let a: string;
  let b: string;
  let eat: string;
  let restaurants: string;

  beforeAll(async () => {
    listUser = await createUser("list");
    a = await createAccount(listUser, { name: "A", opening_balance: "0" });
    b = await createAccount(listUser, { name: "B", type: "cash" });
    eat = await categoryId(listUser, "Food & groceries");
    const { rows } = await asUser(listUser, (q) =>
      q("insert into public.categories (name, kind, parent_id) values ('Restaurants', 'expense', $1) returning id", [
        eat,
      ]),
    );
    restaurants = rows[0].id;
    const sal = await categoryId(listUser, "Salary");
    const mk = (day: number, extra: Record<string, unknown>) =>
      rpc(listUser, "create_transaction", [{ occurred_on: `2026-04-${String(day).padStart(2, "0")}`, ...extra }]);
    await mk(1, {
      kind: "income",
      description: "April salary",
      lines: [{ account_id: a, amount: "1000", category_id: sal }],
    });
    await mk(2, {
      kind: "expense",
      description: "Groceries 100% fresh",
      tags: ["home"],
      lines: [{ account_id: a, amount: "-50", category_id: eat }],
    });
    await mk(2, {
      kind: "expense",
      description: "Dinner",
      status: "pending",
      lines: [{ account_id: a, amount: "-30", category_id: restaurants }],
    });
    await mk(3, {
      kind: "transfer",
      description: "Cash",
      lines: [
        { account_id: a, amount: "-100" },
        { account_id: b, amount: "100" },
      ],
    });
    await mk(4, { kind: "expense", description: "Tea", lines: [{ account_id: b, amount: "-5", category_id: eat }] });
    await mk(5, {
      kind: "expense",
      description: "Snacks_mix",
      lines: [{ account_id: b, amount: "-7", category_id: eat }],
    });
    await mk(6, { kind: "income", description: "Bonus", lines: [{ account_id: a, amount: "200", category_id: sal }] });
  });

  const list = (filter: Record<string, unknown>, limit = 50) =>
    rpc<ListResult>(listUser, "list_transactions", [filter, limit]);
  const descs = (r: ListResult) => r.items.map((i) => i.description);

  it("orders newest first by default and oldest first on request", async () => {
    expect(descs(await list({}))).toEqual([
      "Bonus",
      "Snacks_mix",
      "Tea",
      "Cash",
      "Dinner",
      "Groceries 100% fresh",
      "April salary",
    ]);
    expect(descs(await list({ order: "asc" }))[0]).toBe("April salary");
  });

  it("paginates with a keyset cursor without gaps or repeats", async () => {
    const seen: string[] = [];
    let cursor: Record<string, string> | undefined;
    for (let page = 0; page < 5; page++) {
      const r = await list(cursor ? { cursor } : {}, 3);
      seen.push(...descs(r));
      if (!r.has_more) break;
      const last = r.items.at(-1)!;
      cursor = { occurred_on: last.occurred_on, created_at: last.created_at, id: last.id };
    }
    expect(seen).toEqual(descs(await list({})));
  });

  it("filters by account, category (with subcategories), kind, status, dates and tag", async () => {
    expect(descs(await list({ account_id: b }))).toEqual(["Snacks_mix", "Tea", "Cash"]);
    expect(descs(await list({ category_id: eat })).sort()).toEqual([
      "Dinner",
      "Groceries 100% fresh",
      "Snacks_mix",
      "Tea",
    ]);
    expect(descs(await list({ category_id: restaurants }))).toEqual(["Dinner"]);
    expect(descs(await list({ kinds: ["income"] }))).toEqual(["Bonus", "April salary"]);
    expect(descs(await list({ status: "pending" }))).toEqual(["Dinner"]);
    expect(descs(await list({ from: "2026-04-02", to: "2026-04-03" }))).toEqual([
      "Cash",
      "Dinner",
      "Groceries 100% fresh",
    ]);
    expect(descs(await list({ tag: "home" }))).toEqual(["Groceries 100% fresh"]);
  });

  it("searches text with %, _ and \\ treated literally", async () => {
    expect(descs(await list({ q: "100%" }))).toEqual(["Groceries 100% fresh"]);
    expect(descs(await list({ q: "s_m" }))).toEqual(["Snacks_mix"]);
    expect(descs(await list({ q: "%" }))).toEqual(["Groceries 100% fresh"]);
    expect(descs(await list({ q: "\\" }))).toEqual([]);
  });

  it("returns postings with the other side of transfers", async () => {
    const { rows } = await asUser(listUser, (q) =>
      q("select description, amount, other_account_id from public.account_postings($1)", [b]),
    );
    expect(rows).toEqual([
      { description: "Cash", amount: "100.0000", other_account_id: a },
      { description: "Tea", amount: "-5.0000", other_account_id: null },
      { description: "Snacks_mix", amount: "-7.0000", other_account_id: null },
    ]);
  });

  it("agrees with the domain balance formula", async () => {
    const { rows } = await asUser(listUser, (q) =>
      q("select account_id, status, total, last_on from public.account_line_totals(null)"),
    );
    const account: Account = {
      id: a,
      name: "A",
      type: "bank",
      class: "asset",
      currency: "PKR",
      openingBalance: Money.of("0", "PKR"),
      openingDate: "2026-01-01",
      status: "active",
      includeInNetWorth: true,
      isLiquid: true,
    };
    const postings: LedgerLine[] = rows.map((r) => ({
      transactionId: "agg",
      accountId: r.account_id,
      amount: Money.of(r.total, "PKR"),
      categoryId: null,
      occurredOn: r.last_on.toISOString?.().slice(0, 10) ?? String(r.last_on),
      status: r.status,
      kind: "income",
    }));
    expect(
      accountBalance(
        account,
        postings.filter((p) => p.accountId === a),
      ).toFixed(),
    ).toBe("1020.00");
    expect(
      accountBalance(
        account,
        postings.filter((p) => p.accountId === a),
        { clearedOnly: true },
      ).toFixed(),
    ).toBe("1050.00");
  });
});

describe("merge_category", () => {
  it("moves lines to the target and removes the source", async () => {
    const u = await createUser("merge");
    const acct = await createAccount(u);
    const shopping = await categoryId(u, "Shopping");
    const ent = await categoryId(u, "Entertainment");
    await rpc(u, "create_transaction", [
      {
        kind: "expense",
        occurred_on: "2026-03-01",
        lines: [{ account_id: acct, amount: "-9", category_id: shopping }],
      },
    ]);
    await rpc(u, "merge_category", [shopping, ent]);
    const { rows } = await asUser(u, (q) => q("select category_id from public.transaction_lines"));
    expect(rows).toEqual([{ category_id: ent }]);
    const left = await asUser(u, (q) => q("select count(*)::int n from public.categories where id = $1", [shopping]));
    expect(left.rows[0].n).toBe(0);
  });

  it("refuses system categories, different kinds and self-merges", async () => {
    const u = await createUser("merge2");
    const sys = await categoryId(u, "Uncategorized expense");
    const ent = await categoryId(u, "Entertainment");
    const sal = await categoryId(u, "Salary");
    expect(await errorCode(rpc(u, "merge_category", [sys, ent]))).toBe("FT007");
    expect(await errorCode(rpc(u, "merge_category", [ent, sal]))).toBe("FT007");
    expect(await errorCode(rpc(u, "merge_category", [ent, ent]))).toBe("FT007");
  });
});

describe("reconcile_account", () => {
  it("clears ticked items, records the difference, adjusts, and locks what it covers", async () => {
    const u = await createUser("recon");
    const acct = await createAccount(u, { name: "Checking", opening_balance: "1000" });
    const cat = await categoryId(u, "Food & groceries");
    const exp = (amount: string, on: string, status = "pending") =>
      rpc<string>(u, "create_transaction", [
        { kind: "expense", occurred_on: on, status, lines: [{ account_id: acct, amount, category_id: cat }] },
      ]);
    const t1 = await exp("-100", "2026-03-10");
    const t2 = await exp("-50", "2026-03-12");
    const t3 = await exp("-70", "2026-04-02"); // after the statement date

    const recId = await rpc<string>(u, "reconcile_account", [
      {
        account_id: acct,
        statement_date: "2026-03-31",
        statement_balance: "845.00",
        clear_transaction_ids: [t1, t2, t3],
        create_adjustment: true,
      },
    ]);

    const {
      rows: [rec],
    } = await asUser(u, (q) =>
      q(
        "select computed_cleared_balance, difference, adjustment_transaction_id from public.reconciliations where id = $1",
        [recId],
      ),
    );
    expect(rec).toMatchObject({ computed_cleared_balance: "850.0000", difference: "-5.0000" });
    expect(rec.adjustment_transaction_id).not.toBeNull();

    const { rows } = await asUser(u, (q) =>
      q(
        "select id, kind, status, reconciliation_id is not null as locked from public.transactions order by occurred_on, created_at",
      ),
    );
    expect(rows.map((r) => [r.kind, r.status, r.locked])).toEqual([
      ["expense", "cleared", true],
      ["expense", "cleared", true],
      ["adjustment", "cleared", true],
      ["expense", "pending", false], // dated after the statement: untouched
    ]);

    // The cleared balance now matches the statement.
    const after = await asUser(u, (q) =>
      q(
        "select coalesce(sum(total::numeric), 0)::text as s from public.account_line_totals('2026-03-31') where account_id = $1 and status = 'cleared'",
        [acct],
      ),
    );
    expect(Money.of("1000", "PKR").plus(Money.of(after.rows[0].s, "PKR")).toFixed()).toBe("845.00");

    // Locked: editing needs an explicit unlock, which also detaches it.
    const tx = (await rpc<ListResult>(u, "list_transactions", [{ id: t1 }, 1])).items[0]!;
    const edit = {
      kind: "expense",
      occurred_on: "2026-03-10",
      status: "cleared",
      lines: [{ account_id: acct, amount: "-101", category_id: cat }],
    };
    expect(await errorCode(rpc(u, "update_transaction", [t1, edit, tx.updated_at, false]))).toBe("FT006");
    expect(await errorCode(rpc(u, "delete_transaction", [t1, tx.updated_at, false]))).toBe("FT006");
    await rpc(u, "update_transaction", [t1, edit, tx.updated_at, true]);
    expect((await rpc<ListResult>(u, "list_transactions", [{ id: t1 }, 1])).items[0]!.reconciliation_id).toBeNull();

    // Deleting the reconciliation unlocks the rest.
    await asUser(u, (q) => q("delete from public.reconciliations where id = $1", [recId]));
    const locked = await asUser(u, (q) =>
      q("select count(*)::int n from public.transactions where reconciliation_id is not null"),
    );
    expect(locked.rows[0].n).toBe(0);
  });

  it("rejects statement dates before the account opened and over-precise balances", async () => {
    const u = await createUser("recon2");
    const acct = await createAccount(u, { opening_date: "2026-02-01" });
    expect(
      await errorCode(
        rpc(u, "reconcile_account", [{ account_id: acct, statement_date: "2026-01-31", statement_balance: "0" }]),
      ),
    ).toBe("FT007");
    expect(
      await errorCode(
        rpc(u, "reconcile_account", [{ account_id: acct, statement_date: "2026-02-28", statement_balance: "1.001" }]),
      ),
    ).toBe("FT007");
  });
});

describe("cross-user access through functions", () => {
  it("B cannot read, edit, delete, reconcile or merge A's records", async () => {
    const alice = await createUser("fn-alice");
    const bob = await createUser("fn-bob");
    const acct = await createAccount(alice, { opening_balance: "100" });
    const bobAcct = await createAccount(bob);
    const cat = await categoryId(alice, "Food & groceries");
    const ent = await categoryId(alice, "Entertainment");
    const id = await rpc<string>(alice, "create_transaction", [
      { kind: "expense", occurred_on: "2026-03-01", lines: [{ account_id: acct, amount: "-10", category_id: cat }] },
    ]);
    const tx = (await rpc<ListResult>(alice, "list_transactions", [{ id }, 1])).items[0]!;

    expect((await rpc<ListResult>(bob, "list_transactions", [{ id }, 1])).items).toEqual([]);
    expect((await rpc<ListResult>(bob, "list_transactions", [{}, 50])).items).toEqual([]);
    const postings = await asUser(bob, (q) => q("select * from public.account_postings($1)", [acct]));
    expect(postings.rows).toEqual([]);
    const totals = await asUser(bob, (q) => q("select * from public.account_line_totals(null)"));
    expect(totals.rows).toEqual([]);

    expect(
      await errorCode(
        rpc(bob, "update_transaction", [
          id,
          {
            kind: "expense",
            occurred_on: "2026-03-01",
            lines: [{ account_id: bobAcct, amount: "-1", category_id: cat }],
          },
          tx.updated_at,
          true,
        ]),
      ),
    ).toBe("FT404");
    expect(await errorCode(rpc(bob, "delete_transaction", [id, tx.updated_at, true]))).toBe("FT404");
    expect(
      await errorCode(
        rpc(bob, "reconcile_account", [
          { account_id: acct, statement_date: "2026-03-31", statement_balance: "0", create_adjustment: true },
        ]),
      ),
    ).toBe("FT404");
    expect(await errorCode(rpc(bob, "merge_category", [cat, ent]))).toBe("FT404");
    // B posting to A's account or category via the RPC fails on the composite keys.
    expect(
      await errorCode(
        rpc(bob, "create_transaction", [
          { kind: "expense", occurred_on: "2026-03-01", lines: [{ account_id: acct, amount: "-1", category_id: cat }] },
        ]),
      ),
    ).toBe("23503");

    const still = (await rpc<ListResult>(alice, "list_transactions", [{ id }, 1])).items[0]!;
    expect(still.lines[0]!.amount).toBe("-10.0000");
  });
});

describe("transaction_history", () => {
  it("has one entry per save, including amount-only edits", async () => {
    const u = await createUser("history");
    const acct = await createAccount(u);
    const cat = await categoryId(u, "Food & groceries");
    const body = (amount: string) => ({
      kind: "expense",
      occurred_on: "2026-03-01",
      description: "same",
      lines: [{ account_id: acct, amount, category_id: cat }],
    });
    const id = await rpc<string>(u, "create_transaction", [body("-10")]);
    const v1 = (await rpc<ListResult>(u, "list_transactions", [{ id }, 1])).items[0]!.updated_at;
    await rpc(u, "update_transaction", [id, body("-12"), v1, false]); // only the amount changes
    const { rows } = await asUser(u, (q) => q("select header_actions from public.transaction_history($1)", [id]));
    expect(rows.map((r) => r.header_actions)).toEqual([[], ["insert"]]);

    const other = await createUser("history-other");
    const { rows: none } = await asUser(other, (q) => q("select * from public.transaction_history($1)", [id]));
    expect(none).toEqual([]);
  });
});
