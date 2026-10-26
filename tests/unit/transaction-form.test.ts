import { describe, expect, it } from "vitest";
import type { TransactionRecord } from "@/data/repositories/transactions";
import { type Account, classOf } from "@/domain/ledger";
import { Money } from "@/domain/money";
import { formValuesFromRecord } from "@/features/transactions/form-values";
import { toTransactionPayload } from "@/features/transactions/payload";
import { parseTransactionForm } from "@/lib/validation/transactions";

const id = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const account = (n: number, type: Account["type"], currency: Account["currency"] = "PKR"): Account => ({
  id: id(n),
  name: `A${n}`,
  type,
  class: classOf(type),
  currency,
  openingBalance: Money.zero(currency),
  openingDate: "2026-01-01",
  status: "active",
  includeInNetWorth: true,
  isLiquid: true,
});
const BANK = account(1, "bank");
const CARD = account(2, "credit_card");
const USD = account(3, "bank", "USD");
const accounts = [BANK, CARD, USD];
const CAT = id(9);

function form(values: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(values)) fd.set(k, v);
  return fd;
}

function payloadOf(values: Record<string, string>) {
  const r = parseTransactionForm(form({ occurred_on: "2026-03-01", ...values }), accounts);
  if (!r.ok) throw new Error(JSON.stringify(r.fieldErrors));
  return toTransactionPayload(r.entry, r.meta);
}

describe("parseTransactionForm → payload", () => {
  it("signs an expense negative and keeps exact decimals", () => {
    const p = payloadOf({
      kind: "expense",
      account_id: BANK.id,
      category_id: CAT,
      amount: "1,250.50",
      tags: "Home, home ,food",
    });
    expect(p.lines).toEqual([{ account_id: BANK.id, amount: "-1250.50", category_id: CAT }]);
    expect(p.tags).toEqual(["home", "food"]);
  });

  it("a card purchase increases the amount owed (negative line)", () => {
    expect(payloadOf({ kind: "expense", account_id: CARD.id, category_id: CAT, amount: "99" }).lines[0]!.amount).toBe(
      "-99.00",
    );
  });

  it("same-currency transfers balance automatically", () => {
    const p = payloadOf({ kind: "transfer", from_account_id: BANK.id, to_account_id: CARD.id, amount: "500" });
    expect(p.lines.map((l) => [l.account_id, l.amount, l.category_id])).toEqual([
      [BANK.id, "-500.00", null],
      [CARD.id, "500.00", null],
    ]);
  });

  it("cross-currency transfers need the received amount", () => {
    const missing = parseTransactionForm(
      form({
        kind: "transfer",
        occurred_on: "2026-03-01",
        from_account_id: BANK.id,
        to_account_id: USD.id,
        amount: "28000",
      }),
      accounts,
    );
    expect(missing).toEqual({ ok: false, fieldErrors: { received_amount: "Enter an amount." } });
    const p = payloadOf({
      kind: "transfer",
      from_account_id: BANK.id,
      to_account_id: USD.id,
      amount: "28000",
      received_amount: "100",
    });
    expect(p.lines.map((l) => l.amount)).toEqual(["-28000.00", "100.00"]);
  });

  it("adjustments follow the displayed balance on liabilities", () => {
    const p = payloadOf({
      kind: "adjustment",
      account_id: CARD.id,
      direction: "decrease",
      amount: "10",
      notes: "Statement fix",
    });
    expect(p.lines[0]!.amount).toBe("10.00");
  });

  it.each([
    [{ kind: "expense", account_id: BANK.id, category_id: CAT, amount: "0" }, "amount", "greater than zero"],
    [{ kind: "expense", account_id: BANK.id, category_id: CAT, amount: "-5" }, "amount", "greater than zero"],
    [{ kind: "expense", account_id: BANK.id, category_id: CAT, amount: "1.234" }, "amount", "decimal places"],
    [{ kind: "expense", account_id: id(7), category_id: CAT, amount: "1" }, "account_id", "not available"],
    [{ kind: "expense", account_id: BANK.id, amount: "1" }, "category_id", "category"],
    [{ kind: "transfer", from_account_id: BANK.id, to_account_id: BANK.id, amount: "1" }, "to_account_id", "different"],
    [{ kind: "adjustment", account_id: BANK.id, direction: "increase", amount: "1" }, "notes", "Explain"],
    [{ kind: "buy", account_id: BANK.id, amount: "1" }, "kind", "type"],
  ] as const)("rejects %j", (values, field, message) => {
    const r = parseTransactionForm(form({ occurred_on: "2026-03-01", ...values }), accounts);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.fieldErrors[field]).toContain(message);
  });

  it("rejects impossible dates", () => {
    const r = parseTransactionForm(
      form({ kind: "income", occurred_on: "2026-02-30", account_id: BANK.id, category_id: CAT, amount: "1" }),
      accounts,
    );
    expect(r.ok).toBe(false);
  });
});

