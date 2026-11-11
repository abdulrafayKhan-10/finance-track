import { beforeAll, describe, expect, it } from "vitest";
import { asAdmin, asUser, createAccount, createUser, errorCode, rpc } from "./support/db";

let user: string;
let bank: string;
let broker: string;
let broker2: string;
let stock: string;
let gold: string;

async function createAsset(
  userId: string,
  values: Partial<{ name: string; category: string; currency: string; quantity_scale: number; valuation_mode: string }>,
): Promise<string> {
  const a = {
    name: `Asset ${Math.random().toString(36).slice(2, 8)}`,
    category: "stock_etf",
    currency: "PKR",
    ...values,
  };
  const { rows } = await asUser(userId, (q) =>
    q(
      `insert into public.assets (name, category, currency, quantity_scale, valuation_mode)
       values ($1, $2, $3, coalesce($4, 4), coalesce($5::public.valuation_mode, 'manual')) returning id`,
      [a.name, a.category, a.currency, a.quantity_scale ?? null, a.valuation_mode ?? null],
    ),
  );
  return rows[0].id;
}

const buy = (quantity: string, price: string, extra: Record<string, unknown> = {}) => ({
  kind: "buy",
  occurred_on: "2026-03-01",
  asset_id: stock,
  lines: [{ account_id: bank, amount: `-${(Number(quantity) * Number(price)).toFixed(2)}` }],
  movements: [{ account_id: broker, quantity, unit_price: price }],
  ...extra,
});

const sell = (quantity: string, price: string, extra: Record<string, unknown> = {}) => ({
  kind: "sell",
  occurred_on: "2026-04-01",
  asset_id: stock,
  lines: [{ account_id: bank, amount: (Number(quantity) * Number(price)).toFixed(2) }],
  movements: [{ account_id: broker, quantity: `-${quantity}`, unit_price: price }],
  ...extra,
});

async function list(filter: Record<string, unknown>) {
  return rpc<{ items: Array<{ id: string; updated_at: string; asset_id: string | null; movements: unknown[] }> }>(
    user,
    "list_transactions",
    [filter, 50],
  );
}

beforeAll(async () => {
  user = await createUser("inv");
  bank = await createAccount(user, { name: "Bank", opening_balance: "1000000" });
  broker = await createAccount(user, { name: "Broker", type: "investment" });
  broker2 = await createAccount(user, { name: "Broker 2", type: "investment" });
  stock = await createAsset(user, { name: "OGDC", quantity_scale: 0 });
  gold = await createAsset(user, { name: "Gold", category: "gold", quantity_scale: 4 });
});

describe("assets", () => {
  it("allows par valuation only for fixed income and cash-like assets", async () => {
    expect(await createAsset(user, { name: "T-bill", category: "fixed_income", valuation_mode: "par" })).toBeTruthy();
    expect(
      await errorCode(createAsset(user, { name: "Par stock", category: "stock_etf", valuation_mode: "par" })),
    ).toBe("23514");
  });

  it("locks the currency once the asset has history", async () => {
    const a = await createAsset(user, { name: "Lockable" });
    await asUser(user, (q) => q("update public.assets set currency = 'USD' where id = $1", [a]));
    await asUser(user, (q) =>
      q("insert into public.asset_valuations (asset_id, valued_on, unit_price) values ($1, '2026-01-01', '10')", [a]),
    );
    expect(
      await errorCode(asUser(user, (q) => q("update public.assets set currency = 'PKR' where id = $1", [a]))),
    ).toBe("FT002");
  });
});

