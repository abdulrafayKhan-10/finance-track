import { readFileSync } from "node:fs";
import { expect, type Locator, type Page, test } from "@playwright/test";
import type { TestUser } from "./support/env";
import { totp } from "./support/totp";

/**
 * Full functional audit: every feature of the app exercised in a browser with
 * dummy data, as one fresh temporary user. Ends by deleting that account
 * through the app itself. Run: npx playwright test --project=audit
 */
test.describe.configure({ mode: "serial" });

const user = (): TestUser => JSON.parse(readFileSync("e2e/.auth/user.json", "utf8"));
const shot = (page: Page, name: string) => page.screenshot({ path: `test-results/audit/${name}.png`, fullPage: true });

async function chooseKind(page: Page, name: string) {
  await page
    .locator("label")
    .filter({ has: page.getByRole("radio", { name, exact: true }) })
    .click();
  await expect(page.getByRole("radio", { name, exact: true })).toBeChecked();
}

async function confirmIn(page: Page, trigger: Locator, confirm: string, fill?: Record<string, string>) {
  await trigger.click();
  const dialog = page.getByRole("alertdialog");
  for (const [label, value] of Object.entries(fill ?? {})) await dialog.getByLabel(label).fill(value);
  await dialog.getByRole("button", { name: confirm }).click();
  return dialog;
}

async function newAccount(page: Page, name: string, type: string, opening: string, currency = "PKR") {
  await page.goto("/accounts/new");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Type").selectOption({ label: type });
  if (currency !== "PKR") await page.getByLabel("Currency").selectOption(currency);
  await page.getByLabel(/Opening balance|Amount owed at opening/).fill(opening);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return new URL(page.url()).pathname;
}

async function addTx(page: Page, kind: string, fill: (p: Page) => Promise<void>) {
  await page.goto("/transactions/new");
  await chooseKind(page, kind);
  await fill(page);
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByText("Transaction saved.")).toBeVisible();
  return new URL(page.url()).pathname;
}

/** A category row: the link whose name text is exactly this (the row also shows a usage count). */
const catLink = (page: Page, name: string) => page.locator("a", { has: page.getByText(name, { exact: true }) });

const CATEGORY_PAGE = /\/settings\/categories\/[0-9a-f-]{36}/;

const acct = (name: string, currency = "PKR") => ({ label: `${name} (${currency})` });
const urls: Record<string, string> = {};
let netWorthBefore = "";

test("1. accounts of every kind", async ({ page }) => {
  urls.bank = await newAccount(page, "Audit Bank", "Bank account", "200000");
  urls.wallet = await newAccount(page, "Audit Wallet", "Digital wallet", "5000");
  urls.card = await newAccount(page, "Audit Card", "Credit card", "0");
  urls.usd = await newAccount(page, "Audit USD", "Bank account", "100", "USD");
  urls.broker = await newAccount(page, "Audit Broker", "Investment account", "0");
  await page.goto("/accounts");
  for (const n of ["Audit Bank", "Audit Wallet", "Audit Card", "Audit USD", "Audit Broker"])
    await expect(page.getByText(n).first()).toBeVisible();
  await shot(page, "accounts");
});

