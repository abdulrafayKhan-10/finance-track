"use client";

import { useActionState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionState } from "@/features/action-state";

/**
 * A small inline form around a server action: hidden fields, optional
 * inputs as children, one submit button, and its outcome message.
 */
export function ActionForm({
  action,
  fields = {},
  submitLabel,
  pendingLabel = "Saving…",
  variant = "default",
  className,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields?: Record<string, string>;
  submitLabel: string;
  pendingLabel?: string;
  variant?: "default" | "secondary" | "outline" | "ghost";
  className?: string;
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "grid gap-3"} noValidate>
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton pending={pending} pendingLabel={pendingLabel} variant={variant}>
          {submitLabel}
        </SubmitButton>
      </div>
      <FormMessage error={state.error ?? Object.values(state.fieldErrors ?? {})[0]} success={state.success} />
    </form>
  );
}