describe("investment transactions", () => {
  it("records a buy as a cash line and a priced holding movement", async () => {
    const id = await rpc<string>(user, "create_transaction", [buy("100", "120.5")]);
    const { items } = await list({ id });
    expect(items[0]!.asset_id).toBe(stock);
    expect(items[0]!.movements).toEqual([
      expect.objectContaining({ account_id: broker, quantity: "100.0000000000", unit_price: "120.5000000000" }),
    ]);
    const { rows } = await asUser(user, (q) =>
      q("select quantity from public.holding_movements_list(null) where transaction_id = $1", [id]),
    );
    expect(rows).toEqual([{ quantity: "100.0000000000" }]);
  });

  it("rejects selling more than is held, at the sale date", async () => {
    expect(await errorCode(rpc(user, "create_transaction", [sell("150", "130")]))).toBe("FT008");
    // Dated before the buy: nothing is held yet.
    expect(await errorCode(rpc(user, "create_transaction", [sell("10", "130", { occurred_on: "2026-02-01" })]))).toBe(
      "FT008",
    );
    expect(await rpc<string>(user, "create_transaction", [sell("40", "130")])).toBeTruthy();
  });

  it("rejects an edit or delete of an earlier buy that would break a later sell", async () => {
    const asset = await createAsset(user, { name: "Edit test", quantity_scale: 0 });
    const b = await rpc<string>(user, "create_transaction", [buy("10", "5", { asset_id: asset })]);
    await rpc(user, "create_transaction", [sell("8", "6", { asset_id: asset })]);
    const before = (await list({ id: b })).items[0]!;
    expect(
      await errorCode(
        rpc(user, "update_transaction", [b, buy("5", "5", { asset_id: asset }), before.updated_at, false]),
      ),
    ).toBe("FT008");
    // Moving the buy after the sell breaks it too.
    expect(
      await errorCode(
        rpc(user, "update_transaction", [
          b,
          buy("10", "5", { asset_id: asset, occurred_on: "2026-05-01" }),
          before.updated_at,
          false,
        ]),
      ),
    ).toBe("FT008");
    expect(await errorCode(rpc(user, "delete_transaction", [b, before.updated_at, false]))).toBe("FT008");
  });

  it("validates the shape of each investment kind", async () => {
    // Buy without a price, buy into a bank account, buy paid by a liability, buy with a category.
    expect(
      await errorCode(
        rpc(user, "create_transaction", [{ ...buy("1", "1"), movements: [{ account_id: broker, quantity: "1" }] }]),
      ),
    ).toBe("FT001");
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          { ...buy("1", "1"), movements: [{ account_id: bank, quantity: "1", unit_price: "1" }] },
        ]),
      ),
    ).toBe("FT001");
    const card = await createAccount(user, { name: "Card", type: "credit_card" });
    expect(
      await errorCode(
        rpc(user, "create_transaction", [{ ...buy("1", "1"), lines: [{ account_id: card, amount: "-1" }] }]),
      ),
    ).toBe("FT001");
    // Opening holding needs its cost and no cash line.
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          {
            kind: "opening_holding",
            occurred_on: "2026-01-15",
            asset_id: gold,
            movements: [{ account_id: broker, quantity: "2.5" }],
          },
        ]),
      ),
    ).toBe("FT001");
    // Dividends need an asset and no movements.
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          { kind: "dividend", occurred_on: "2026-03-05", lines: [{ account_id: bank, amount: "500" }] },
        ]),
      ),
    ).toBe("FT001");
    // Cash kinds can't carry movements.
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          {
            kind: "adjustment",
            occurred_on: "2026-03-05",
            notes: "x",
            asset_id: stock,
            lines: [{ account_id: bank, amount: "1" }],
            movements: [{ account_id: broker, quantity: "1" }],
          },
        ]),
      ),
    ).toBe("23514");
  });

  it("accepts opening holdings, dividends, fees and splits", async () => {
    await rpc(user, "create_transaction", [
      {
        kind: "opening_holding",
        occurred_on: "2026-01-15",
        asset_id: gold,
        movements: [{ account_id: broker, quantity: "2.5", cost_amount: "500000" }],
      },
    ]);
    await rpc(user, "create_transaction", [
      { kind: "dividend", occurred_on: "2026-03-05", asset_id: stock, lines: [{ account_id: bank, amount: "500" }] },
    ]);
    // A fee may name an asset or not (e.g. an account maintenance fee).
    await rpc(user, "create_transaction", [
      { kind: "investment_fee", occurred_on: "2026-03-06", lines: [{ account_id: broker, amount: "-150" }] },
    ]);
    await rpc(user, "create_transaction", [
      {
        kind: "investment_fee",
        occurred_on: "2026-03-06",
        asset_id: stock,
        lines: [{ account_id: bank, amount: "-50" }],
      },
    ]);
    const split = await rpc<string>(user, "create_transaction", [
      {
        kind: "split",
        occurred_on: "2026-05-01",
        asset_id: stock,
        movements: [{ account_id: broker, quantity: "60" }],
      },
    ]);
    expect(split).toBeTruthy();
    // A split with a price or two movements in one account is invalid.
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          {
            kind: "split",
            occurred_on: "2026-05-02",
            asset_id: stock,
            movements: [
              { account_id: broker, quantity: "1" },
              { account_id: broker, quantity: "1" },
            ],
          },
        ]),
      ),
    ).toBe("FT001");
    const { rows } = await asUser(user, (q) =>
      q("select kind, amount from public.asset_cash_lines(null) where kind = 'dividend'"),
    );
    expect(rows).toEqual([{ kind: "dividend", amount: "500.0000" }]);
  });

  it("refuses quantities finer than the asset allows and amounts finer than its currency", async () => {
    expect(await errorCode(rpc(user, "create_transaction", [buy("1.5", "10")]))).toBe("FT001");
    expect(
      await errorCode(
        rpc(user, "create_transaction", [
          { ...buy("1", "10"), movements: [{ account_id: broker, quantity: "1", unit_price: "10", fee: "0.001" }] },
        ]),
      ),
    ).toBe("FT001");
  });

  it("blocks new activity on archived assets but keeps old records editable", async () => {
    const asset = await createAsset(user, { name: "Archivable", quantity_scale: 0 });
    const id = await rpc<string>(user, "create_transaction", [buy("2", "10", { asset_id: asset })]);
    await asUser(user, (q) => q("update public.assets set status = 'archived' where id = $1", [asset]));
    expect(await errorCode(rpc(user, "create_transaction", [buy("1", "10", { asset_id: asset })]))).toBe("FT009");
    const t = (await list({ id })).items[0]!;
    await rpc(user, "update_transaction", [id, buy("3", "10", { asset_id: asset }), t.updated_at, false]);
  });

  it("keeps investment accounts as investment accounts once they hold positions", async () => {
    expect(
      await errorCode(asUser(user, (q) => q("update public.accounts set type = 'bank' where id = $1", [broker]))),
    ).toBe("FT002");
  });

  it("filters the list by asset and by the holding account", async () => {
    const byAsset = await list({ asset_id: gold });
    expect(byAsset.items.length).toBeGreaterThan(0);
    const byBroker2 = await list({ account_id: broker2 });
    expect(byBroker2.items).toEqual([]);
  });

  it("audits movements and includes them in the transaction history", async () => {
    const id = await rpc<string>(user, "create_transaction", [buy("1", "10")]);
    const { rows } = await asAdmin((q) =>
      q(
        "select count(*)::int as n from public.audit_events where table_name = 'holding_movements' and after ->> 'transaction_id' = $1",
        [id],
      ),
    );
    expect(rows[0].n).toBe(1);
    const history = await asUser(user, (q) => q("select * from public.transaction_history($1)", [id]));
    expect(history.rows.length).toBe(1);
  });
});

