import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/data/supabase/server";
import { decodeJwtPayload } from "@/lib/jwt";

export type CurrentUser = {
  id: string;
  email: string | null;
  /** Assurance level of this session's token. */
  aal: "aal1" | "aal2";
  /** True when the user has a verified MFA factor, so aal2 is required. */
  mfaRequired: boolean;
};

function decodeAal(accessToken: string): "aal1" | "aal2" {
  return decodeJwtPayload(accessToken)?.aal === "aal2" ? "aal2" : "aal1";
}

/**
 * Data Access Layer entry point: the verified user for this request, or null.
 * `getUser()` validates the access token with Supabase Auth, so a forged or
 * revoked cookie is rejected. Cached per request.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const supabase = await createClient();
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) return null;

  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return null;

  return {
    id: data.user.id,
    email: data.user.email ?? null,
    aal: decodeAal(token),
    mfaRequired: (data.user.factors ?? []).some((f) => f.status === "verified"),
  };
});

/** For pages and actions that need a fully authenticated user (MFA satisfied). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mfaRequired && user.aal !== "aal2") redirect("/login/mfa");
  return user;
}
