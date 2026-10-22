"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/features/auth/actions";

/** Two-step confirmation before weakening account security. */
export function RemoveFactor({
  factorId,
  action,
}: {
  factorId: string;
  action: (state: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const [confirming, setConfirming] = useState(false);

  if (state.success) return <FormMessage success={state.success} />;
  if (!confirming) {
    return (
      <Button type="button" variant="outline" className="justify-self-start" onClick={() => setConfirming(true)}>
        Turn off two-factor authentication
      </Button>
    );
  }
  return (
    <form action={formAction} className="grid gap-3 rounded-lg border border-destructive/40 p-4">
      <FormMessage error={state.error} />
      <p className="text-sm">
        Turning this off means a stolen password alone is enough to open your financial records. Continue?
      </p>
      <input type="hidden" name="factorId" value={factorId} />
      <div className="flex flex-wrap gap-2">
        <SubmitButton pending={pending} pendingLabel="Turning off…" variant="destructive">
          Yes, turn it off
        </SubmitButton>
        <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
