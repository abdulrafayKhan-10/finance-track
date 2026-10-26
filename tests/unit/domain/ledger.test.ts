import { describe, expect, it } from "vitest";
import { Dec, Money } from "@/domain/money";
import {
  accountBalance,
  buildLines,
  checkReconciliation,
  displayBalance,
  EntryError,
  FLOW_CLASS,
  isBudgetEligible,
  runningBalances,
  summarizeCashFlow,
  TRANSACTION_KINDS,
} from "@/domain/ledger";
import { ledger } from "../support/ledger-builder";

const JAN = { from: "2026-01-01", to: "2026-01-31" };

describe("account balances (§4.1)", () => {
  it("starts from the opening balance (ACC-BAL-1)", () => {
    const l = ledger().account("Bank", "PKR", "10000");
    expect(accountBalance(l.acc("Bank"), l.lines).toFixed()).toBe("10000.00");
  });

  it("adds income and subtracts expenses (ACC-BAL-2)", () => {
    const l = ledger().account("Bank", "PKR", "10000").income("Bank", "50000").expense("Bank", "1250.50");
    expect(accountBalance(l.acc("Bank"), l.lines).toFixed()).toBe("58749.50");
  });

  it("respects the as-of date", () => {
    const l = ledger().account("Bank", "PKR", "100").income("Bank", "50", "Salary", "2026-02-01");
    expect(accountBalance(l.acc("Bank"), l.lines, { asOf: "2026-01-31" }).toFixed()).toBe("100.00");
    expect(accountBalance(l.acc("Bank"), l.lines, { asOf: "2025-12-31" }).toFixed()).toBe("0.00");
  });

  it("excludes pending lines from the cleared balance only (ACC-PEND-1)", () => {
    const l = ledger().account("Bank", "PKR", "100").expense("Bank", "30", "Food", "2026-01-15", "pending");
    expect(accountBalance(l.acc("Bank"), l.lines).toFixed()).toBe("70.00");
    expect(accountBalance(l.acc("Bank"), l.lines, { clearedOnly: true }).toFixed()).toBe("100.00");
  });

  it("stores liabilities negative and shows them as owed (ACC-BAL-3)", () => {
    const l = ledger().account("Card", "PKR", "5000", "credit_card").expense("Card", "1000");
    const card = l.acc("Card");
    const balance = accountBalance(card, l.lines);
    expect(balance.toFixed()).toBe("-6000.00");
    expect(displayBalance(card, balance).toFixed()).toBe("6000.00");
  });

  it("refuses a line in another currency (ACC-BAL-4)", () => {
    const l = ledger().account("Bank", "PKR");
    const bad = [
      {
        ...l.lines[0],
        transactionId: "x",
        accountId: "Bank",
        amount: Money.of("1", "USD"),
        categoryId: null,
        occurredOn: "2026-01-02",
        status: "cleared" as const,
        kind: "income" as const,
      },
    ];
    expect(() => accountBalance(l.acc("Bank"), bad)).toThrow();
  });

  it("computes a running balance in date order", () => {
    const l = ledger()
      .account("Bank", "PKR", "100")
      .expense("Bank", "30", "Food", "2026-01-20")
      .income("Bank", "50", "Salary", "2026-01-10");
    const running = runningBalances(l.acc("Bank"), l.lines).map((e) => [e.line.occurredOn, e.balanceAfter.toFixed()]);
    expect(running).toEqual([
      ["2026-01-10", "150.00"],
      ["2026-01-20", "120.00"],
    ]);
  });
});