test("2. categories: add, subcategory, rename, merge, delete", async ({ page }) => {
  for (const [name, parent] of [
    ["Dining", null],
    ["Coffee", "Dining"],
    ["Temp A", null],
    ["Temp B", null],
  ] as const) {
    await page.goto("/settings/categories");
    await page.getByLabel("Name").first().fill(name);
    await page.getByLabel("Kind").selectOption("expense");
    if (parent) await page.getByLabel("Inside (optional)").selectOption({ label: `${parent} (expense)` });
    await page.getByRole("button", { name: "Add category" }).click();
    await expect(catLink(page, name)).toBeVisible();
  }
  // Rename the subcategory.
  await catLink(page, "Coffee").click();
  await page.waitForURL(CATEGORY_PAGE);
  await page.getByLabel("Name").fill("Coffee & tea");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Saved.")).toBeVisible();
  await page.goto("/settings/categories");
  await expect(catLink(page, "Coffee & tea")).toBeVisible();
  // Merge Temp A into Temp B, then delete Temp B.
  await catLink(page, "Temp A").click();
  await page.waitForURL(CATEGORY_PAGE);
  await page.getByRole("button", { name: "Merge…" }).click();
  const merge = page.getByRole("alertdialog");
  await merge.getByLabel("Merge into").selectOption({ label: "Temp B" });
  await merge.getByRole("button", { name: "Merge" }).click();
  await expect(page.getByText("Categories merged.", { exact: false })).toBeVisible();
  await page.goto("/settings/categories");
  await expect(catLink(page, "Temp A")).toHaveCount(0);
  await catLink(page, "Temp B").click();
  await page.waitForURL(CATEGORY_PAGE);
  await confirmIn(page, page.getByRole("button", { name: "Delete category" }), "Delete");
  await expect(page.getByText("Category deleted.")).toBeVisible();
  await page.goto("/settings/categories");
  await expect(catLink(page, "Temp B")).toHaveCount(0);
});

test("3. every cash transaction type, edit and delete", async ({ page }) => {
  await addTx(page, "Income", async (p) => {
    await p.getByLabel("Account", { exact: true }).selectOption(acct("Audit Bank"));
    await p.getByLabel(/^Amount/).fill("100000");
    await p.getByLabel("Category").selectOption({ label: "Salary" });
    await p.getByLabel("Description").fill("Audit salary");
  });
  urls.cardExpense = await addTx(page, "Expense", async (p) => {
    await p.getByLabel("Account", { exact: true }).selectOption(acct("Audit Card"));
    await p.getByLabel(/^Amount/).fill("3000");
    await p.getByLabel("Category").selectOption({ label: "Dining › Coffee & tea" });
    await p.getByLabel("Description").fill("Audit cafe on card");
  });
  await addTx(page, "Transfer", async (p) => {
    await p.getByLabel("From").selectOption(acct("Audit Bank"));
    await p.getByLabel("To", { exact: true }).selectOption(acct("Audit Card"));
    await p.getByLabel(/^Amount sent/).fill("3000");
    await p.getByLabel("Description").fill("Audit pay card bill");
  });
  await addTx(page, "Refund", async (p) => {
    await p.getByLabel("Account", { exact: true }).selectOption(acct("Audit Bank"));
    await p.getByLabel(/^Amount/).fill("500");
    await p.getByLabel("Category").selectOption({ label: "Dining" });
    await p.getByLabel("Description").fill("Audit refund");
  });
  await addTx(page, "Adjustment", async (p) => {
    await p.getByLabel("Account", { exact: true }).selectOption(acct("Audit Wallet"));
    await p.getByLabel("Decrease the balance").check();
    await p.getByLabel(/^Amount/).fill("200");
    await p.getByLabel("Description").fill("Audit wallet correction");
    await p.locator("#notes").fill("Counted cash was lower");
  });
  urls.pending = await addTx(page, "Expense", async (p) => {
    await p.getByLabel("Account", { exact: true }).selectOption(acct("Audit Bank"));
    await p.getByLabel(/^Amount/).fill("1000");
    await p.getByLabel("Category").selectOption({ label: "Food & groceries" });
    await p.getByLabel("Description").fill("Audit pending groceries");
    await p.getByLabel("Status").selectOption("pending");
  });
  // An adjustment without a reason is refused.
  await page.goto("/transactions/new");
  await chooseKind(page, "Adjustment");
  await page.getByLabel("Account", { exact: true }).selectOption(acct("Audit Wallet"));
  await page.getByLabel(/^Amount/).fill("1");
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByText(/Explain the adjustment/)).toBeVisible();

  // Edit the pending expense to 1,200, then delete a throwaway one.
  await page.goto(urls.pending!);
  await page.getByLabel(/^Amount/).fill("1200");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Transaction saved.")).toBeVisible();
  await expect(page.getByText("−Rs 1,200.00").first()).toBeVisible();
  const temp = await addTx(page, "Expense", async (p) => {
    await p.getByLabel("Account", { exact: true }).selectOption(acct("Audit Bank"));
    await p.getByLabel(/^Amount/).fill("99");
    await p.getByLabel("Category").selectOption({ label: "Shopping" });
    await p.getByLabel("Description").fill("Audit delete me");
  });
  await page.goto(temp);
  await confirmIn(page, page.getByRole("button", { name: "Delete transaction" }), "Delete");
  await expect(page.getByText("Transaction deleted.")).toBeVisible();
  await expect(page.getByText("Audit delete me")).toHaveCount(0);
});

