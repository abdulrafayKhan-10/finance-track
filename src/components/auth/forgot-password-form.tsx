"use client";

import { useActionState, useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { FormState } from "@/features/auth/actions";

export function ForgotPasswordForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  // Controlled so React's automatic form reset after a failed attempt keeps the email.
  const [email, setEmail] = useState("");
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <FormMessage error={state.error} success={state.success} />
      <FormField
        id="email"
        label="Email"
        type="email"
        autoComplete="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        required
        error={state.fieldErrors?.email}
      />
      <SubmitButton pending={pending} pendingLabel="Sending…" className="w-full">
        Send reset link
      </SubmitButton>
    </form>
  );
}
