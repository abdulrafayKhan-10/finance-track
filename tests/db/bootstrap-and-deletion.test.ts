import { describe, expect, it } from "vitest";
import { asAdmin, asUser, categoryId, createAccount, createUser, insertTransaction } from "./support/db";

describe("new-user bootstrap", () => {
  it("creates a PKR / Asia/Karachi profile and default categories", async () => {
    const user = await createUser("boot");
    const { rows: profile } = await asUser(user, (q) =>
      q("select base_currency, timezone, theme from public.profiles"),
    );
    expect(profile).toEqual([{ base_currency: "PKR", timezone: "Asia/Karachi", theme: "system" }]);

    const { rows: categories } = await asUser(user, (q) =>
      q("select kind, count(*)::int as n from public.categories group by kind order by kind"),
    );
    expect(categories).toEqual([
      { kind: "income", n: 4 },
      { kind: "expense", n: 12 },
    ]);
  });

  it("protects system categories from deletion and renaming their key", async () => {
    const user = await createUser("sys");
    const id = await categoryId(user, "Uncategorized expense");
    const res = await asUser(user, (q) => q("delete from public.categories where id = $1", [id]));
    expect(res.rowCount).toBe(0);
    await expect(
      asUser(user, (q) => q("update public.categories set system_key = null where id = $1", [id])),
    ).rejects.toThrow(/system categories are fixed/);
    await expect(
      asUser(user, (q) =>
        q("insert into public.categories (name, kind, system_key) values ('Fake', 'expense', 'fake_key')"),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("enforces two-level categories of matching kind", async () => {
    const user = await createUser("tree");
    const food = await categoryId(user, "Food & groceries");
    const { rows } = await asUser(user, (q) =>
      q("insert into public.categories (name, kind, parent_id) values ('Restaurants', 'expense', $1) returning id", [
        food,
      ]),
    );
    await expect(
      asUser(user, (q) =>
        q("insert into public.categories (name, kind, parent_id) values ('Fast food', 'expense', $1)", [rows[0].id]),
      ),
    ).rejects.toThrow(/cannot be nested/);
    await expect(
      asUser(user, (q) =>
        q("insert into public.categories (name, kind, parent_id) values ('Tips', 'income', $1)", [food]),
      ),
    ).rejects.toThrow(/kind must match/);
  });
});

describe("account deletion", () => {
  it("deleting the auth user removes every owned row", async () => {
    const user = await createUser("leaver");
    const bank = await createAccount(user, { opening_balance: "100" });
    const wallet = await createAccount(user, { type: "cash" });
    await insertTransaction(user, {
      kind: "transfer",
      lines: [
        { account: bank, amount: "-50" },
        { account: wallet, amount: "50" },
      ],
    });
    await asAdmin((q) => q("delete from auth.users where id = $1", [user]));

    const { rows } = await asAdmin((q) =>
      q(
        `select table_name from information_schema.columns
         where table_schema = 'public' and column_name = 'user_id'`,
      ),
    );
    for (const { table_name } of rows) {
      const { rows: left } = await asAdmin((q) =>
        q(`select count(*)::int as n from public.${table_name} where user_id = $1`, [user]),
      );
      expect(left[0].n, table_name).toBe(0);
    }
  });
});
