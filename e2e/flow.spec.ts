import { readFileSync } from "node:fs";
import { expect, type Page, test } from "@playwright/test";

/**
 * The release journey from docs/07: accounts → income, expense, transfer →
 * budget → buy, valuation, sell → net worth → export, backup and import.
 * Runs once, in order, as a fresh temporary user. Every figure is checked to
 * the rupee, so a wrong balance fails the run.
 */
test.describe.configure({ mode: "serial" });

const BANK = "E2E Bank";
const BROKER = "E2E Broker";
const GOLD = "E2E Gold";

function todayKarachi(): { iso: string; dmy: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Karachi",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {});
  return { iso: `${parts.year}-${parts.month}-${parts.day}`, dmy: `${parts.day}/${parts.month}/${parts.year}` };
}

async function addTransaction(page: Page, fill: (page: Page) => Promise<void>) {
  await page.goto("/transactions/new");
  await fill(page);
  await page.getByRole("button", { name: "Add transaction" }).click();
  await expect(page.getByText("Transaction saved.")).toBeVisible();
}

let assetUrl = "";

test("create a bank account and an investment account", async ({ page }) => {
  for (const [name, type, opening] of [
    [BANK, "Bank account", "100000"],
    [BROKER, "Investment account", "0"],
  ] as const) {
    await page.goto("/accounts/new");
    await page.getByLabel("Name").fill(name);
    await page.getByLabel("Type").selectOption({ label: type });
    await page.getByLabel("Opening balance").fill(opening);
    await page.getByRole("button", { name: "Create account" }).click();
    await expect(page.getByRole("heading", { name })).toBeVisible();
  }
});

test("record income, an expense and a transfer", async ({ page }) => {
  await addTransaction(page, async (p) => {
    await p.getByLabel("Income", { exact: true }).check();
    await p.getByLabel("Account", { exact: true }).selectOption({ label: `${BANK} (PKR)` });
    await p.getByLabel(/^Amount/).fill("50000");
    await p.getByLabel("Category").selectOption({ label: "Salary" });
    await p.getByLabel("Description").fill("E2E salary");
  });
  await addTransaction(page, async (p) => {
    await p.getByLabel("Expense", { exact: true }).check();
    await p.getByLabel("Account", { exact: true }).selectOption({ label: `${BANK} (PKR)` });
    await p.getByLabel(/^Amount/).fill("1,500");
    await p.getByLabel("Category").selectOption({ label: "Food & groceries" });
    await p.getByLabel("Description").fill("E2E groceries");
  });
  await addTransaction(page, async (p) => {
    await p.getByLabel("Transfer", { exact: true }).check();
    await p.getByLabel("From").selectOption({ label: `${BANK} (PKR)` });
    await p.getByLabel("To", { exact: true }).selectOption({ label: `${BROKER} (PKR)` });
    await p.getByLabel(/^Amount sent/).fill("20000");
    await p.getByLabel("Description").fill("E2E fund broker");
  });
});

test("set a budget and see the expense counted against it", async ({ page }) => {
  await page.goto("/budgets");
  const input = page.getByLabel("Budget for Food & groceries (PKR)");
  await input.fill("20000");
  await page.locator("form", { has: input }).getByRole("button", { name: "Set" }).click();
  await expect(page.getByText("Food & groceries: 8% of budget used")).toBeAttached();
});

