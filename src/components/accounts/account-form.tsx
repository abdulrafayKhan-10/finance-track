"use client";

import { useState } from "react";
import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ACCOUNT_TYPES, type AccountType, classOf } from "@/domain/ledger/types";
import { CURRENCIES, CURRENCY_CODES } from "@/domain/money/currencies";
import type { ActionState } from "@/features/action-state";
import { ACCOUNT_TYPE_LABELS } from "@/lib/labels";

export type AccountFormValues = {
  id?: string;
  name: string;
  type: AccountType;
  currency: string;
  /** As displayed: amount owed for liabilities. */
  opening_balance: string;
  opening_date: string;
  institution: string;
  notes: string;
  include_in_net_worth: boolean;
  is_liquid: boolean;
  status: "active" | "closed" | "archived";
};

const LIQUID_BY_DEFAULT: AccountType[] = ["cash", "bank", "digital_wallet", "savings"];

export function AccountForm({
  action,
  initial,
  hasTransactions,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  initial: AccountFormValues;
  /** Currency, asset/liability type and a later opening date are locked once transactions exist. */
  hasTransactions: boolean;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const [type, setType] = useState<AccountType>(initial.type);
  const [liquid, setLiquid] = useState(initial.is_liquid);
  const liability = classOf(type) === "liability";
  const lockedClass = hasTransactions ? classOf(initial.type) : null;
  const e = state.fieldErrors ?? {};

  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-5" noValidate>
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <FormMessage error={state.error} />
      <FormField id="name" label="Name" defaultValue={initial.name} required maxLength={100} error={e.name} />
      <SelectField
        id="type"
        label="Type"
        value={type}
        onChange={(ev) => {
          const next = ev.target.value as AccountType;
          setType(next);
          if (!initial.id) setLiquid(LIQUID_BY_DEFAULT.includes(next));
        }}
        error={e.type}
        hint={lockedClass ? "Existing transactions fix whether this is an asset or a liability." : undefined}
      >
        {ACCOUNT_TYPES.filter((t) => !lockedClass || classOf(t) === lockedClass).map((t) => (
          <option key={t} value={t}>
            {ACCOUNT_TYPE_LABELS[t]}
          </option>
        ))}
      </SelectField>
      {hasTransactions ? (
        <>
          <input type="hidden" name="currency" value={initial.currency} />
          <FormField
            id="currency_display"
            label="Currency"
            value={initial.currency}
            disabled
            readOnly
            hint="Fixed because the account has transactions."
          />
        </>
      ) : (
        <SelectField id="currency" label="Currency" defaultValue={initial.currency} error={e.currency}>
          {CURRENCY_CODES.map((c) => (
            <option key={c} value={c}>
              {c} · {CURRENCIES[c].name}
            </option>
          ))}
        </SelectField>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField
          id="opening_balance"
          label={liability ? "Amount owed at opening" : "Opening balance"}
          inputMode="decimal"
          defaultValue={initial.opening_balance}
          error={e.opening_balance}
          hint={liability ? "Enter what you owed on the opening date." : "Use a minus sign for an overdrawn account."}
        />
        <FormField
          id="opening_date"
          label="Opening date"
          type="date"
          defaultValue={initial.opening_date}
          required
          error={e.opening_date}
        />
      </div>
      <FormField
        id="institution"
        label="Institution (optional)"
        defaultValue={initial.institution}
        maxLength={100}
        error={e.institution}
        hint="A label only. Never enter login details, card numbers or PINs."
      />
      <div className="grid gap-2">
        <Label htmlFor="notes">Notes (optional)</Label>
        <Textarea id="notes" name="notes" defaultValue={initial.notes} maxLength={2000} />
      </div>
      <CheckboxField
        id="include_in_net_worth"
        label="Include in net worth"
        defaultChecked={initial.include_in_net_worth}
      />
      <CheckboxField
        id="is_liquid"
        label="Liquid (cash you can spend now)"
        checked={liquid}
        onChange={(ev) => setLiquid(ev.target.checked)}
        hint="Counts towards “liquid cash and bank balances” on the dashboard."
      />
      {initial.id && (
        <SelectField
          id="status"
          label="Status"
          defaultValue={initial.status}
          hint="Archived accounts are hidden and can't receive new transactions."
        >
          <option value="active">Active</option>
          <option value="closed">Closed (kept in history, still usable)</option>
          <option value="archived">Archived</option>
        </SelectField>
      )}
      <SubmitButton pending={pending} pendingLabel="Saving…" className="justify-self-start">
        {initial.id ? "Save account" : "Create account"}
      </SubmitButton>
    </form>
  );
}
