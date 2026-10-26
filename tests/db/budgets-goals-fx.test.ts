import { describe, expect, it } from "vitest";
import { asAdmin, asUser, categoryId, createAccount, createUser, errorCode, rpc } from "./support/db";

const code = async (p: Promise<unknown>) => errorCode(p);

describe("budgets", () => {
  it("accepts top-level expense categories and one overall limit per month", async () => {
    const u = await createUser("budget");
    const food = await categoryId(u, "Food & groceries");
    await asUser(u, (q) =>
      q(
        `insert into public.budgets (month, category_id, amount, currency) values
         ('2026-03-01', $1, 30000, 'PKR'), ('2026-03-01', null, 100000, 'PKR')`,
        [food],
      ),
    );
    // Same category twice in a month, and a second overall limit, are rejected.
    expect(
      await code(
        asUser(u, (q) =>
          q("insert into public.budgets (month, category_id, amount, currency) values ('2026-03-01', $1, 1, 'PKR')", [
            food,
          ]),
        ),
      ),
    ).toBe("23505");
    expect(
      await code(
        asUser(u, (q) =>
          q("insert into public.budgets (month, category_id, amount, currency) values ('2026-03-01', null, 1, 'PKR')"),
        ),
      ),
    ).toBe("23505");
  });

  it("rejects income categories, subcategories, mid-month dates, zero and over-precise amounts", async () => {
    const u = await createUser("budget-bad");
    const salary = await categoryId(u, "Salary");
    const food = await categoryId(u, "Food & groceries");
    const { rows } = await asUser(u, (q) =>
      q("insert into public.categories (name, kind, parent_id) values ('Dining', 'expense', $1) returning id", [food]),
    );
    const ins = (cat: string | null, month = "2026-03-01", amount = "10") =>
      asUser(u, (q) =>
        q("insert into public.budgets (month, category_id, amount, currency) values ($1, $2, $3, 'PKR')", [
          month,
          cat,
          amount,
        ]),
      );
    expect(await code(ins(salary))).toBe("FT007");
    expect(await code(ins(rows[0].id))).toBe("FT007");
    expect(await code(ins(food, "2026-03-15"))).toBe("23514");
    expect(await code(ins(food, "2026-03-01", "0"))).toBe("23514");
    expect(await code(ins(food, "2026-03-01", "1.005"))).toBe("FT007");
  });

  it("copies a month without overwriting existing budgets", async () => {
    const u = await createUser("budget-copy");
    const food = await categoryId(u, "Food & groceries");
    const rent = await categoryId(u, "Housing & rent");
    await asUser(u, (q) =>
      q(
        `insert into public.budgets (month, category_id, amount, currency) values
         ('2026-03-01', $1, 30000, 'PKR'), ('2026-03-01', $2, 50000, 'PKR'), ('2026-04-01', $1, 35000, 'PKR')`,
        [food, rent],
      ),
    );
    expect(await rpc<number>(u, "copy_budgets", ["2026-03-01", "2026-04-01"])).toBe(1);
    const { rows } = await asUser(u, (q) =>
      q("select category_id, amount::text from public.budgets where month = '2026-04-01' order by amount"),
    );
    expect(rows).toEqual([
      { category_id: food, amount: "35000.0000" },
      { category_id: rent, amount: "50000.0000" },
    ]);
  });

  it("merging categories adds same-month budgets together", async () => {
    const u = await createUser("budget-merge");
    const shop = await categoryId(u, "Shopping");
    const ent = await categoryId(u, "Entertainment");
    await asUser(u, (q) =>
      q(
        `insert into public.budgets (month, category_id, amount, currency) values
         ('2026-03-01', $1, 1000, 'PKR'), ('2026-03-01', $2, 500, 'PKR'), ('2026-04-01', $1, 700, 'PKR')`,
        [shop, ent],
      ),
    );
    await rpc(u, "merge_category", [shop, ent]);
    const { rows } = await asUser(u, (q) =>
      q("select month::text, category_id, amount::text from public.budgets order by month"),
    );
    expect(rows).toEqual([
      { month: "2026-03-01", category_id: ent, amount: "1500.0000" },
      { month: "2026-04-01", category_id: ent, amount: "700.0000" },
    ]);
  });
});

