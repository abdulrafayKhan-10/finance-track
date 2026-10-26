"use client";

import { useState } from "react";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CURRENCY_CODES } from "@/domain/money/currencies";
import type { ActionState } from "@/features/action-state";
import type { AccountOption } from "@/features/accounts/queries";

export type GoalFormValues = {
  id?: string;
  name: string;
  description: string;
  target_amount: string;
  currency: string;
  target_date: string;
  funding_mode: "linked_account" | "allocations";
  linked_account_id: string;
};

export function GoalForm({
  action,
  initial,
  accounts,
  locked,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: GoalFormValues;
  /** Asset accounts a goal can follow. */
  accounts: AccountOption[];
  /** True once allocations exist: mode and currency are fixed. */
  locked: boolean;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const [mode, setMode] = useState(initial.funding_mode);
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-5" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <FormMessage error={state.error} />
      <FormField id="name" label="Name" defaultValue={initial.name} maxLength={100} required error={e.name} />
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="target_amount"
          label="Target amount"
          inputMode="decimal"
          defaultValue={initial.target_amount}
          error={e.target_amount}
        />
        {locked ? (
          <>
            <input type="hidden" name="currency" value={initial.currency} />
            <FormField
              id="currency_display"
              label="Currency"
              value={initial.currency}
              readOnly
              disabled
              hint="Fixed once money is allocated."
            />
          </>
        ) : (
          <SelectField id="currency" label="Currency" defaultValue={initial.currency} error={e.currency}>
            {CURRENCY_CODES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </SelectField>
        )}
      </div>
      <FormField
        id="target_date"
        label="Target date (optional)"
        type="date"
        defaultValue={initial.target_date}
        error={e.target_date}
      />
      <fieldset className="grid gap-2">
        <legend className="mb-1 text-sm font-medium">How is progress measured?</legend>
        {locked && <input type="hidden" name="funding_mode" value={initial.funding_mode} />}
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="funding_mode"
            value="allocations"
            checked={mode === "allocations"}
            onChange={() => setMode("allocations")}
            disabled={locked}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">Allocations</span>
            <span className="block text-xs text-muted-foreground">
              You earmark amounts from your accounts. Earmarks don&rsquo;t move money or change net worth.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input
            type="radio"
            name="funding_mode"
            value="linked_account"
            checked={mode === "linked_account"}
            onChange={() => setMode("linked_account")}
            disabled={locked}
            className="mt-0.5 size-4 accent-[var(--primary)]"
          />
          <span>
            <span className="font-medium">A dedicated account</span>
            <span className="block text-xs text-muted-foreground">
              Progress is that account&rsquo;s balance, e.g. a separate savings account.
            </span>
          </span>
        </label>
      </fieldset>
      {mode === "linked_account" && (
        <SelectField
          id="linked_account_id"
          label="Account"
          defaultValue={initial.linked_account_id}
          error={e.linked_account_id}
        >
          <option value="">Choose an account</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} ({a.currency})
            </option>
          ))}
        </SelectField>
      )}
      <div className="grid gap-2">
        <Label htmlFor="description">Description (optional)</Label>
        <Textarea id="description" name="description" defaultValue={initial.description} maxLength={1000} />
      </div>
      <SubmitButton pending={pending} pendingLabel="Saving…" className="justify-self-start">
        {initial.id ? "Save goal" : "Create goal"}
      </SubmitButton>
    </form>
  );
}
