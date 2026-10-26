import { beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, categoryId, createAccount, createUser, insertTransaction, rpc } from "./support/db";

/**
 * Two-user isolation (security checklist §5.3): user B must not be able to
 * read, create, change or delete anything belonging to user A.
 */
describe("cross-user isolation", () => {
  let alice: string;
  let bob: string;
  let aliceAccount: string;
  let aliceTx: string;
  let aliceCategory: string;
  let bobAccount: string;

  beforeAll(async () => {
    alice = await createUser("alice");
    bob = await createUser("bob");
    aliceAccount = await createAccount(alice, { opening_balance: "1000" });
    bobAccount = await createAccount(bob);
    aliceCategory = await categoryId(alice, "Salary");
    aliceTx = await insertTransaction(alice, {
      kind: "income",
      lines: [{ account: aliceAccount, amount: "500.00", category: aliceCategory }],
    });
    await rpc(alice, "reconcile_account", [
      { account_id: aliceAccount, statement_date: "2026-02-28", statement_balance: "1500.00" },
    ]);
  });

  const ownedTables = ["profiles", "accounts", "categories", "transactions", "transaction_lines", "audit_events"];

  it.each(ownedTables)("B sees none of A's rows in %s", async (table) => {
    const { rows } = await asUser(bob, (q) =>
      q(`select count(*)::int as n from public.${table} where user_id = $1`, [alice]),
    );
    expect(rows[0].n).toBe(0);
    const own = await asUser(alice, (q) =>
      q(`select count(*)::int as n from public.${table} where user_id = $1`, [alice]),
    );
    expect(own.rows[0].n).toBeGreaterThan(0);
  });

  it("B cannot update or delete A's rows (zero rows affected)", async () => {
    const results = await asUser(bob, async (q) => [
      await q("update public.accounts set name = 'pwned' where id = $1", [aliceAccount]),
      await q("update public.profiles set display_name = 'pwned' where user_id = $1", [alice]),
      await q("update public.transactions set description = 'pwned' where id = $1", [aliceTx]),
      await q("update public.transaction_lines set memo = 'pwned' where transaction_id = $1", [aliceTx]),
      await q("delete from public.transaction_lines where transaction_id = $1", [aliceTx]),
      await q("delete from public.transactions where id = $1", [aliceTx]),
      await q("delete from public.categories where id = $1", [aliceCategory]),
      await q("delete from public.reconciliations where user_id = $1", [alice]),
    ]);
    for (const r of results) expect(r.rowCount).toBe(0);

    const { rows } = await asAdmin((q) =>
      q(
        `select (select name from public.accounts where id = $1) as name,
                (select count(*)::int from public.transaction_lines where transaction_id = $2) as lines`,
        [aliceAccount, aliceTx],
      ),
    );
    expect(rows[0]).toEqual({ name: expect.not.stringMatching("pwned"), lines: 1 });
  });

  it("B cannot insert rows owned by A", async () => {
    await expect(
      asUser(bob, (q) =>
        q(
          `insert into public.accounts (user_id, name, type, currency, opening_date)
           values ($1, 'x', 'cash', 'PKR', '2026-01-01')`,
          [alice],
        ),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("B cannot move their own rows to A", async () => {
    await expect(
      asUser(bob, (q) => q("update public.accounts set user_id = $1 where id = $2", [alice, bobAccount])),
    ).rejects.toThrow(/row-level security/);
  });

  it("B cannot post a line to A's account or attach it to A's transaction", async () => {
    await expect(
      insertTransaction(bob, {
        kind: "adjustment",
        notes: "attack",
        lines: [{ account: aliceAccount, amount: "-1000" }],
      }),
    ).rejects.toThrow(/foreign key/);

    await expect(
      asUser(bob, (q) =>
        q(
          `insert into public.transaction_lines (transaction_id, account_id, amount)
           values ($1, $2, 1)`,
          [aliceTx, bobAccount],
        ),
      ),
    ).rejects.toThrow(/foreign key/);
  });

  it("B cannot use A's category", async () => {
    const bobSalary = await categoryId(bob, "Salary");
    expect(bobSalary).not.toBe(aliceCategory);
    await expect(
      insertTransaction(bob, {
        kind: "income",
        lines: [{ account: bobAccount, amount: "1", category: aliceCategory }],
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it("composite keys block cross-user references even when RLS is bypassed", async () => {
    await expect(
      asAdmin(async (q) => {
        const { rows } = await q(
          `insert into public.transactions (user_id, kind, occurred_on, notes)
           values ($1, 'adjustment', '2026-02-01', 'x') returning id`,
          [bob],
        );
        await q(
          `insert into public.transaction_lines (user_id, transaction_id, account_id, amount)
           values ($1, $2, $3, 1)`,
          [bob, rows[0].id, aliceAccount],
        );
      }),
    ).rejects.toThrow(/foreign key/);
  });

  it("B cannot write the audit log", async () => {
    await expect(
      asUser(bob, (q) =>
        q(
          `insert into public.audit_events (user_id, table_name, record_id, action)
           values ($1, 'accounts', $2, 'delete')`,
          [bob, bobAccount],
        ),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(asUser(bob, (q) => q("delete from public.audit_events"))).rejects.toThrow(/permission denied/);
  });
});
