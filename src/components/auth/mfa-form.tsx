"use client";

import { useActionState } from "react";
import { FormField } from "@/components/forms/form-field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { FormState } from "@/features/auth/actions";

export function MfaForm({
  action,
  next,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  next: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-4" noValidate>
      <input type="hidden" name="next" value={next} />
      <FormField
        id="code"
        label="6-digit code"
        inputMode="numeric"
        autoComplete="one-time-code"
        pattern="\d{6}"
        maxLength={6}
        required
        autoFocus
        error={state.fieldErrors?.code ?? state.error}
      />
      <SubmitButton pending={pending} pendingLabel="Verifying…" className="w-full">
        Verify
      </SubmitButton>
    </form>
  );
}
