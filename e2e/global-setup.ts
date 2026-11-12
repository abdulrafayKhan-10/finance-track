import { mkdirSync, writeFileSync } from "node:fs";
import { chromium, type FullConfig } from "@playwright/test";
import { createTestUser, deleteLeftoverTestUsers } from "./support/env";

export const AUTH_DIR = "e2e/.auth";
export const USER_FILE = `${AUTH_DIR}/user.json`;
export const STATE_FILE = `${AUTH_DIR}/state.json`;

/** Creates a temporary user in the dev project and signs in once, saving the session for the tests. */
export default async function globalSetup(config: FullConfig) {
  mkdirSync(AUTH_DIR, { recursive: true });
  const stuck = await deleteLeftoverTestUsers();
  if (stuck.length) console.warn(`Could not delete leftover test users (apply migration 0012): ${stuck.join(", ")}`);
  const user = await createTestUser("e2e");
  writeFileSync(USER_FILE, JSON.stringify(user));

  const baseURL = config.projects[0]!.use.baseURL!;
  const browser = await chromium.launch();
  const page = await browser.newPage({ baseURL });
  await page.goto("/login");
  await page.getByLabel("Email").fill(user.email);
  await page.getByLabel("Password").fill(user.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => url.pathname === "/", { timeout: 30_000 });
  await page.context().storageState({ path: STATE_FILE });
  await browser.close();
}
