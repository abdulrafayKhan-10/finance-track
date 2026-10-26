"use client";

import { useActionState } from "react";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import type { ActionState } from "@/features/action-state";

export function NewCategoryForm({
  action,
  parents,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  /** Top-level categories that can hold subcategories. */
  parents: { id: string; name: string; kind: "income" | "expense" }[];
}) {
  const [state, formAction, pending] = useActionState(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form action={formAction} className="grid gap-4 rounded-xl border p-4" noValidate>
      <h2 className="font-medium">Add a category</h2>
      <FormMessage error={state.error} success={state.success} />
      <div className="grid gap-4 sm:grid-cols-3">
        <FormField id="name" label="Name" maxLength={60} required error={e.name} />
        <SelectField id="kind" label="Kind" defaultValue="expense" error={e.kind}>
          <option value="expense">Expense</option>
          <option value="income">Income</option>
        </SelectField>
        <SelectField
          id="parent_id"
          label="Inside (optional)"
          defaultValue=""
          error={e.parent_id}
          hint="A subcategory must have the same kind as its parent."
        >
          <option value="">Top level</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.kind})
            </option>
          ))}
        </SelectField>
      </div>
      <SubmitButton pending={pending} pendingLabel="Adding…" className="justify-self-start">
        Add category
      </SubmitButton>
    </form>
  );
}
