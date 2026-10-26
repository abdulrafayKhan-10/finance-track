"use client";

import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { CURRENCIES, CURRENCY_CODES } from "@/domain/money/currencies";
import type { ActionState } from "@/features/action-state";

export function ProfileForm({
  action,
  initial,
  timezones,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: { display_name: string; base_currency: string; timezone: string };
  timezones: string[];
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <FormMessage error={state.error} success={state.success} />
      <FormField
        id="display_name"
        label="Display name (optional)"
        defaultValue={initial.display_name}
        maxLength={100}
        error={e.display_name}
      />
      <SelectField
        id="base_currency"
        label="Reporting currency"
        defaultValue={initial.base_currency}
        error={e.base_currency}
        hint="Totals across currencies are converted into this one, using your own dated exchange rates (Settings → Exchange rates)."
      >
        {CURRENCY_CODES.map((c) => (
          <option key={c} value={c}>
            {c} · {CURRENCIES[c].name}
          </option>
        ))}
      </SelectField>
      <SelectField
        id="timezone"
        label="Timezone"
        defaultValue={initial.timezone}
        error={e.timezone}
        hint="Decides what “today” means for new transactions and where months begin and end."
      >
        {timezones.map((tz) => (
          <option key={tz} value={tz}>
            {tz}
          </option>
        ))}
      </SelectField>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="justify-self-start">
        Save profile
      </SubmitButton>
    </form>
  );
}
