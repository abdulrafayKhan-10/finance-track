import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TransactionForm } from "@/components/transactions/transaction-form";
import { emptyFormValues } from "@/features/transactions/form-values";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

const accounts = [
  { id: "a1", name: "Bank", currency: "PKR" as const, class: "asset" as const, status: "active" as const },
  { id: "a2", name: "Card", currency: "PKR" as const, class: "liability" as const, status: "active" as const },
  { id: "a3", name: "Dollars", currency: "USD" as const, class: "asset" as const, status: "active" as const },
  { id: "a4", name: "Old", currency: "PKR" as const, class: "asset" as const, status: "archived" as const },
];
const categories = [
  { id: "c1", label: "Food", kind: "expense" as const, archived: false },
  { id: "c2", label: "Salary", kind: "income" as const, archived: false },
  { id: "c3", label: "Retired", kind: "expense" as const, archived: true },
];

function setup() {
  render(
    <TransactionForm
      action={async () => ({})}
      accounts={accounts}
      categories={categories}
      initial={emptyFormValues({ occurred_on: "2026-03-01" })}
      cancelHref="/transactions"
    />,
  );
}

const optionLabels = (select: HTMLElement) => Array.from((select as HTMLSelectElement).options).map((o) => o.text);

describe("TransactionForm", () => {
  it("offers only matching, non-archived categories for the chosen kind", async () => {
    setup();
    expect(optionLabels(screen.getByLabelText("Category"))).toEqual(["Choose a category", "Food"]);
    await userEvent.click(screen.getByText("Income", { selector: "label" }));
    expect(optionLabels(screen.getByLabelText("Category"))).toEqual(["Choose a category", "Salary"]);
  });

  it("hides archived accounts", () => {
    setup();
    expect(optionLabels(screen.getByLabelText("Account"))).not.toContain("Old (PKR)");
  });

  it("asks for the received amount only for cross-currency transfers", async () => {
    setup();
    await userEvent.click(screen.getByText("Transfer", { selector: "label" }));
    await userEvent.selectOptions(screen.getByLabelText("From"), "a1");
    await userEvent.selectOptions(screen.getByLabelText("To"), "a2");
    expect(screen.queryByLabelText(/Amount received/)).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("To"), "a3");
    expect(screen.getByLabelText("Amount received (USD)")).toBeInTheDocument();
    expect(screen.queryByLabelText("Category")).not.toBeInTheDocument();
  });

  it("words adjustment directions for liabilities as amount owed and requires a reason", async () => {
    setup();
    await userEvent.click(screen.getByText("Adjustment", { selector: "label" }));
    await userEvent.selectOptions(screen.getByLabelText("Account"), "a2");
    expect(screen.getByLabelText("Increase the amount owed")).toBeInTheDocument();
    expect(screen.getByLabelText("Reason (required)")).toBeInTheDocument();
  });
});