describe("transfers", () => {
  it("move money between accounts without changing the total (INV-1, INV-3)", () => {
    const l = ledger()
      .account("Bank", "PKR", "10000")
      .account("Wallet", "PKR", "0", "digital_wallet")
      .transfer("Bank", "Wallet", "2500");
    expect(accountBalance(l.acc("Bank"), l.lines).toFixed()).toBe("7500.00");
    expect(accountBalance(l.acc("Wallet"), l.lines).toFixed()).toBe("2500.00");
    const tx = l.lines.filter((x) => x.kind === "transfer");
    expect(
      Money.sum(
        tx.map((x) => x.amount),
        "PKR",
      ).isZero(),
    ).toBe(true);
  });

  it("never count as income or spending (INV-1)", () => {
    const l = ledger().account("Bank", "PKR", "10000").account("Wallet", "PKR").transfer("Bank", "Wallet", "2500");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.income.isZero()).toBe(true);
    expect(s.householdSpend.isZero()).toBe(true);
  });

  it("paying a credit card is a transfer, so the purchase is counted once (ACC-CC-1)", () => {
    const l = ledger()
      .account("Bank", "PKR", "100000")
      .account("Card", "PKR", "0", "credit_card")
      .expense("Card", "8000", "Shopping", "2026-01-05")
      .transfer("Bank", "Card", "8000", "8000", "2026-01-25");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.householdSpend.toFixed()).toBe("8000.00");
    expect(displayBalance(l.acc("Card"), accountBalance(l.acc("Card"), l.lines)).toFixed()).toBe("0.00");
    expect(accountBalance(l.acc("Bank"), l.lines).toFixed()).toBe("92000.00");
  });

  it("cross-currency legs stay in their own currencies (ACC-FX-4)", () => {
    const l = ledger()
      .account("PKR Bank", "PKR", "100000")
      .account("USD Bank", "USD")
      .transfer("PKR Bank", "USD Bank", "28000", "100");
    expect(accountBalance(l.acc("PKR Bank"), l.lines).toFixed()).toBe("72000.00");
    expect(accountBalance(l.acc("USD Bank"), l.lines).toString()).toBe("100.00 USD");
  });

  it("contributions to an investment account are not income or profit (INV-4)", () => {
    const l = ledger()
      .account("Bank", "PKR", "50000")
      .account("Broker", "PKR", "0", "investment")
      .transfer("Bank", "Broker", "20000");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.income.isZero()).toBe(true);
    expect(s.investmentIncome.isZero()).toBe(true);
  });
});

describe("cash flow and savings rate (§4.3)", () => {
  it("nets refunds against spending, not income (ACC-REF-1)", () => {
    const l = ledger()
      .account("Bank", "PKR", "0")
      .income("Bank", "100000")
      .expense("Bank", "30000")
      .refund("Bank", "5000");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.income.toFixed()).toBe("100000.00");
    expect(s.householdSpend.toFixed()).toBe("25000.00");
    expect(s.netCashFlow.toFixed()).toBe("75000.00");
    expect(s.savingsRate?.toString()).toBe("0.75");
  });

  it("counts dividends and interest as income and investment fees separately", () => {
    const l = ledger()
      .account("Bank", "PKR", "0")
      .income("Bank", "90000")
      .raw("dividend", "Bank", "6000")
      .raw("interest", "Bank", "4000")
      .raw("investment_fee", "Bank", "-500")
      .expense("Bank", "50000");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.income.toFixed()).toBe("100000.00");
    expect(s.investmentIncome.toFixed()).toBe("10000.00");
    expect(s.investmentCosts.toFixed()).toBe("500.00");
    expect(s.savingsRate?.toString()).toBe("0.5");
  });

  it("keeps adjustments out of income, spending and the savings rate (ACC-ADJ-1)", () => {
    const l = ledger().account("Bank", "PKR", "0").income("Bank", "1000").adjust("Bank", "increase", "999");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.income.toFixed()).toBe("1000.00");
    expect(s.adjustments.toFixed()).toBe("999.00");
    expect(s.savingsRate?.toString()).toBe("1");
  });

  it("has no savings rate when there is no income (ACC-SR-1)", () => {
    const l = ledger().account("Bank", "PKR", "1000").expense("Bank", "100");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", []);
    expect(s.savingsRate).toBeNull();
    expect(s.netCashFlow.toFixed()).toBe("-100.00");
  });

  it("converts foreign lines at their date's rate and reports unconvertible ones", () => {
    const l = ledger().account("PKR Bank", "PKR").account("USD Bank", "USD").account("EUR Bank", "EUR");
    l.income("PKR Bank", "100000").income("USD Bank", "100", "Salary", "2026-01-15").income("EUR Bank", "50");
    const s = summarizeCashFlow(l.lines, JAN, "PKR", [
      { base: "USD", quote: "PKR", rate: new Dec("280"), effectiveOn: "2026-01-01" },
    ]);
    expect(s.income.toFixed()).toBe("128000.00");
    expect(s.excluded.map(String)).toEqual(["50.00 EUR"]);
  });

  it("only includes lines inside the period", () => {
    const l = ledger()
      .account("Bank", "PKR")
      .income("Bank", "1", "Salary", "2025-12-31")
      .income("Bank", "2", "Salary", "2026-01-31")
      .income("Bank", "4", "Salary", "2026-02-01");
    expect(summarizeCashFlow(l.lines, JAN, "PKR", []).income.toFixed()).toBe("2.00");
  });
});

