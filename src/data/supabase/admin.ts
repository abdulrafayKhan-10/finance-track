import "server-only";
import { createClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env/public";
import { getServerEnv } from "@/lib/env/server";

/**
 * Privileged client (secret / service-role key): bypasses RLS. Used for one
 * thing only, deleting the signed-in user's own auth account, after the action
 * has re-checked their password. Never imported by client code (server-only).
 * Returns null when SUPABASE_SECRET_KEY is not configured.
 */
export function createAdminClient() {
  const key = getServerEnv().SUPABASE_SECRET_KEY;
  if (!key) return null;
  return createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
