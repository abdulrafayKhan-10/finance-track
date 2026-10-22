import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/auth/login-form";
import { FormMessage } from "@/components/forms/form-message";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { signIn } from "@/features/auth/actions";
import { getCurrentUser } from "@/lib/auth";
import { safeNextPath } from "@/lib/safe-redirect";

export const metadata: Metadata = { title: "Sign in" };

const LINK_ERROR = "That link is invalid or has expired. Request a new one.";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const user = await getCurrentUser();
  if (user) redirect(user.mfaRequired && user.aal !== "aal2" ? `/login/mfa?next=${encodeURIComponent(next)}` : next);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Your private finance records.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {params.error === "link" && <FormMessage error={LINK_ERROR} />}
        <LoginForm action={signIn} next={next} />
      </CardContent>
    </Card>
  );
}
