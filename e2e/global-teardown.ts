import { existsSync, readFileSync, rmSync } from "node:fs";
import { deleteTestUser, type TestUser } from "./support/env";
import { AUTH_DIR, USER_FILE } from "./global-setup";

/** Deletes the temporary user; every record it created goes with it (cascade). */
export default async function globalTeardown() {
  if (!existsSync(USER_FILE)) return;
  const user = JSON.parse(readFileSync(USER_FILE, "utf8")) as TestUser;
  await deleteTestUser(user.id);
  rmSync(AUTH_DIR, { recursive: true, force: true });
}
