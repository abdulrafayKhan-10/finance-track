import { describe, expect, it } from "vitest";
import { asAdmin, asUser, categoryId, createAccount, createUser, rpc } from "./support/db";

/**
 * Supabase Auth deletes users as `supabase_auth_admin`, a role with no rights
 * on the app's schemas. The cascade must still succeed (migration 0012).
 * This simulates that role: it can only see and delete auth.users.
 */
describe("account deletion by the auth service", () => {
  it("removes a user with every kind of record, as a role with no app privileges", async () => {
    const user = await createUser("auth-delete");
    const bank = await createAccount(user, { name: "Bank", opening_balance: "1000" });
    const broker = await createAccount(user, { name: "Broker", type: "investment" });
    const food = await categoryId(user, "Food & groceries");
    await rpc(user, "create_transaction", [
      { kind: "expense", occurred_on: "2026-03-01", lines: [{ account_id: bank, amount: "-10", category_id: food }] },
    ]);
    await rpc(user, "import_transactions", [
      {
        rows: [
          {
            kind: "expense",
            occurred_on: "2026-03-02",
            lines: [{ account_id: bank, amount: "-1", category_id: food }],
          },
        ],
      },
    ]);
    await asUser(user, async (q) => {
      const asset = (
        await q("insert into public.assets (name, category, currency) values ('Gold', 'gold', 'PKR') returning id")
      ).rows[0].id;
      await q("select public.create_transaction($1)", [
        JSON.stringify({
          kind: "buy",
          occurred_on: "2026-03-03",
          asset_id: asset,
          lines: [{ account_id: bank, amount: "-100" }],
          movements: [{ account_id: broker, quantity: "1", unit_price: "100" }],
        }),
      ]);
      const goal = (
        await q(
          "insert into public.savings_goals (name, target_amount, currency, funding_mode) values ('G', '100', 'PKR', 'allocations') returning id",
        )
      ).rows[0].id;
      await q("insert into public.goal_allocations (goal_id, allocated_on, amount) values ($1, '2026-03-01', '10')", [
        goal,
      ]);
    });
    await rpc(user, "reconcile_account", [
      {
        account_id: bank,
        statement_date: "2026-03-31",
        statement_balance: "0",
        clear_transaction_ids: [],
        create_adjustment: true,
        note: "x",
      },
    ]);

    await asAdmin(async (q) => {
      await q(`do $$ begin
                 if not exists (select 1 from pg_roles where rolname = 'auth_admin_sim') then create role auth_admin_sim; end if;
               end $$`);
      await q("grant usage on schema auth to auth_admin_sim");
      await q("grant select, delete on auth.users to auth_admin_sim");
      await q("set local role auth_admin_sim");
      await q("delete from auth.users where id = $1", [user]);
    });

    const left = await asAdmin((q) =>
      q(
        `select (select count(*) from public.accounts where user_id = $1)::int as accounts,
                (select count(*) from public.transactions where user_id = $1)::int as transactions,
                (select count(*) from public.holding_movements where user_id = $1)::int as movements,
                (select count(*) from public.goal_allocations where user_id = $1)::int as allocations`,
        [user],
      ),
    );
    expect(left.rows[0]).toEqual({ accounts: 0, transactions: 0, movements: 0, allocations: 0 });
  });
});