describe("savings goals", () => {
  it("links to asset accounts only and keeps the mode consistent", async () => {
    const u = await createUser("goal");
    const bank = await createAccount(u, { name: "Savings", type: "savings" });
    const card = await createAccount(u, { name: "Card", type: "credit_card" });
    const ins = (mode: string, account: string | null) =>
      asUser(u, (q) =>
        q(
          "insert into public.savings_goals (name, target_amount, currency, funding_mode, linked_account_id) values ($1, 100, 'PKR', $2, $3) returning id",
          [`g-${mode}-${account}`, mode, account],
        ),
      );
    await ins("linked_account", bank);
    expect(await code(ins("linked_account", card))).toBe("FT007");
    expect(await code(ins("linked_account", null))).toBe("23514");
    expect(await code(ins("allocations", bank))).toBe("23514");
  });

  it("allocations can't overdraw the goal, must match currencies, and only apply to allocation goals", async () => {
    const u = await createUser("goal-alloc");
    const pkr = await createAccount(u, { name: "PKR", opening_balance: "1000" });
    const usd = await createAccount(u, { name: "USD", currency: "USD" });
    const {
      rows: [goal],
    } = await asUser(u, (q) =>
      q(
        "insert into public.savings_goals (name, target_amount, currency, funding_mode) values ('Trip', 500, 'PKR', 'allocations') returning id",
      ),
    );
    const {
      rows: [linked],
    } = await asUser(u, (q) =>
      q(
        "insert into public.savings_goals (name, target_amount, currency, funding_mode, linked_account_id) values ('Linked', 500, 'PKR', 'linked_account', $1) returning id",
        [pkr],
      ),
    );
    const alloc = (goalId: string, amount: string, source: string | null = pkr) =>
      asUser(u, (q) =>
        q(
          "insert into public.goal_allocations (goal_id, allocated_on, amount, source_account_id) values ($1, '2026-03-01', $2, $3)",
          [goalId, amount, source],
        ),
      );
    await alloc(goal.id, "200");
    await alloc(goal.id, "-50");
    expect(await code(alloc(goal.id, "-151"))).toBe("FT007");
    expect(await code(alloc(goal.id, "10", usd))).toBe("FT007");
    expect(await code(alloc(linked.id, "10"))).toBe("FT007");
    expect(await code(alloc(goal.id, "1.234"))).toBe("FT007");
    // Allocations are earmarks: the account balance is untouched.
    const { rows } = await asUser(u, (q) => q("select count(*)::int n from public.transaction_lines"));
    expect(rows[0].n).toBe(0);
    // Allocation history is append-only: no updates.
    expect(await code(asUser(u, (q) => q("update public.goal_allocations set amount = 1")))).toBe("42501");
  });

  it("locks mode and currency once allocations exist", async () => {
    const u = await createUser("goal-lock");
    const acct = await createAccount(u);
    const {
      rows: [goal],
    } = await asUser(u, (q) =>
      q(
        "insert into public.savings_goals (name, target_amount, currency, funding_mode) values ('G', 500, 'PKR', 'allocations') returning id",
      ),
    );
    await asUser(u, (q) =>
      q("insert into public.goal_allocations (goal_id, allocated_on, amount) values ($1, '2026-03-01', 5)", [goal.id]),
    );
    expect(
      await code(
        asUser(u, (q) =>
          q("update public.savings_goals set funding_mode = 'linked_account', linked_account_id = $2 where id = $1", [
            goal.id,
            acct,
          ]),
        ),
      ),
    ).toBe("FT007");
    expect(
      await code(asUser(u, (q) => q("update public.savings_goals set currency = 'USD' where id = $1", [goal.id]))),
    ).toBe("FT007");
  });
});