test("4. search, filters and the transaction list", async ({ page }) => {
  await page.goto("/transactions?q=cafe");
  await expect(page.getByText("Audit cafe on card").first()).toBeVisible();
  await expect(page.getByText("Audit salary")).toHaveCount(0);
  await page.goto("/transactions?kind=transfer");
  await expect(page.getByText("Audit pay card bill").first()).toBeVisible();
  await expect(page.getByText("Audit refund")).toHaveCount(0);
  await page.goto("/transactions?status=pending");
  await expect(page.getByText("Audit pending groceries").first()).toBeVisible();
  await expect(page.getByText("Audit salary")).toHaveCount(0);
  await page.goto("/transactions");
  await shot(page, "transactions");
});

test("5. exchange rates and a cross-currency transfer", async ({ page }) => {
  await page.goto("/settings/exchange-rates");
  await page.getByLabel("1 unit of", { exact: true }).selectOption("USD");
  await page.getByLabel("of", { exact: true }).selectOption("PKR");
  await page.getByLabel("equals").fill("280");
  await page.getByLabel("From date").fill("2026-01-01");
  await page.getByRole("button", { name: "Add rate" }).click();
  await expect(page.getByText(/Saved 1 USD = 280 PKR/)).toBeVisible();
  await addTx(page, "Transfer", async (p) => {
    await p.getByLabel("From").selectOption(acct("Audit Bank"));
    await p.getByLabel("To", { exact: true }).selectOption(acct("Audit USD", "USD"));
    await p.getByLabel(/^Amount sent/).fill("28000");
    await p.getByLabel(/^Amount received/).fill("100");
    await p.getByLabel("Description").fill("Audit buy dollars");
  });
  await page.goto(urls.usd!);
  await expect(page.getByText("$ 200.00").first()).toBeVisible();
});

test("6. account page, edit, archive, delete", async ({ page }) => {
  // Bank: 200,000 + 100,000 − 3,000 + 500 − 1,200 − 28,000 = 268,300.
  await page.goto(urls.bank!);
  await expect(page.getByText("Rs 268,300.00").first()).toBeVisible();
  // Card bought 3,000 and paid 3,000: owes nothing.
  await page.goto(urls.card!);
  await expect(page.getByText("Rs 0.00").first()).toBeVisible();
  await shot(page, "account-card");
  // Rename the wallet.
  await page.goto(`${urls.wallet}/edit`);
  await page.getByLabel("Name").fill("Audit JazzCash");
  await page.getByRole("button", { name: "Save account" }).click();
  await expect(page.getByRole("heading", { name: "Audit JazzCash" })).toBeVisible();
  // A new, unused account can be deleted.
  const temp = await newAccount(page, "Audit Temp", "Cash", "0");
  await page.goto(`${temp}/edit`);
  await confirmIn(page, page.getByRole("button", { name: "Delete account" }), "Delete account");
  await expect(page.getByText("Account deleted.")).toBeVisible();
  await expect(page.getByText("Audit Temp")).toHaveCount(0);
});

