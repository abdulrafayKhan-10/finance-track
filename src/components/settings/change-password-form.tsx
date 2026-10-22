"use client";

import { useActionState } from "react";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { FormState } from "@/features/auth/actions";

export function ChangePasswordForm({
  action,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid max-w-sm gap-4" noValidate>
      <FormMessage error={state.error} success={state.success} />
      <FormField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        hint="At least 12 characters. A passphrase of several words works well."
        required
        error={state.fieldErrors?.password}
      />
      <FormField
        id="confirm"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.confirm}
      />
      <SubmitButton pending={pending} pendingLabel="Updating…" className="justify-self-start">
        Update password
      </SubmitButton>
    </form>
  );
}
