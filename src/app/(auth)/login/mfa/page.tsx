import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MfaForm } from "@/components/auth/mfa-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signOut, verifyMfa } from "@/features/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Two-factor verification" };

export default async function MfaPage({ searchParams }: PageProps<"/login/mfa">) {
  const next = safeNextPath((await searchParams).next);
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.mfaRequired || user.aal === "aal2") redirect(next);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Two-factor verification</CardTitle>
        <CardDescription>Enter the code from your authenticator app.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <MfaForm action={verifyMfa} next={next} />
        <form action={signOut}>
          <Button type="submit" variant="ghost" className="w-full">
            Use a different account
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