describe("form values round-trip", () => {
  const record = (kind: TransactionRecord["kind"], lines: [Account, string, string | null][]): TransactionRecord => ({
    id: id(5),
    kind,
    occurredOn: "2026-03-01",
    description: "d",
    payee: null,
    notes: kind === "adjustment" ? "why" : null,
    tags: ["a", "b"],
    status: "cleared",
    refundOfId: null,
    reconciliationId: null,
    createdAt: "",
    updatedAt: "",
    lines: lines.map(([a, amt, cat], i) => ({
      id: `l${i}`,
      accountId: a.id,
      amount: Money.of(amt, a.currency),
      categoryId: cat,
      memo: null,
    })),
  });

  it.each([
    ["expense", [[CARD, "-99.00", CAT]]],
    ["income", [[BANK, "5000.00", CAT]]],
    ["refund", [[BANK, "20.00", CAT]]],
    [
      "transfer",
      [
        [BANK, "-28000.00", null],
        [USD, "100.00", null],
      ],
    ],
    ["adjustment", [[CARD, "10.00", null]]],
    ["adjustment", [[BANK, "-3.50", null]]],
  ] as const)("%s re-parses to the same lines", (kind, lines) => {
    const rec = record(kind, lines.map((l) => [...l]) as [Account, string, string | null][]);
    const r = formValuesFromRecord(rec, accounts);
    expect(r.editable).toBe(true);
    if (!r.editable) return;
    const fd = form(r.values as unknown as Record<string, string>);
    const parsed = parseTransactionForm(fd, accounts);
    if (!parsed.ok) throw new Error(JSON.stringify(parsed.fieldErrors));
    const p = toTransactionPayload(parsed.entry, parsed.meta);
    expect(p.lines.map((l) => [l.account_id, l.amount])).toEqual(
      rec.lines.map((l) => [l.accountId, l.amount.toFixed()]),
    );
    expect(p.tags).toEqual(["a", "b"]);
  });

  it("does not offer split or investment transactions for editing here", () => {
    expect(
      formValuesFromRecord(
        record("expense", [
          [BANK, "-1.00", CAT],
          [BANK, "-2.00", CAT],
        ]),
        accounts,
      ),
    ).toEqual({ editable: false, reason: "split" });
    expect(formValuesFromRecord(record("buy", [[BANK, "-1.00", null]]), accounts)).toEqual({
      editable: false,
      reason: "investment_kind",
    });
  });

  it("keeps the refund link only for refunds", () => {
    const parsed = parseTransactionForm(
      form({ kind: "refund", occurred_on: "2026-03-01", account_id: BANK.id, category_id: CAT, amount: "1" }),
      accounts,
    );
    if (!parsed.ok) throw new Error();
    expect(toTransactionPayload(parsed.entry, parsed.meta, id(4)).refund_of_id).toBe(id(4));
    const exp = parseTransactionForm(
      form({ kind: "expense", occurred_on: "2026-03-01", account_id: BANK.id, category_id: CAT, amount: "1" }),
      accounts,
    );
    if (!exp.ok) throw new Error();
    expect(toTransactionPayload(exp.entry, exp.meta, id(4)).refund_of_id).toBeNull();
  });
});
