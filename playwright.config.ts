import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests (docs/07-testing-strategy.md) against a production build
 * (`next start`) and the DEV Supabase project from .env.local. A temporary
 * user is created before and deleted after the run.
 *   pnpm test:e2e
 */
const PORT = 3100;

export default defineConfig({
  testDir: "e2e",
  outputDir: "test-results/e2e",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    // The full functional audit deletes its own account at the end, so it only runs when asked for:
    //   AUDIT=1 npx playwright test --project=audit
    ...(process.env.AUDIT === "1"
      ? [
          {
            name: "audit",
            testMatch: /audit\.spec\.ts/,
            timeout: 180_000,
            use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
          },
        ]
      : []),
    { name: "isolation", testMatch: /(isolation|auth-settings)\.spec\.ts/ },
    { name: "public", testMatch: /public\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    {
      name: "desktop",
      testMatch: /flow\.spec\.ts/,
      dependencies: ["public"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
    },
    {
      name: "mobile",
      testMatch: /screens\.spec\.ts/,
      dependencies: ["desktop"],
      use: { ...devices["Pixel 7"], storageState: "e2e/.auth/state.json" },
    },
    {
      name: "mobile-dark",
      testMatch: /screens\.spec\.ts/,
      dependencies: ["desktop"],
      use: { ...devices["Pixel 7"], colorScheme: "dark", storageState: "e2e/.auth/state.json" },
    },
    {
      name: "desktop-screens",
      testMatch: /screens\.spec\.ts/,
      dependencies: ["desktop"],
      use: { ...devices["Desktop Chrome"], storageState: "e2e/.auth/state.json" },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
