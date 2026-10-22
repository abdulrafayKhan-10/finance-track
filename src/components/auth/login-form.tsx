"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { FormState } from "@/features/auth/actions";

export function LoginForm({
  action,
  next,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled so React's automatic form reset after a failed attempt keeps the email.
  const [email, setEmail] = useState("");
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormMessage error={state.error} />
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        inputMode="email"
        required
        error={state.fieldErrors?.email}
      />
      <FormField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password}
      />
      <SubmitButton pending={pending} pendingLabel="Signing in…" className="w-full">
        Sign in
      </SubmitButton>
      <Link
        href="/login/forgot"
        className="justify-self-center text-sm text-primary underline-offset-4 hover:underline"
      >
        Forgot your password?
      </Link>
    </form>
  );
}