test("7. reconciliation, lock and undo", async ({ page }) => {
  await page.goto(`${urls.bank}/reconcile`);
  // The statement shows 268,000; record the difference as an adjustment.
  await page.getByLabel(/Statement balance/).fill("268000");
  await page.getByLabel("Record an adjustment for any difference").check();
  await page.getByRole("button", { name: "Save reconciliation" }).click();
  await expect(page.getByText(/Reconciliation saved/)).toBeVisible();
  await page.goto(urls.bank!);
  // Cleared balance excludes the pending 1,200: 269,500 vs statement 268,000 → a 1,500 adjustment.
  await expect(page.getByText("Rs 268,000.00").first()).toBeVisible(); // cleared, now matches the statement
  await expect(page.getByText("Rs 266,800.00").first()).toBeVisible(); // working balance
  await expect(page.getByText("reconciled").first()).toBeVisible();
  await shot(page, "account-reconciled");
  await page.goto(`${urls.bank}/reconcile`);
  await confirmIn(page, page.getByRole("button", { name: "Undo" }).first(), "Undo");
  await expect(page.getByText(/Reconciliation removed/)).toBeVisible();
});

test("8. budgets: set, update, remove", async ({ page }) => {
  await page.goto("/budgets");
  const all = page.getByLabel(/Budget for All spending/);
  await all.fill("50000");
  await page.locator("form", { has: all }).getByRole("button", { name: "Set" }).click();
  const dining = page.getByLabel(/Budget for Dining/);
  await dining.fill("2000");
  await page.locator("form", { has: dining }).getByRole("button", { name: "Set" }).click();
  // Dining: 3,000 spent − 500 refunded = 2,500 of 2,000: over budget.
  await expect(page.getByRole("meter", { name: /Dining: 125% of budget used/ })).toBeVisible();
  await page.reload();
  await page.getByLabel(/Budget for Dining/).fill("3000");
  await page
    .locator("form", { has: page.getByLabel(/Budget for Dining/) })
    .getByRole("button", { name: "Update" })
    .click();
  await expect(page.getByRole("meter", { name: /Dining: 83% of budget used/ })).toBeVisible();
  await shot(page, "budgets");
  await page.reload();
  await confirmIn(page, page.getByRole("button", { name: "Remove" }).first(), "Remove budget");
  await expect(page.getByRole("button", { name: "Remove" })).toHaveCount(1);
});

test("9. savings goals: allocations and a linked goal", async ({ page }) => {
  await page.goto("/goals/new");
  await page.getByLabel("Name").fill("Audit Car");
  await page.getByLabel("Target amount").fill("1,000,000");
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("heading", { name: "Audit Car" })).toBeVisible();
  const save = async (direction: string, amount: string) => {
    await page.getByLabel("Type").selectOption(direction);
    await page.getByLabel(/^Amount/).fill(amount);
    await page.getByRole("button", { name: "Save" }).click();
    // Wait for this save to finish before the next entry.
    await expect(page.getByRole("button", { name: "Save" })).toBeEnabled();
    await expect(page.getByRole("alert").or(page.getByRole("status")).first()).toBeVisible();
  };
  await save("allocate", "50000");
  await expect(page.getByText(/Rs 50,000.00/).first()).toBeVisible();
  await save("release", "10000");
  await expect(page.getByText("5% of target").or(page.getByText("4% of target")).first()).toBeVisible();
  await save("release", "999999");
  await expect(page.getByText(/release more than is allocated|can’t|cannot/i).first()).toBeVisible();
  await page.getByRole("button", { name: "Mark completed" }).click();
  await expect(page.getByRole("button", { name: "Reopen" })).toBeVisible();
  await expect(page.getByText(/completed/).first()).toBeVisible();

  await page.goto("/goals/new");
  await page.getByLabel("Name").fill("Audit Emergency");
  await page.getByLabel("Target amount").fill("10000");
  await page.getByText("A dedicated account").click();
  await page.locator("#linked_account_id").selectOption({ label: "Audit JazzCash (PKR)" });
  await page.getByRole("button", { name: "Create goal" }).click();
  await expect(page.getByRole("heading", { name: "Audit Emergency" })).toBeVisible();
  await expect(page.getByText("Rs 4,800.00").first()).toBeVisible(); // 5,000 − 200 adjustment
  await confirmIn(page, page.getByRole("button", { name: "Delete goal" }), "Delete goal");
  await page.goto("/goals");
  await expect(page.getByText("Audit Emergency")).toHaveCount(0);
  await shot(page, "goals");
});

