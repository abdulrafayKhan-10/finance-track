import { expect, test } from "@playwright/test";

/**
 * Every main screen, signed in, on a phone and a desktop: it renders, logs no
 * console errors, and never scrolls sideways (docs/06: no horizontal page
 * scroll). Screenshots land in test-results/e2e for a visual review.
 */
const SCREENS = [
  "/",
  "/transactions",
  "/transactions/new",
  "/transactions/import",
  "/accounts",
  "/budgets",
  "/goals",
  "/investments",
  "/investments/new",
  "/net-worth",
  "/reports",
  "/reports?tab=investments",
  "/settings",
  "/settings/data",
  "/more",
];

for (const path of SCREENS) {
  test(`renders ${path}`, async ({ page }, testInfo) => {
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(200);
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByText(/Something went wrong/i)).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, `${path} scrolls sideways by ${overflow}px`).toBeLessThanOrEqual(1);
    expect(errors, path).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath(`${path.replace(/[/?=&]+/g, "_") || "home"}.png`),
      fullPage: true,
    });
  });
}