describe("classification", () => {
  it("classifies every kind", () => {
    for (const k of TRANSACTION_KINDS) expect(FLOW_CLASS[k]).toBeDefined();
  });
  it("only expenses and refunds are budget-eligible (ACC-BUD-1)", () => {
    expect(TRANSACTION_KINDS.filter(isBudgetEligible)).toEqual(["expense", "refund"]);
  });
});

describe("entry signs", () => {
  const pkr = (v: string) => Money.of(v, "PKR");

  it("expenses go out, income and refunds come in", () => {
    expect(
      buildLines({ kind: "expense", accountId: "a", amount: pkr("10"), categoryId: "c" })[0]!.amount.toFixed(),
    ).toBe("-10.00");
    expect(
      buildLines({ kind: "income", accountId: "a", amount: pkr("10"), categoryId: "c" })[0]!.amount.toFixed(),
    ).toBe("10.00");
    expect(
      buildLines({ kind: "refund", accountId: "a", amount: pkr("10"), categoryId: "c" })[0]!.amount.toFixed(),
    ).toBe("10.00");
  });

  it("adjustments follow the displayed balance, including liabilities", () => {
    const owedMore = buildLines({
      kind: "adjustment",
      accountId: "card",
      accountClass: "liability",
      direction: "increase",
      amount: pkr("5"),
    });
    expect(owedMore[0]!.amount.toFixed()).toBe("-5.00");
    const lessCash = buildLines({
      kind: "adjustment",
      accountId: "bank",
      accountClass: "asset",
      direction: "decrease",
      amount: pkr("5"),
    });
    expect(lessCash[0]!.amount.toFixed()).toBe("-5.00");
  });

  it("rejects zero or negative amounts, same-account and unbalanced transfers", () => {
    expect(() => buildLines({ kind: "expense", accountId: "a", amount: pkr("0"), categoryId: "c" })).toThrow(
      EntryError,
    );
    expect(() => buildLines({ kind: "income", accountId: "a", amount: pkr("-1"), categoryId: "c" })).toThrow(
      EntryError,
    );
    expect(() =>
      buildLines({ kind: "transfer", fromAccountId: "a", toAccountId: "a", amount: pkr("1"), received: pkr("1") }),
    ).toThrow(/different accounts/);
    expect(() =>
      buildLines({ kind: "transfer", fromAccountId: "a", toAccountId: "b", amount: pkr("1"), received: pkr("2") }),
    ).toThrow(/same amount/);
  });
});

describe("reconciliation", () => {
  it("compares the statement with the cleared balance on the statement date", () => {
    const l = ledger()
      .account("Bank", "PKR", "1000")
      .expense("Bank", "100", "Food", "2026-01-10")
      .expense("Bank", "50", "Food", "2026-01-12", "pending")
      .expense("Bank", "70", "Food", "2026-02-02");
    const r = checkReconciliation(l.acc("Bank"), l.lines, "2026-01-31", Money.of("880", "PKR"));
    expect(r.clearedBalance.toFixed()).toBe("900.00");
    expect(r.difference.toFixed()).toBe("-20.00");
  });
});
