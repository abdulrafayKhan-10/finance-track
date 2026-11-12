import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { createTestUser, deleteTestUser, e2eEnv, type TestUser } from "./support/env";
import { totp } from "./support/totp";

/** Auth settings and the MFA gate on the REAL dev project (docs/05 §5.3). Independent tests. */
const { url, publishable } = e2eEnv();
const users: TestUser[] = [];
const client = () => createClient(url, publishable, { auth: { persistSession: false, autoRefreshToken: false } });

async function signedIn(user: TestUser) {
  const c = client();
  const { error } = await c.auth.signInWithPassword({ email: user.email, password: user.password });
  if (error) throw new Error(`sign-in failed: ${error.message}`);
  return c;
}

test.afterAll(async () => {
  for (const u of users) await deleteTestUser(u.id);
});

test("public sign-up is disabled", async () => {
  const r = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: publishable } });
  const settings = await r.json();
  expect(
    settings.disable_signup,
    "Turn off Authentication → Sign In / Providers → “Allow new users to sign up” in the Supabase dashboard",
  ).toBe(true);
});

test("once MFA is on, a password-only session sees nothing until the code is entered", async () => {
  const user = await createTestUser("iso-mfa");
  users.push(user);
  const c = await signedIn(user);
  await c
    .from("accounts")
    .insert({ name: "MFA bank", type: "bank", currency: "PKR", opening_balance: "5", opening_date: "2026-01-01" });
  const enroll = await c.auth.mfa.enroll({ factorType: "totp" });
  expect(enroll.error).toBeNull();
  const factorId = enroll.data!.id;
  const verified = await c.auth.mfa.challengeAndVerify({ factorId, code: totp(enroll.data!.totp.secret) });
  expect(verified.error).toBeNull();

  // A new sign-in with only the password is aal1: the restrictive policy hides everything.
  const aal1 = await signedIn(user);
  const hidden = await aal1.from("accounts").select("id");
  expect(hidden.data ?? []).toEqual([]);
  const blocked = await aal1
    .from("accounts")
    .insert({ name: "x", type: "bank", currency: "PKR", opening_balance: "0", opening_date: "2026-01-01" });
  expect(blocked.error).not.toBeNull();

  // With the TOTP code the session reaches aal2 and the data is back.
  // A code can be used once: wait for the next 30-second window.
  await new Promise((r) => setTimeout(r, 30_000 - (Date.now() % 30_000) + 1000));
  const step = await aal1.auth.mfa.challengeAndVerify({ factorId, code: totp(enroll.data!.totp.secret) });
  expect(step.error).toBeNull();
  const visible = await aal1.from("accounts").select("name");
  expect(visible.data?.map((r) => r.name)).toEqual(["MFA bank"]);
});
