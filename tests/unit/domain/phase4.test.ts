import { describe, expect, it } from "vitest";
import { budgetStatuses, type Budget } from "@/domain/budgets/budgets";
import { addMonths, lastDay, monthsBetween } from "@/domain/dates";
import { type Goal, goalProgress, overAllocations } from "@/domain/goals/goals";
import { computeNetWorth } from "@/domain/networth/networth";
import { Dec, Money } from "@/domain/money";
import { monthlyCashFlow, spendingByCategory, yearlyTotals } from "@/domain/reports/reports";
import { ledger } from "../support/ledger-builder";

const USD_PKR = [{ base: "USD" as const, quote: "PKR" as const, rate: new Dec("280"), effectiveOn: "2026-01-01" }];
const pkr = (v: string) => Money.of(v, "PKR");

describe("month helpers", () => {
  it("handle month ends, leap years and year boundaries", () => {
    expect(lastDay("2026-02")).toBe("2026-02-28");
    expect(lastDay("2028-02")).toBe("2028-02-29");
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(monthsBetween("2025-11", "2026-02")).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("net worth (§4.9)", () => {
  it("is assets minus liabilities, with liquid and investment cash broken out", () => {
    const l = ledger()
      .account("Bank", "PKR", "100000")
      .account("Cash", "PKR", "5000", "cash")
      .account("Broker", "PKR", "20000", "investment")
      .account("Card", "PKR", "12000", "credit_card")
      .account("Loan", "PKR", "300000", "loan");
    const nw = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", []);
    expect(nw.assets.toFixed()).toBe("125000.00");
    expect(nw.liabilities.toFixed()).toBe("312000.00");
    expect(nw.netWorth.toFixed()).toBe("-187000.00");
    expect(nw.liquid.toFixed()).toBe("105000.00");
    expect(nw.investmentCash.toFixed()).toBe("20000.00");
  });

  it("is unchanged by transfers, card payments and investment contributions (INV-7, ACC-NW)", () => {
    const l = ledger()
      .account("Bank", "PKR", "100000")
      .account("Card", "PKR", "8000", "credit_card")
      .account("Broker", "PKR", "0", "investment");
    const before = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", []).netWorth;
    l.transfer("Bank", "Card", "8000").transfer("Bank", "Broker", "30000");
    const after = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", []);
    expect(after.netWorth.equals(before)).toBe(true);
    expect(after.liabilities.toFixed()).toBe("0.00");
  });

  it("converts each account at the as-of rate and lists what it can't convert (INV-6)", () => {
    const l = ledger().account("Bank", "PKR", "1000").account("Dollars", "USD", "100").account("Euros", "EUR", "50");
    const nw = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", USD_PKR);
    expect(nw.assets.toFixed()).toBe("29000.00");
    expect(nw.unconvertible.map((a) => a.name)).toEqual(["Euros"]);
  });

  it("respects the as-of date and excludes accounts marked out of net worth", () => {
    const l = ledger()
      .account("Bank", "PKR", "1000")
      .account("Later", "PKR", "999", "bank", "2026-06-01")
      .account("Hidden", "PKR", "5");
    l.accounts.get("Hidden")!.includeInNetWorth = false;
    l.income("Bank", "500", "Salary", "2026-03-01");
    const jan = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", []);
    expect(jan.netWorth.toFixed()).toBe("1000.00");
    const jul = computeNetWorth([...l.accounts.values()], l.lines, "2026-07-01", "PKR", []);
    expect(jul.netWorth.toFixed()).toBe("2499.00");
  });

  it("counts an overdrawn account as a negative asset, not a liability", () => {
    const l = ledger().account("Bank", "PKR", "-500");
    const nw = computeNetWorth([...l.accounts.values()], l.lines, "2026-01-31", "PKR", []);
    expect([nw.assets.toFixed(), nw.liabilities.toFixed()]).toEqual(["-500.00", "0.00"]);
  });
});

describe("budgets (§4.4)", () => {
  const parents = new Map<string, string | null>([
    ["Food", null],
    ["Dining", "Food"],
    ["Shopping", null],
  ]);
  const budget = (categoryId: string | null, amount: string, month = "2026-01"): Budget => ({
    id: `${categoryId}`,
    month,
    categoryId,
    amount: pkr(amount),
  });

  it("counts expenses net of refunds, rolls up subcategories, and ignores transfers (ACC-BUD-1)", () => {
    const l = ledger()
      .account("Bank", "PKR", "100000")
      .account("Card", "PKR", "0", "credit_card")
      .expense("Bank", "6000", "Food")
      .expense("Card", "3000", "Dining")
      .refund("Bank", "1000", "Food")
      .transfer("Bank", "Card", "3000")
      .expense("Bank", "500", "Food", "2026-02-01");
    const [food] = budgetStatuses([budget("Food", "10000")], l.lines, parents, []);
    expect(food!.actual.toFixed()).toBe("8000.00");
    expect(food!.remaining.toFixed()).toBe("2000.00");
    expect(food!.used.toString()).toBe("0.8");
    expect(food!.state).toBe("ok");
  });

  it("warns at 85% and flags overspending", () => {
    const l = ledger().account("Bank", "PKR", "0").expense("Bank", "850", "Food").expense("Bank", "1200", "Shopping");
    const [food, shop] = budgetStatuses([budget("Food", "1000"), budget("Shopping", "1000")], l.lines, parents, []);
    expect(food!.state).toBe("warning");
    expect(shop!.state).toBe("over");
    expect(shop!.remaining.toFixed()).toBe("-200.00");
  });

  it("the overall budget covers all eligible spending and reports unconvertible lines (ACC-BUD-2)", () => {
    const l = ledger().account("Bank", "PKR", "0").account("Euro", "EUR", "0").account("Dollar", "USD", "0");
    l.expense("Bank", "100", "Food").expense("Dollar", "1", "Shopping").expense("Euro", "5", "Food");
    const [all] = budgetStatuses([budget(null, "1000")], l.lines, parents, USD_PKR);
    expect(all!.actual.toFixed()).toBe("380.00");
    expect(all!.excluded.map(String)).toEqual(["-5.00 EUR"]);
  });
});

describe("savings goals (§4.5)", () => {
  const goal = (over: Partial<Goal> = {}): Goal => ({
    id: "g",
    name: "Trip",
    target: pkr("100000"),
    targetDate: null,
    status: "active",
    fundingMode: "allocations",
    linkedAccountId: null,
    ...over,
  });

  it("allocation goals sum their earmarks, including releases", () => {
    const p = goalProgress(
      goal(),
      [
        { goalId: "g", amount: pkr("30000"), sourceAccountId: "Bank", on: "2026-01-01" },
        { goalId: "g", amount: pkr("-5000"), sourceAccountId: "Bank", on: "2026-02-01" },
        { goalId: "other", amount: pkr("99999"), sourceAccountId: "Bank", on: "2026-02-01" },
      ],
      undefined,
      "2026-03-01",
      [],
    );
    expect(p.status === "ok" && [p.progress.toFixed(), p.fraction.toString(), p.reached]).toEqual([
      "25000.00",
      "0.25",
      false,
    ]);
  });

  it("linked goals follow the account balance, converted at today's rate, and clamp the meter at 100%", () => {
    const p = goalProgress(
      goal({ fundingMode: "linked_account", linkedAccountId: "USD" }),
      [],
      Money.of("500", "USD"),
      "2026-03-01",
      USD_PKR,
    );
    expect(
      p.status === "ok" && [
        p.progress.toFixed(),
        p.ratio.toString(),
        p.fraction.toString(),
        p.reached,
        p.remaining.toFixed(),
      ],
    ).toEqual(["140000.00", "1.4", "1", true, "0.00"]);
    expect(
      goalProgress(goal({ fundingMode: "linked_account" }), [], Money.of("1", "EUR"), "2026-03-01", USD_PKR),
    ).toEqual({ status: "unavailable", reason: "missing_rate" });
  });

  it("warns when earmarks exceed what the source account holds (ACC-GOAL-2)", () => {
    const goals = [goal({ id: "a" }), goal({ id: "b" }), goal({ id: "done", status: "completed" })];
    const allocations = [
      { goalId: "a", amount: pkr("60000"), sourceAccountId: "Bank", on: "2026-01-01" },
      { goalId: "b", amount: pkr("50000"), sourceAccountId: "Bank", on: "2026-01-01" },
      { goalId: "done", amount: pkr("90000"), sourceAccountId: "Savings", on: "2026-01-01" },
    ];
    const balances = new Map([
      ["Bank", pkr("100000")],
      ["Savings", pkr("10")],
    ]);
    expect(overAllocations(goals, allocations, balances).map((o) => [o.accountId, o.allocated.toFixed()])).toEqual([
      ["Bank", "110000.00"],
    ]);
  });
});

describe("reports", () => {
  const parents = new Map<string, string | null>([
    ["Food", null],
    ["Dining", "Food"],
    ["Rent", null],
  ]);

  it("spending by category rolls up, sorts largest first and totals", () => {
    const l2 = ledger()
      .account("Bank", "PKR", "0")
      .account("Wallet", "PKR")
      .expense("Bank", "100", "Food")
      .expense("Bank", "300", "Dining")
      .expense("Bank", "1000", "Rent")
      .refund("Bank", "50", "Dining")
      .transfer("Bank", "Wallet", "777");
    const r = spendingByCategory(l2.lines, { from: "2026-01-01", to: "2026-01-31" }, parents, "PKR", []);
    expect(r.rows.map((x) => [x.categoryId, x.amount.toFixed()])).toEqual([
      ["Rent", "1000.00"],
      ["Food", "350.00"],
    ]);
    expect(r.rows[1]!.children.map((c) => [c.categoryId, c.amount.toFixed()])).toEqual([
      ["Dining", "250.00"],
      ["Food", "100.00"],
    ]);
    expect(r.total.toFixed()).toBe("1350.00");
  });

  it("monthly and yearly totals agree, with a null savings rate for no-income years", () => {
    const l = ledger()
      .account("Bank", "PKR", "0")
      .income("Bank", "1000", "Salary", "2026-01-10")
      .expense("Bank", "400", "Food", "2026-01-20")
      .income("Bank", "1000", "Salary", "2026-02-10")
      .expense("Bank", "100", "Food", "2026-02-20")
      .expense("Bank", "50", "Food", "2025-12-05");
    const months = monthlyCashFlow(l.lines, "2025-12", "2026-02", "PKR", []);
    expect(months.map((m) => m.summary.netCashFlow.toFixed())).toEqual(["-50.00", "600.00", "900.00"]);
    const years = yearlyTotals(months);
    expect(years.map((y) => [y.year, y.netCashFlow.toFixed(), y.savingsRate?.toString() ?? null])).toEqual([
      ["2025", "-50.00", null],
      ["2026", "1500.00", "0.75"],
    ]);
  });
});