test("10. investments: every transaction type, valuations, par, edit, archive", async ({ page }) => {
  // A fund with 4 decimal places.
  await page.goto("/investments/assets/new");
  await page.getByLabel("Category").selectOption({ label: "Funds" });
  await page.getByLabel("Name", { exact: true }).fill("Audit Meezan Fund");
  await page.getByRole("button", { name: "Create asset" }).click();
  await expect(page.getByRole("heading", { name: "Audit Meezan Fund" })).toBeVisible();
  urls.fund = new URL(page.url()).pathname;
  const fundId = urls.fund.split("/").pop()!;

  const invTx = async (kind: string, fill: (p: Page) => Promise<void>) => {
    await page.goto(`/investments/new?asset=${fundId}`);
    await chooseKind(page, kind);
    await fill(page);
    await page.getByRole("button", { name: /Save/ }).click();
    await expect(page.getByRole("heading", { name: "Audit Meezan Fund" })).toBeVisible();
  };
  const broker = { label: "Audit Broker (PKR)" };
  await invTx("Opening holding", async (p) => {
    await p.getByLabel("Held in (investment account)").selectOption(broker);
    await p.getByLabel(/^Quantity/).fill("100");
    await p.getByLabel(/Total cost you paid/).fill("10000");
  });
  await invTx("Buy", async (p) => {
    await p.getByLabel("Held in (investment account)").selectOption(broker);
    await p.getByLabel(/^Quantity/).fill("50.5");
    await p.getByLabel(/^Price per unit/).fill("120");
    await p.getByLabel(/^Fees and taxes/).fill("60");
    await p.getByLabel("Paid from").selectOption({ label: "Audit Bank (PKR)" });
  });
  await invTx("Dividend", async (p) => {
    await p.getByLabel("Paid into").selectOption({ label: "Audit Bank (PKR)" });
    await p.getByLabel(/^Amount/).fill("500");
  });
  await invTx("Investment fee", async (p) => {
    await p.getByLabel("Paid from").selectOption({ label: "Audit Bank (PKR)" });
    await p.getByLabel(/^Amount/).fill("100");
  });
  await invTx("Split", async (p) => {
    await p.getByLabel("Held in (investment account)").selectOption(broker);
    await p.getByLabel(/^Units added/).fill("150.5");
  });
  // Held: 100 + 50.5 + 150.5 = 301 units; cost 10,000 + 6,060 + 60 = 16,120.
  await expect(page.getByText("301 units").first()).toBeVisible();
  await expect(page.getByText("Rs 16,120.00").first()).toBeVisible();
  // Value by total: everything held is worth 30,100 → 100 per unit.
  await page.getByLabel("I’m entering").selectOption("total_value");
  await page.getByLabel("Amount (PKR)").fill("30100");
  await page.getByRole("button", { name: "Save valuation" }).click();
  await expect(page.getByText("Valuation saved.")).toBeVisible();
  await expect(page.getByText("Rs 100.00").first()).toBeVisible();
  await invTx("Sell", async (p) => {
    await p.getByLabel("Held in (investment account)").selectOption(broker);
    await p.getByLabel(/^Quantity/).fill("1");
    await p.getByLabel(/^Price per unit/).fill("110");
    await p.getByLabel("Paid into").selectOption(broker);
  });
  // Average cost 16,120 / 301 = 53.5548…; gain 110 − 53.5548 = 56.4452 → Rs 56.45 (rounded once, at display).
  await expect(page.getByText("+Rs 56.45").first()).toBeVisible();
  await shot(page, "asset-fund");

  // Edit the sell from the transaction page: change the price to 120.
  await page.getByRole("link", { name: /^Sell/ }).first().click();
  await page.getByLabel(/^Price per unit/).fill("120");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("heading", { name: "Audit Meezan Fund" })).toBeVisible();
  await expect(page.getByText("+Rs 66.45").first()).toBeVisible();

  // A T-bill at par value.
  await page.goto("/investments/assets/new");
  await page.getByLabel("Category").selectOption({ label: "Fixed income" });
  await page.getByLabel("Name", { exact: true }).fill("Audit T-bill");
  await page.getByText("Par value (1 per unit)").click();
  await page.getByRole("button", { name: "Create asset" }).click();
  await expect(page.getByRole("heading", { name: "Audit T-bill" })).toBeVisible();
  const tbill = new URL(page.url()).pathname.split("/").pop()!;
  await page.goto(`/investments/new?asset=${tbill}`);
  await chooseKind(page, "Buy");
  await page.getByLabel("Held in (investment account)").selectOption(broker);
  await page.getByLabel(/^Quantity/).fill("100000");
  await page.getByLabel(/^Price per unit/).fill("0.95");
  await page.getByLabel("Paid from").selectOption({ label: "Audit Bank (PKR)" });
  await page.getByRole("button", { name: /Save/ }).click();
  await expect(page.getByText("Par value (assumed)").first()).toBeVisible();
  await expect(page.getByText("+Rs 5,000.00").first()).toBeVisible(); // 100,000 − 95,000

  // An unused asset can be deleted; a used one archived.
  await page.goto("/investments/assets/new");
  await page.getByLabel("Name", { exact: true }).fill("Audit Unused");
  await page.getByRole("button", { name: "Create asset" }).click();
  await confirmIn(page, page.getByRole("button", { name: "Delete asset" }), "Delete asset");
  await expect(page.getByText("Asset deleted.")).toBeVisible();
  await page.goto(`/investments/assets/${tbill}`);
  await page.getByRole("button", { name: "Archive" }).click();
  await expect(page.getByText(/Archived/).first()).toBeVisible();
  await page.goto("/investments");
  await shot(page, "investments");
});

