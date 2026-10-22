import { describe, expect, it } from "vitest";
import { asAdmin, asUser, createAccount, createUser } from "./support/db";

describe("MFA enforcement in the database", () => {
  it("requires an aal2 session once a verified factor exists", async () => {
    const user = await createUser("mfa");
    await createAccount(user, { name: "Before MFA" });
    await asAdmin((q) => q("insert into auth.mfa_factors (user_id, status) values ($1, 'verified')", [user]));

    const aal1 = await asUser(user, (q) => q("select count(*)::int as n from public.accounts"));
    expect(aal1.rows[0].n).toBe(0);
    await expect(
      asUser(user, (q) =>
        q("insert into public.accounts (name, type, currency, opening_date) values ('x', 'cash', 'PKR', '2026-01-01')"),
      ),
    ).rejects.toThrow(/row-level security/);

    const aal2 = await asUser(user, (q) => q("select count(*)::int as n from public.accounts"), { aal: "aal2" });
    expect(aal2.rows[0].n).toBe(1);
  });

  it("an unverified factor does not lock the user out", async () => {
    const user = await createUser("mfa-pending");
    await createAccount(user);
    await asAdmin((q) => q("insert into auth.mfa_factors (user_id) values ($1)", [user]));
    const { rows } = await asUser(user, (q) => q("select count(*)::int as n from public.accounts"));
    expect(rows[0].n).toBe(1);
  });
});

describe("audit history", () => {
  it("records insert, update and delete with before/after images", async () => {
    const user = await createUser("audit");
    const id = await createAccount(user, { name: "Audited", opening_balance: "10" });
    await asUser(user, (q) => q("update public.accounts set opening_balance = 20 where id = $1", [id]));
    await asUser(user, (q) => q("update public.accounts set opening_balance = 20 where id = $1", [id])); // no-op
    await asUser(user, (q) => q("delete from public.accounts where id = $1", [id]));

    const { rows } = await asUser(user, (q) =>
      q(
        `select action, before ->> 'opening_balance' as before, after ->> 'opening_balance' as after, actor
         from public.audit_events where record_id = $1 order by id`,
        [id],
      ),
    );
    expect(rows).toEqual([
      { action: "insert", before: null, after: "10.0000", actor: user },
      { action: "update", before: "10.0000", after: "20.0000", actor: user },
      { action: "delete", before: "20.0000", after: null, actor: user },
    ]);
  });
});
