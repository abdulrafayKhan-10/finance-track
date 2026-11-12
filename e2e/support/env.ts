import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";

/**
 * E2E and isolation checks run against the DEV Supabase project in
 * .env.local. They create temporary users with the secret key and delete
 * them (and, by cascade, everything they made) afterwards.
 */
loadEnvConfig(process.cwd());

export function e2eEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishable = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const secret = process.env.SUPABASE_SECRET_KEY;
  if (!url || !publishable || !secret) {
    throw new Error(
      "E2E needs NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local.",
    );
  }
  // Never against production: set PRODUCTION_SUPABASE_URL (e.g. in .env.local) once the production project exists.
  const production = process.env.PRODUCTION_SUPABASE_URL;
  if (production && new URL(production).host === new URL(url).host) {
    throw new Error("Refusing to run E2E against the production Supabase project.");
  }
  return { url, publishable, secret };
}

export function adminClient() {
  const { url, secret } = e2eEnv();
  return createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type TestUser = { id: string; email: string; password: string };

/** A confirmed throwaway user with a random strong password. */
export async function createTestUser(label: string): Promise<TestUser> {
  const admin = adminClient();
  const suffix = crypto.randomUUID().slice(0, 8);
  const email = `ft-${label}-${suffix}@example.com`;
  const password = `${crypto.randomUUID()}Aa1!`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(`Could not create the test user: ${error?.message ?? "unknown"}`);
  return { id: data.user.id, email, password };
}

/** Test users this suite creates look exactly like this; nothing else is ever touched. */
const TEST_EMAIL = /^ft-(e2e|iso-[a-z]+)-[0-9a-f]{8}@example\.com$/;

/** Deletes test users left behind by an interrupted run. Returns the emails it could not delete. */
export async function deleteLeftoverTestUsers(): Promise<string[]> {
  const admin = adminClient();
  const failed: string[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw new Error(`Could not list users: ${error.message}`);
    for (const u of data.users) {
      if (u.email && TEST_EMAIL.test(u.email)) {
        const r = await admin.auth.admin.deleteUser(u.id);
        if (r.error) failed.push(u.email);
      }
    }
    if (data.users.length < 100) break;
  }
  return failed;
}

export async function deleteTestUser(id: string): Promise<void> {
  const { error } = await adminClient().auth.admin.deleteUser(id);
  if (error) throw new Error(`Could not delete test user ${id}: ${error.message}`);
}