test("11. net worth, snapshot, dashboard agree", async ({ page }) => {
  await page.goto("/net-worth");
  const nw = (await page
    .getByText(/^Rs [\d,]+\.\d\d$/)
    .first()
    .textContent())!;
  netWorthBefore = nw;
  await page.goto("/");
  await expect(page.getByText(nw).first()).toBeVisible();
  await shot(page, "dashboard");
  await page.goto("/net-worth");
  await page.getByRole("button", { name: "Save snapshot" }).click();
  await expect(page.getByText("Snapshot saved.")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Delete" }).first()).toBeVisible();
  await confirmIn(page, page.getByRole("button", { name: "Delete" }).first(), "Delete snapshot");
  await expect(page.getByText("No snapshots yet.")).toBeVisible();
});

test("12. reports and every export", async ({ page }) => {
  for (const tab of ["monthly", "categories", "budgets", "yearly", "investments"]) {
    await page.goto(`/reports?tab=${tab}`);
    await expect(page.locator("h1")).toHaveText("Reports");
    await expect(page.getByText(/Something went wrong/)).toHaveCount(0);
    const [file] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Export this report as CSV" }).click(),
    ]);
    const text = readFileSync((await file.path())!, "utf8");
    expect(text.split("\r\n").length, tab).toBeGreaterThan(2);
  }
  await page.goto("/reports?tab=investments");
  await expect(page.getByText("Rs 500.00").first()).toBeVisible(); // the dividend
  await shot(page, "report-investments");

  await page.goto("/settings/data");
  for (const link of await page.getByRole("link", { name: "CSV" }).all()) {
    const [file] = await Promise.all([page.waitForEvent("download"), link.click()]);
    const text = readFileSync((await file.path())!, "utf8");
    expect(text.startsWith("﻿"), file.suggestedFilename()).toBe(true);
    expect(text.length, file.suggestedFilename()).toBeGreaterThan(20);
  }
});

let backupPath = "";