test("add an asset, buy, value and sell it", async ({ page }) => {
  await page.goto("/investments/assets/new");
  await page.getByLabel("Category").selectOption({ label: "Gold" });
  await page.getByLabel("Name").fill(GOLD);
  await expect(page.getByLabel("Unit")).toHaveValue("tola");
  await page.getByRole("button", { name: "Create asset" }).click();
  await expect(page.getByRole("heading", { name: GOLD })).toBeVisible();
  assetUrl = new URL(page.url()).pathname;
  const assetId = assetUrl.split("/").pop()!;

  // Buy 0.1 tola at 200,000 with the broker's cash.
  await page.goto(`/investments/new?asset=${assetId}`);
  await page.getByLabel("Buy", { exact: true }).check();
  await page.getByLabel("Held in (investment account)").selectOption({ label: `${BROKER} (PKR)` });
  await page.getByLabel(/^Quantity/).fill("0.1");
  await page.getByLabel(/^Price per unit/).fill("200000");
  await page.getByLabel("Paid from").selectOption({ label: `${BROKER} (PKR)` });
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("heading", { name: GOLD })).toBeVisible();
  await expect(page.getByText("unvalued").first()).toBeVisible();

  // Value it at 210,000 per tola.
  await page.getByLabel("Amount (PKR)").fill("210000");
  await page.getByRole("button", { name: "Save valuation" }).click();
  await expect(page.getByText("Valuation saved.")).toBeVisible();

  // Sell 0.05 tola at 220,000 into the broker account: realized gain 11,000 − 10,000 = 1,000.
  await page.goto(`/investments/new?asset=${assetId}`);
  await page.getByLabel("Sell", { exact: true }).check();
  await page.getByLabel("Held in (investment account)").selectOption({ label: `${BROKER} (PKR)` });
  await page.getByLabel(/^Quantity/).fill("0.05");
  await page.getByLabel(/^Price per unit/).fill("220000");
  await page.getByLabel("Paid into").selectOption({ label: `${BROKER} (PKR)` });
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByRole("heading", { name: GOLD })).toBeVisible();
  await expect(page.getByText("+Rs 1,000.00").first()).toBeVisible();
});

test("selling more than is held is refused", async ({ page }) => {
  await page.goto(`/investments/new?asset=${assetUrl.split("/").pop()}`);
  await page.getByLabel("Sell", { exact: true }).check();
  await page.getByLabel("Held in (investment account)").selectOption({ label: `${BROKER} (PKR)` });
  await page.getByLabel(/^Quantity/).fill("1");
  await page.getByLabel(/^Price per unit/).fill("220000");
  await page.getByLabel("Paid into").selectOption({ label: `${BROKER} (PKR)` });
  await page.getByRole("button", { name: "Save transaction" }).click();
  await expect(page.getByText(/more than the account holds/)).toBeVisible();
});

test("net worth counts cash and valued holdings exactly once", async ({ page }) => {
  // Bank 100,000 + 50,000 − 1,500 − 20,000 = 128,500; broker cash 20,000 − 20,000 + 11,000 = 11,000;
  // holdings 0.05 tola × 210,000 = 10,500. Net worth 150,000.
  await page.goto("/net-worth");
  await expect(page.getByText("Rs 150,000.00").first()).toBeVisible();
  await page.goto("/");
  await expect(page.getByText("Rs 150,000.00").first()).toBeVisible();
  await expect(page.getByText("Rs 10,500.00").first()).toBeVisible();
});

test("export transactions as CSV and download a backup", async ({ page }) => {
  await page.goto("/transactions");
  const [csv] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Export CSV" }).click(),
  ]);
  const text = readFileSync((await csv.path())!, "utf8");
  expect(text).toContain("E2E salary");
  expect(text).toContain(GOLD);
  expect(text).toContain("-1500.00");

  await page.goto("/settings/data");
  const [backup] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download backup" }).click(),
  ]);
  const json = JSON.parse(readFileSync((await backup.path())!, "utf8"));
  expect(json.format).toBe("finance-track-backup");
  expect(json.data.transactions.length).toBeGreaterThanOrEqual(5);
  expect(json.data.assets.map((a: { name: string }) => a.name)).toContain(GOLD);
});

test("import a CSV statement, then undo it", async ({ page }) => {
  const { dmy } = todayKarachi();
  await page.goto("/transactions/import");
  await page.getByLabel("CSV file").setInputFiles({
    name: "e2e-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(`Date,Description,Amount\n${dmy},E2E imported coffee,-250\n${dmy},E2E imported cashback,100\n`),
  });
  await page.getByLabel("Account", { exact: true }).selectOption({ label: `${BANK} (PKR)` });
  await page.getByRole("button", { name: "Check rows" }).click();
  await expect(page.getByText(/2 ready/)).toBeVisible();
  await page.getByRole("button", { name: "Import 2 transactions" }).click();
  await expect(page.getByText("Imported 2 transactions.", { exact: false })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Undo import" }).first().click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByLabel("Type UNDO to confirm").fill("UNDO");
  await dialog.getByRole("button", { name: "Undo import" }).click();
  await expect(dialog.getByText("Import undone: 2 transactions removed.")).toBeVisible();
});