describe("valuations", () => {
  it("stores one manual valuation per asset and date, and keeps total-value input", async () => {
    await asUser(user, (q) =>
      q(
        `insert into public.asset_valuations (asset_id, valued_on, unit_price, entered_as, entered_total, quantity_at_entry)
         values ($1, '2026-03-31', '210000', 'total_value', '525000', '2.5')`,
        [gold],
      ),
    );
    expect(
      await errorCode(
        asUser(user, (q) =>
          q("insert into public.asset_valuations (asset_id, valued_on, unit_price) values ($1, '2026-03-31', '1')", [
            gold,
          ]),
        ),
      ),
    ).toBe("23505");
    // A total-value entry must carry its inputs.
    expect(
      await errorCode(
        asUser(user, (q) =>
          q(
            "insert into public.asset_valuations (asset_id, valued_on, unit_price, entered_as) values ($1, '2026-04-30', '1', 'total_value')",
            [gold],
          ),
        ),
      ),
    ).toBe("23514");
  });
});

describe("cross-user isolation for investments", () => {
  it("B can't read A's assets, valuations or movements, or use A's asset", async () => {
    const b = await createUser("inv-b");
    const bBroker = await createAccount(b, { name: "B broker", type: "investment" });
    const bBank = await createAccount(b, { name: "B bank", opening_balance: "1000" });
    const counts = await asUser(b, (q) =>
      q(`select (select count(*) from public.assets)::int as assets,
                (select count(*) from public.asset_valuations)::int as valuations,
                (select count(*) from public.holding_movements)::int as movements,
                (select count(*) from public.holding_movements_list(null))::int as listed`),
    );
    expect(counts.rows[0]).toEqual({ assets: 0, valuations: 0, movements: 0, listed: 0 });
    // Using A's asset id fails: the composite foreign key can't see it.
    expect(
      await errorCode(
        rpc(b, "create_transaction", [
          {
            kind: "buy",
            occurred_on: "2026-03-01",
            asset_id: stock,
            lines: [{ account_id: bBank, amount: "-10" }],
            movements: [{ account_id: bBroker, quantity: "1", unit_price: "10" }],
          },
        ]),
      ),
    ).toMatch(/FT007|23503/);
    const updated = await asUser(b, (q) => q("update public.assets set name = 'x' where id = $1", [stock]));
    expect(updated.rowCount).toBe(0);
  });
});