test("13. backup, delete all data, restore: everything comes back", async ({ page }) => {
  // Needs migration 0013 on the project (Supabase refuses DELETE without WHERE). AUDIT_SKIP_RESTORE=1 skips it.
  test.skip(process.env.AUDIT_SKIP_RESTORE === "1", "migration 0013 not applied yet");
  await page.goto("/settings/data");
  const [backup] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download backup" }).click(),
  ]);
  backupPath = `test-results/audit/backup.json`;
  await backup.saveAs(backupPath);
  // Restore refuses a non-empty account.
  await expect(page.getByLabel("Backup file")).toBeDisabled();

  await confirmIn(page, page.getByRole("button", { name: "Delete all my data" }), "Delete everything", {
    "Type DELETE to confirm": "DELETE",
  });
  await expect(page.getByText(/All your financial records were deleted/)).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Start by adding your accounts")).toBeVisible();

  await page.goto("/settings/data");
  await page.getByLabel("Backup file").setInputFiles(backupPath);
  await expect(page.getByText(/This backup holds/)).toBeVisible();
  await page.getByRole("button", { name: "Restore this backup" }).click();
  await expect(page.getByText(/Restored \d+ accounts/)).toBeVisible();
  await page.goto("/net-worth");
  await expect(page.getByText(netWorthBefore).first()).toBeVisible();
  await page.goto("/investments");
  await expect(page.getByText("Audit Meezan Fund").first()).toBeVisible();
});

test("14. settings: profile and theme", async ({ page }) => {
  await page.goto("/settings/profile");
  await page.getByLabel("Display name (optional)").fill("Audit Owner");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText(/saved/i).first()).toBeVisible();
  await page.goto("/settings");
  await page.getByRole("radio", { name: "Dark" }).first().click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await shot(page, "settings-dark");
  await page.getByRole("radio", { name: "Light" }).first().click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
});

test("15. two-factor: turn on, sign in with a code, turn off", async ({ page }) => {
  const u = user();
  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Set up authenticator app" }).click();
  const secret = (await page.locator("code").textContent())!.trim();
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: "Turn on two-factor authentication" }).click();
  await expect(page.getByText(/On since/)).toBeVisible();

  // Sign out, sign in: the app asks for the code before showing anything.
  await page.getByRole("button", { name: "Sign out" }).first().click();
  await page.waitForURL(/\/login/);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/login\/mfa/);
  await page.goto("/");
  await page.waitForURL(/\/login\/mfa/);
  await page.getByLabel("6-digit code").fill("000000");
  await page.getByRole("button", { name: /Verify|Continue|Sign in/ }).click();
  await expect(page.getByText(/not valid/)).toBeVisible();
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 1000));
  await page.getByLabel("6-digit code").fill(totp(secret));
  await page.getByRole("button", { name: /Verify|Continue|Sign in/ }).click();
  await page.waitForURL((url) => url.pathname === "/");

  await page.goto("/settings/security");
  await page.getByRole("button", { name: "Turn off two-factor authentication" }).click();
  await page.getByRole("button", { name: "Yes, turn it off" }).click();
  await expect(page.getByRole("button", { name: "Set up authenticator app" })).toBeVisible();
});

test("16. sign-in errors, recovery page, offline page", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.getByLabel("Email").fill(user().email);
  await page.getByLabel("Password").fill("wrong-password-123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
  await page.getByRole("link", { name: /Forgot your password/ }).click();
  await expect(page.getByRole("heading").first()).toBeVisible();
  await page.goto("/offline");
  await expect(page.getByText("You’re offline")).toBeVisible();
  await ctx.close();
});

test("17. delete the account through the app", async ({ page }) => {
  const u = user();
  // Step 15 signed out (which ends the saved session), so sign in again first.
  await page.goto("/login?next=/settings/data");
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(/\/settings\/data/);
  await confirmIn(page, page.getByRole("button", { name: "Delete my account" }), "Delete my account", {
    [`Type your email (${u.email})`]: u.email,
    "Your password": u.password,
  });
  await page.waitForURL(/\/login\?deleted=1/);
  await expect(page.getByText("Your account and all its data were deleted.")).toBeVisible();
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Email or password is incorrect.")).toBeVisible();
});
