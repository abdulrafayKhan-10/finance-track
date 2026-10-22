"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/data/supabase/server";
import { requireUser } from "@/lib/auth";
import { getPublicEnv } from "@/lib/env/public";
import { safeNextPath } from "@/lib/safe-redirect";
import {
  emailSchema,
  factorIdSchema,
  fieldErrors,
  newPasswordSchema,
  signInSchema,
  totpCodeSchema,
  type FieldErrors,
} from "@/lib/validation/auth";

export type FormState = {
  error?: string;
  fieldErrors?: FieldErrors;
  success?: string;
};

// Messages never reveal whether an email is registered or why a check failed in detail.
const GENERIC_SIGN_IN_ERROR = "Email or password is incorrect.";
const GENERIC_ERROR = "Something went wrong. Please try again.";

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return {
      error: error.status === 429 ? "Too many attempts. Wait a few minutes and try again." : GENERIC_SIGN_IN_ERROR,
    };
  }

  const next = safeNextPath(formData.get("next"));
  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (aal?.nextLevel === "aal2" && aal.currentLevel !== "aal2") {
    redirect(`/login/mfa?next=${encodeURIComponent(next)}`);
  }
  redirect(next);
}

export async function verifyMfa(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = totpCodeSchema.safeParse({ code: formData.get("code") });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { error: GENERIC_ERROR };
  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/login");

  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code: parsed.data.code });
  if (error) return { fieldErrors: { code: "That code is not valid. Check your authenticator app and try again." } };

  redirect(safeNextPath(formData.get("next")));
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) return { fieldErrors: { email: parsed.error.issues[0]?.message } };

  const supabase = await createClient();
  const redirectTo = new URL("/auth/confirm?next=/settings/security", getPublicEnv().NEXT_PUBLIC_SITE_URL);
  // The result is deliberately ignored so the response is identical whether or not the account exists.
  await supabase.auth.resetPasswordForEmail(parsed.data, { redirectTo: redirectTo.toString() });
  return { success: "If that email belongs to an account, a reset link is on its way." };
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}

export async function changePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireUser();
  const parsed = newPasswordSchema.safeParse({
    password: formData.get("password"),
    confirm: formData.get("confirm"),
  });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "weak_password")
      return { fieldErrors: { password: "That password is too weak or has appeared in a data breach." } };
    if (error.code === "same_password")
      return { fieldErrors: { password: "Choose a password you have not used here before." } };
    if (error.code === "reauthentication_needed")
      return { error: "For security, sign out and sign in again before changing your password." };
    return { error: GENERIC_ERROR };
  }
  return { success: "Password updated." };
}

export type EnrollState = FormState & { factorId?: string; qrCode?: string; secret?: string };

/** One action drives the two enrolment steps so the QR code survives between them. */
export async function totpEnrollment(prev: EnrollState, formData: FormData): Promise<EnrollState> {
  await requireUser();
  return formData.get("intent") === "start" ? startTotpEnrollment() : confirmTotpEnrollment(prev, formData);
}

async function startTotpEnrollment(): Promise<EnrollState> {
  const supabase = await createClient();

  // Abandoned enrolments leave unverified factors behind; clear them first.
  const { data: existing } = await supabase.auth.mfa.listFactors();
  for (const f of existing?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    friendlyName: `Authenticator ${new Date().toISOString().slice(0, 10)}`,
  });
  if (error || !data) return { error: GENERIC_ERROR };
  return { factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

async function confirmTotpEnrollment(prev: EnrollState, formData: FormData): Promise<EnrollState> {
  const factorId = factorIdSchema.safeParse(formData.get("factorId"));
  const code = totpCodeSchema.safeParse({ code: formData.get("code") });
  const keep = { factorId: prev.factorId, qrCode: prev.qrCode, secret: prev.secret };
  if (!factorId.success) return { error: GENERIC_ERROR };
  if (!code.success) return { ...keep, fieldErrors: fieldErrors(code.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factorId.data, code: code.data.code });
  if (error) return { ...keep, fieldErrors: { code: "That code is not valid. Try the newest code shown in the app." } };

  revalidatePath("/settings/security");
  return { success: "Two-factor authentication is now on. You will be asked for a code each time you sign in." };
}

export async function removeTotpFactor(_prev: FormState, formData: FormData): Promise<FormState> {
  const user = await requireUser();
  const factorId = factorIdSchema.safeParse(formData.get("factorId"));
  if (!factorId.success) return { error: GENERIC_ERROR };
  if (user.aal !== "aal2") return { error: "Verify with your authenticator app before removing it." };

  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.unenroll({ factorId: factorId.data });
  if (error) return { error: GENERIC_ERROR };
  revalidatePath("/settings/security");
  return { success: "Two-factor authentication has been turned off." };
}
