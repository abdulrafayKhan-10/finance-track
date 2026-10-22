import { beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, categoryId, createAccount, createUser, insertTransaction } from "./support/db";

/** The deferred shape trigger enforces docs/04-accounting-rules.md §3.4 at commit. */
describe("ledger shape invariant", () => {
  let user: string;
  let bank: string;
  let wallet: string;
  let usdBank: string;
  let salary: string;
  let food: string;

  beforeAll(async () => {
    user = await createUser("ledger");
    bank = await createAccount(user, { name: "Bank", opening_balance: "10000" });
    wallet = await createAccount(user, { name: "Wallet", type: "digital_wallet" });
    usdBank = await createAccount(user, { name: "USD Bank", currency: "USD" });
    salary = await categoryId(user, "Salary");
    food = await categoryId(user, "Food & groceries");
  });

  describe("accepts valid shapes", () => {
    it("income", async () => {
      await insertTransaction(user, { kind: "income", lines: [{ account: bank, amount: "250000", category: salary }] });
    });
    it("split expense on one account", async () => {
      const utilities = await categoryId(user, "Utilities");
      await insertTransaction(user, {
        kind: "expense",
        lines: [
          { account: bank, amount: "-1200.50", category: food },
          { account: bank, amount: "-800", category: utilities },
        ],
      });
    });
    it("refund linked to an expense", async () => {
      const original = await insertTransaction(user, {
        kind: "expense",
        lines: [{ account: bank, amount: "-500", category: food }],
      });
      await insertTransaction(user, {
        kind: "refund",
        refund_of_id: original,
        lines: [{ account: bank, amount: "500", category: food }],
      });
    });
    it("balanced same-currency transfer", async () => {
      await insertTransaction(user, {
        kind: "transfer",
        lines: [
          { account: bank, amount: "-5000" },
          { account: wallet, amount: "5000" },
        ],
      });
    });
    it("cross-currency transfer with legs in each account's currency", async () => {
      await insertTransaction(user, {
        kind: "transfer",
        lines: [
          { account: bank, amount: "-28000" },
          { account: usdBank, amount: "100" },
        ],
      });
    });
    it("adjustment with a note", async () => {
      await insertTransaction(user, {
        kind: "adjustment",
        notes: "Reconciliation difference",
        lines: [{ account: wallet, amount: "-3.25" }],
      });
    });
  });

  describe("rejects invalid shapes", () => {
    const cases: Array<[string, () => Parameters<typeof insertTransaction>[1]]> = [
      [
        "an unbalanced transfer",
        () => ({
          kind: "transfer",
          lines: [
            { account: bank, amount: "-100" },
            { account: wallet, amount: "99.99" },
          ],
        }),
      ],
      ["a one-legged transfer", () => ({ kind: "transfer", lines: [{ account: bank, amount: "-100" }] })],
      [
        "a transfer to the same account",
        () => ({
          kind: "transfer",
          lines: [
            { account: bank, amount: "-100" },
            { account: bank, amount: "100" },
          ],
        }),
      ],
      [
        "a transfer with a category",
        () => ({
          kind: "transfer",
          lines: [
            { account: bank, amount: "-100", category: food },
            { account: wallet, amount: "100" },
          ],
        }),
      ],
      ["negative income", () => ({ kind: "income", lines: [{ account: bank, amount: "-100", category: salary }] })],
      ["income without a category", () => ({ kind: "income", lines: [{ account: bank, amount: "100" }] })],
      [
        "an expense with an income category",
        () => ({ kind: "expense", lines: [{ account: bank, amount: "-100", category: salary }] }),
      ],
      [
        "an expense across two accounts",
        () => ({
          kind: "expense",
          lines: [
            { account: bank, amount: "-1", category: food },
            { account: wallet, amount: "-1", category: food },
          ],
        }),
      ],
      ["a negative refund", () => ({ kind: "refund", lines: [{ account: bank, amount: "-100", category: food }] })],
      ["a header without lines", () => ({ kind: "expense", lines: [] })],
      ["an adjustment without a note", () => ({ kind: "adjustment", lines: [{ account: bank, amount: "1" }] })],
      [
        "a transaction before the account opened",
        () => ({
          kind: "income",
          occurred_on: "2025-12-31",
          lines: [{ account: bank, amount: "1", category: salary }],
        }),
      ],
      ["an investment kind before Phase 5", () => ({ kind: "buy", lines: [{ account: bank, amount: "-100" }] })],
    ];

    it.each(cases)("%s", async (_name, build) => {
      await expect(insertTransaction(user, build())).rejects.toThrow(
        /transaction_shape_invalid|violates check constraint/,
      );
    });

    it("a refund that points at an income", async () => {
      const income = await insertTransaction(user, {
        kind: "income",
        lines: [{ account: bank, amount: "1", category: salary }],
      });
      await expect(
        insertTransaction(user, {
          kind: "refund",
          refund_of_id: income,
          lines: [{ account: bank, amount: "1", category: food }],
        }),
      ).rejects.toThrow(/transaction_shape_invalid/);
    });
  });

  it("a rejected transaction leaves nothing behind (atomic)", async () => {
    const count = async () =>
      (await asAdmin((q) => q("select count(*)::int as n from public.transactions where user_id = $1", [user]))).rows[0]
        .n;
    const before = await count();
    await expect(
      insertTransaction(user, {
        kind: "transfer",
        lines: [
          { account: bank, amount: "-1" },
          { account: wallet, amount: "2" },
        ],
      }),
    ).rejects.toThrow();
    expect(await count()).toBe(before);
  });

  it("cannot delete one leg of a transfer, but can delete the whole transfer", async () => {
    const id = await insertTransaction(user, {
      kind: "transfer",
      lines: [
        { account: bank, amount: "-10" },
        { account: wallet, amount: "10" },
      ],
    });
    await expect(
      asUser(user, (q) => q("delete from public.transaction_lines where transaction_id = $1 and amount < 0", [id])),
    ).rejects.toThrow(/transaction_shape_invalid/);
    await asUser(user, (q) => q("delete from public.transactions where id = $1", [id]));
    const { rows } = await asAdmin((q) =>
      q("select count(*)::int as n from public.transaction_lines where transaction_id = $1", [id]),
    );
    expect(rows[0].n).toBe(0);
  });

  it("cannot edit a line so a transfer stops balancing", async () => {
    const id = await insertTransaction(user, {
      kind: "transfer",
      lines: [
        { account: bank, amount: "-10" },
        { account: wallet, amount: "10" },
      ],
    });
    await expect(
      asUser(user, (q) =>
        q("update public.transaction_lines set amount = 11 where transaction_id = $1 and amount > 0", [id]),
      ),
    ).rejects.toThrow(/transaction_shape_invalid/);
  });

  it("locks account currency, class and opening date once lines exist", async () => {
    await expect(
      asUser(user, (q) => q("update public.accounts set currency = 'USD' where id = $1", [bank])),
    ).rejects.toThrow(/account_locked_field/);
    await expect(
      asUser(user, (q) => q("update public.accounts set type = 'credit_card' where id = $1", [bank])),
    ).rejects.toThrow(/account_locked_field/);
    await expect(
      asUser(user, (q) => q("update public.accounts set opening_date = '2026-06-01' where id = $1", [bank])),
    ).rejects.toThrow(/account_locked_field/);
    // Allowed: same class, earlier opening date, renaming.
    await asUser(user, (q) =>
      q("update public.accounts set type = 'savings', opening_date = '2025-01-01', name = 'Main bank' where id = $1", [
        bank,
      ]),
    );
  });

  it("cannot delete an account that has transactions", async () => {
    await expect(asUser(user, (q) => q("delete from public.accounts where id = $1", [wallet]))).rejects.toThrow(
      /foreign key/,
    );
  });

  it("derives the account class from its type", async () => {
    const card = await createAccount(user, { name: "Card", type: "credit_card" });
    const { rows } = await asAdmin((q) =>
      q("select id, class, is_liquid from public.accounts where id = any($1) order by name", [[card, usdBank]]),
    );
    expect(rows.map((r) => [r.class, r.is_liquid])).toEqual([
      ["liability", false],
      ["asset", true],
    ]);
  });
});
