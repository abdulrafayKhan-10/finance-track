import "server-only";
import { createClient } from "@/data/supabase/server";

/** The verified authenticator-app factor, if two-factor authentication is on. */
export async function getVerifiedTotpFactor(): Promise<{ id: string; createdAt: string } | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp.find((f) => f.status === "verified");
  return verified ? { id: verified.id, createdAt: verified.created_at } : null;
}