describe("exchange rates and snapshots", () => {
  it("stores one rate per pair and date, positive and between different currencies", async () => {
    const u = await createUser("fx");
    const ins = (base: string, quote: string, rate: string, on = "2026-03-01") =>
      asUser(u, (q) =>
        q("insert into public.exchange_rates (base, quote, rate, effective_on) values ($1, $2, $3, $4)", [
          base,
          quote,
          rate,
          on,
        ]),
      );
    await ins("USD", "PKR", "280.5");
    expect(await code(ins("USD", "PKR", "281"))).toBe("23505");
    expect(await code(ins("USD", "USD", "1"))).toBe("23514");
    expect(await code(ins("USD", "PKR", "0", "2026-03-02"))).toBe("23514");
    expect(await code(ins("XXX", "PKR", "1", "2026-03-02"))).toBe("23503");
  });

  it("snapshots are immutable and must add up", async () => {
    const u = await createUser("snap");
    const ins = (assets: string, liabilities: string, nw: string, on = "2026-03-31") =>
      asUser(u, (q) =>
        q(
          `insert into public.net_worth_snapshots (as_of, base_currency, total_assets, total_liabilities, net_worth, method_version, details)
           values ($1, 'PKR', $2, $3, $4, 1, '{}') returning id`,
          [on, assets, liabilities, nw],
        ),
      );
    await ins("100", "30", "70");
    expect(await code(ins("100", "30", "71", "2026-04-30"))).toBe("23514");
    expect(await code(ins("1", "0", "1"))).toBe("23505"); // one per date
    expect(await code(asUser(u, (q) => q("update public.net_worth_snapshots set net_worth = 0")))).toBe("42501");
  });

  it("ledger_lines returns plain lines with kind and date, filtered by period", async () => {
    const u = await createUser("lines");
    const acct = await createAccount(u);
    const sal = await categoryId(u, "Salary");
    for (const on of ["2026-02-28", "2026-03-01", "2026-03-31", "2026-04-01"]) {
      await rpc(u, "create_transaction", [
        { kind: "income", occurred_on: on, lines: [{ account_id: acct, amount: "1", category_id: sal }] },
      ]);
    }
    const { rows } = await asUser(u, (q) =>
      q("select occurred_on::text, kind, amount from public.ledger_lines('2026-03-01', '2026-03-31')"),
    );
    expect(rows).toEqual([
      { occurred_on: "2026-03-01", kind: "income", amount: "1.0000" },
      { occurred_on: "2026-03-31", kind: "income", amount: "1.0000" },
    ]);
  });
});

describe("cross-user isolation for Phase 4 tables", () => {
  it("B can't read or change A's budgets, goals, allocations, rates or snapshots", async () => {
    const a = await createUser("p4-a");
    const b = await createUser("p4-b");
    const food = await categoryId(a, "Food & groceries");
    const acct = await createAccount(a);
    await asUser(a, async (q) => {
      await q(
        "insert into public.budgets (month, category_id, amount, currency) values ('2026-03-01', $1, 10, 'PKR')",
        [food],
      );
      const { rows } = await q(
        "insert into public.savings_goals (name, target_amount, currency, funding_mode) values ('G', 5, 'PKR', 'allocations') returning id",
      );
      await q("insert into public.goal_allocations (goal_id, allocated_on, amount) values ($1, '2026-03-01', 1)", [
        rows[0].id,
      ]);
      await q(
        "insert into public.exchange_rates (base, quote, rate, effective_on) values ('USD', 'PKR', 280, '2026-03-01')",
      );
      await q(`insert into public.net_worth_snapshots (as_of, base_currency, total_assets, total_liabilities, net_worth, method_version, details)
               values ('2026-03-31', 'PKR', 1, 0, 1, 1, '{}')`);
    });
    for (const table of ["budgets", "savings_goals", "goal_allocations", "exchange_rates", "net_worth_snapshots"]) {
      const seen = await asUser(b, (q) => q(`select count(*)::int n from public.${table} where user_id = $1`, [a]));
      expect(seen.rows[0].n, table).toBe(0);
      const del = await asUser(b, (q) => q(`delete from public.${table} where user_id = $1`, [a]));
      expect(del.rowCount, table).toBe(0);
    }
    const upd = await asUser(b, (q) => q("update public.budgets set amount = 1 where user_id = $1", [a]));
    expect(upd.rowCount).toBe(0);
    // B can't point a goal at A's account, or budget A's category.
    expect(
      await code(
        asUser(b, (q) =>
          q(
            "insert into public.savings_goals (name, target_amount, currency, funding_mode, linked_account_id) values ('X', 1, 'PKR', 'linked_account', $1)",
            [acct],
          ),
        ),
      ),
    ).not.toBe("none");
    expect(
      await code(
        asUser(b, (q) =>
          q("insert into public.budgets (month, category_id, amount, currency) values ('2026-03-01', $1, 1, 'PKR')", [
            food,
          ]),
        ),
      ),
    ).not.toBe("none");
    const lines = await asUser(b, (q) => q("select * from public.ledger_lines(null, null)"));
    expect(lines.rows).toEqual([]);
    expect(await rpc<number>(b, "copy_budgets", ["2026-03-01", "2026-04-01"])).toBe(0);
    const still = await asAdmin((q) => q("select count(*)::int n from public.budgets where user_id = $1", [a]));
    expect(still.rows[0].n).toBe(1);
  });
});
