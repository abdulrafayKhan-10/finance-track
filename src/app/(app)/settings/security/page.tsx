import { ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import { PageHeader } from "@/components/app-shell/page-header";
import { ChangePasswordForm } from "@/components/settings/change-password-form";
import { RemoveFactor } from "@/components/settings/remove-factor";
import { TotpEnrollment } from "@/components/settings/totp-enrollment";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { createClient } from "@/data/supabase/server";
import { changePassword, removeTotpFactor, totpEnrollment } from "@/features/auth/actions";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Security" };

export default async function SecurityPage() {
  await requireUser();
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const verified = data?.totp.find((f) => f.status === "verified");

  return (
    <>
      <PageHeader title="Security" description="Password and two-factor authentication." />
      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Two-factor authentication</CardTitle>
            <CardDescription>
              Ask for a code from an authenticator app at every sign-in. Strongly recommended for financial data.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            {verified ? (
              <>
                <p className="flex items-center gap-2 text-sm">
                  <ShieldCheck className="size-4 text-positive" aria-hidden />
                  On since {new Date(verified.created_at).toLocaleDateString("en-GB", { timeZone: "Asia/Karachi" })}.
                </p>
                <RemoveFactor factorId={verified.id} action={removeTotpFactor} />
              </>
            ) : (
              <TotpEnrollment action={totpEnrollment} />
            )}
          </CardContent>
        </Card>

        <Card id="password">
          <CardHeader>
            <CardTitle>Password</CardTitle>
            <CardDescription>Change the password you use to sign in.</CardDescription>
          </CardHeader>
          <CardContent>
            <ChangePasswordForm action={changePassword} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
