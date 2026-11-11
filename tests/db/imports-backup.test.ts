import { describe, expect, it } from "vitest";
import { BACKUP_TABLE_NAMES, BACKUP_TABLES, type BackupRow, PROFILE_COLUMNS } from "@/lib/backup";
import { asAdmin, asUser, categoryId, createAccount, createUser, errorCode, type Query, rpc } from "./support/db";

const expense = (account: string, category: string, amount: string, on = "2026-03-01", fp?: string) => ({
  kind: "expense",
  occurred_on: on,
  description: "Imported",
  lines: [{ account_id: account, amount: `-${amount}`, category_id: category }],
  ...(fp ? { import_fingerprint: fp } : {}),
});

/** Exactly what the app exports: the backup select lists, run as the user. */
type Exported = { profile: BackupRow } & Record<(typeof BACKUP_TABLE_NAMES)[number], BackupRow[]>;

async function exportAll(userId: string): Promise<Exported> {
  return asUser(userId, async (q: Query) => {
    const profile = (await q(`select ${PROFILE_COLUMNS} from public.profiles`)).rows[0] as BackupRow;
    const tables: Record<string, BackupRow[]> = {};
    for (const t of BACKUP_TABLE_NAMES) {
      tables[t] = (await q(`select ${BACKUP_TABLES[t]} from public.${t} order by id`)).rows;
    }
    return { profile, ...tables } as Exported;
  });
}

/** Derived figures that must survive a round trip unchanged. */
async function figures(userId: string) {
  return asUser(userId, async (q: Query) => ({
    totals: (await q("select account_id, status, total from public.account_line_totals(null) order by 1, 2")).rows,
    positions: (
      await q(
        `select account_id, asset_id, sum(quantity::numeric)::text as qty
           from public.holding_movements_list(null) group by 1, 2 order by 1, 2`,
      )
    ).rows,
  }));
}

describe("CSV import batches", () => {
  it("saves all rows in one batch, or nothing when any row fails", async () => {
    const user = await createUser("imp");
    const bank = await createAccount(user, { name: "Bank", opening_balance: "1000" });
    const food = await categoryId(user, "Food & groceries");

    const code = await errorCode(
      rpc(user, "import_transactions", [
        {
          file_name: "bad.csv",
          rows: [expense(bank, food, "10"), expense(bank, food, "0.001"), expense(bank, food, "5", "2025-01-01")],
        },
      ]),
    );
    expect(code).toBe("FT010");
    const none = await asUser(user, (q) => q("select count(*)::int as n from public.transactions"));
    expect(none.rows[0].n).toBe(0);
    const batches = await asUser(user, (q) => q("select count(*)::int as n from public.import_batches"));
    expect(batches.rows[0].n).toBe(0);

    const batch = await rpc<string>(user, "import_transactions", [
      { file_name: "ok.csv", summary: { account_id: bank }, rows: [expense(bank, food, "10", "2026-03-01", "fp1")] },
    ]);
    const saved = await asUser(user, (q) => q("select import_batch_id, import_fingerprint from public.transactions"));
    expect(saved.rows).toEqual([{ import_batch_id: batch, import_fingerprint: "fp1" }]);
  });

  it("reports which rows failed", async () => {
    const user = await createUser("imp-detail");
    const bank = await createAccount(user, { name: "Bank" });
    const food = await categoryId(user, "Food & groceries");
    try {
      await rpc(user, "import_transactions", [
        { rows: [expense(bank, food, "1"), expense(bank, food, "1.234"), expense(bank, food, "2")] },
      ]);
      throw new Error("expected failure");
    } catch (error) {
      expect(JSON.parse((error as { detail: string }).detail)).toEqual([{ row: 2, code: "FT001" }]);
    }
  });

  it("refuses investment kinds", async () => {
    const user = await createUser("imp-kind");
    const bank = await createAccount(user, { name: "Bank" });
    const code = await errorCode(
      rpc(user, "import_transactions", [
        { rows: [{ kind: "dividend", occurred_on: "2026-03-01", lines: [{ account_id: bank, amount: "1" }] }] },
      ]),
    );
    expect(code).toBe("FT010");
  });

  it("undo removes the batch and its transactions; reconciled rows need an unlock", async () => {
    const user = await createUser("imp-undo");
    const bank = await createAccount(user, { name: "Bank", opening_balance: "100" });
    const food = await categoryId(user, "Food & groceries");
    const batch = await rpc<string>(user, "import_transactions", [
      { rows: [expense(bank, food, "10"), expense(bank, food, "20")] },
    ]);
    await rpc(user, "reconcile_account", [
      {
        account_id: bank,
        statement_date: "2026-03-31",
        statement_balance: "70",
        clear_transaction_ids: [],
        create_adjustment: false,
      },
    ]);
    expect(await errorCode(rpc(user, "undo_import", [batch, false]))).toBe("FT006");
    expect(await rpc<number>(user, "undo_import", [batch, true])).toBe(2);
    const left = await asUser(user, (q) => q("select count(*)::int as n from public.transactions"));
    expect(left.rows[0].n).toBe(0);
  });
});

describe("backup and restore", () => {
  it("round-trips every record and every derived figure exactly", async () => {
    const user = await createUser("backup");
    const bank = await createAccount(user, { name: "Bank", opening_balance: "250000.5" });
    const broker = await createAccount(user, { name: "Broker", type: "investment" });
    const usd = await createAccount(user, { name: "USD", currency: "USD", opening_balance: "100" });
    const food = await categoryId(user, "Food & groceries");
    const uncategorized = await categoryId(user, "Uncategorized expense");

    // A subcategory, an expense under a system category, a refund, a transfer, a reconciliation.
    const sub = (
      await asUser(user, (q) =>
        q("insert into public.categories (name, kind, parent_id) values ('Restaurants', 'expense', $1) returning id", [
          food,
        ]),
      )
    ).rows[0].id;
    const meal = await rpc<string>(user, "create_transaction", [expense(bank, sub, "1500")]);
    await rpc(user, "create_transaction", [expense(bank, uncategorized, "99.99")]);
    await rpc(user, "create_transaction", [
      {
        kind: "refund",
        occurred_on: "2026-03-02",
        refund_of_id: meal,
        lines: [{ account_id: bank, amount: "500", category_id: sub }],
      },
    ]);
    await rpc(user, "create_transaction", [
      {
        kind: "transfer",
        occurred_on: "2026-03-03",
        lines: [
          { account_id: bank, amount: "-28000" },
          { account_id: usd, amount: "100" },
        ],
      },
    ]);
    await rpc(user, "reconcile_account", [
      {
        account_id: bank,
        statement_date: "2026-03-31",
        statement_balance: "0",
        clear_transaction_ids: [],
        create_adjustment: true,
        note: "test",
      },
    ]);
    await rpc(user, "import_transactions", [
      { file_name: "x.csv", rows: [expense(bank, food, "1", "2026-04-01", "fp")] },
    ]);

    // Investments: an asset, a buy, a valuation, a sell.
    const asset = (
      await asUser(user, (q) =>
        q(
          "insert into public.assets (name, category, currency, quantity_scale) values ('Gold', 'gold', 'PKR', 4) returning id",
        ),
      )
    ).rows[0].id;
    await rpc(user, "create_transaction", [
      {
        kind: "buy",
        occurred_on: "2026-03-10",
        asset_id: asset,
        lines: [{ account_id: bank, amount: "-420000" }],
        movements: [{ account_id: broker, quantity: "2", unit_price: "210000" }],
      },
    ]);
    await rpc(user, "create_transaction", [
      {
        kind: "sell",
        occurred_on: "2026-04-10",
        asset_id: asset,
        lines: [{ account_id: bank, amount: "115000.25" }],
        movements: [{ account_id: broker, quantity: "-0.5", unit_price: "230000.5" }],
      },
    ]);
    await asUser(user, async (q) => {
      await q(
        "insert into public.asset_valuations (asset_id, valued_on, unit_price) values ($1, '2026-04-30', '231000.1234567891')",
        [asset],
      );
      await q(
        "insert into public.exchange_rates (base, quote, rate, effective_on) values ('USD', 'PKR', '280.123456789012', '2026-01-01')",
      );
      await q(
        "insert into public.budgets (month, category_id, amount, currency) values ('2026-03-01', $1, '20000', 'PKR')",
        [food],
      );
      const goal = (
        await q(
          "insert into public.savings_goals (name, target_amount, currency, funding_mode) values ('Car', '1000000', 'PKR', 'allocations') returning id",
        )
      ).rows[0].id;
      await q(
        "insert into public.goal_allocations (goal_id, allocated_on, amount, source_account_id) values ($1, '2026-03-01', '5000', $2)",
        [goal, bank],
      );
      await q(
        "insert into public.net_worth_snapshots (as_of, base_currency, total_assets, total_liabilities, net_worth, method_version, details) values ('2026-03-31', 'PKR', '10', '0', '10', 2, '{\"a\": 1}')",
      );
      await q("update public.profiles set display_name = 'Owner', theme = 'dark'");
    });

    const before = await exportAll(user);
    const beforeFigures = await figures(user);

    // Restore refuses a non-empty account.
    expect(await errorCode(rpc(user, "restore_backup", [before]))).toBe("FT007");

    await rpc(user, "delete_my_data", []);
    const emptied = await exportAll(user);
    for (const t of BACKUP_TABLE_NAMES) {
      if (t === "categories") expect(emptied[t]!.every((c) => c.system_key !== null)).toBe(true);
      else expect(emptied[t]).toEqual([]);
    }

    await rpc(user, "restore_backup", [before]);
    const after = await exportAll(user);
    const afterFigures = await figures(user);

    for (const t of BACKUP_TABLE_NAMES) {
      // updated_at moves when links are re-attached on restore; everything else is identical.
      const strip = (rows: BackupRow[]) => rows.map(({ updated_at: _ignored, ...rest }) => rest);
      expect(strip(after[t]!), t).toEqual(strip(before[t]!));
    }
    expect(after.profile).toEqual(before.profile);
    expect(afterFigures).toEqual(beforeFigures);
  });

  it("maps system categories onto a fresh account's own ones", async () => {
    const a = await createUser("backup-src");
    const bank = await createAccount(a, { name: "Bank", opening_balance: "10" });
    const unc = await categoryId(a, "Uncategorized expense");
    await rpc(a, "create_transaction", [expense(bank, unc, "5")]);
    const backup = await exportAll(a);

    const b = await createUser("backup-dst");
    // Ids are kept, so the same records can't exist twice in one database: refused, and A is untouched.
    expect(await errorCode(rpc(b, "restore_backup", [backup]))).toBe("23505");
    const aCount = await asAdmin((q) =>
      q("select count(*)::int as n from public.transactions where user_id = $1", [a]),
    );
    expect(aCount.rows[0].n).toBe(1);

    // Once the originals are gone (e.g. a new project, or the old account deleted), it restores and remaps.
    await asAdmin((q) => q("delete from auth.users where id = $1", [a]));
    await rpc(b, "restore_backup", [backup]);
    const bUnc = await categoryId(b, "Uncategorized expense");
    const lines = await asUser(b, (q) => q("select category_id, amount::text from public.transaction_lines"));
    expect(lines.rows).toEqual([{ category_id: bUnc, amount: "-5.0000" }]);
  });

  it("rejects a backup whose records break an invariant, saving nothing", async () => {
    const user = await createUser("backup-bad");
    const bank = "00000000-0000-4000-8000-00000000b001";
    const bad = {
      accounts: [
        {
          id: bank,
          name: "Bank",
          type: "bank",
          currency: "PKR",
          opening_balance: "0",
          opening_date: "2026-01-01",
          status: "active",
          include_in_net_worth: true,
          is_liquid: true,
        },
      ],
      // An expense with no lines breaks the shape invariant.
      transactions: [{ id: "00000000-0000-4000-8000-00000000b002", kind: "expense", occurred_on: "2026-02-01" }],
      transaction_lines: [],
    };
    expect(await errorCode(rpc(user, "restore_backup", [bad]))).toBe("FT001");
    const n = await asUser(user, (q) => q("select count(*)::int as n from public.accounts"));
    expect(n.rows[0].n).toBe(0);
  });
});

describe("isolation for Phase 6", () => {
  it("B can't see or undo A's import batches", async () => {
    const a = await createUser("iso-a");
    const bank = await createAccount(a, { name: "Bank" });
    const food = await categoryId(a, "Food & groceries");
    const batch = await rpc<string>(a, "import_transactions", [{ rows: [expense(bank, food, "1")] }]);
    const b = await createUser("iso-b");
    const seen = await asUser(b, (q) => q("select count(*)::int as n from public.import_batches"));
    expect(seen.rows[0].n).toBe(0);
    expect(await errorCode(rpc(b, "undo_import", [batch, true]))).toBe("FT404");
    // B can't import into A's account either.
    expect(await errorCode(rpc(b, "import_transactions", [{ rows: [expense(bank, food, "1")] }]))).toBe("FT010");
  });
});
