"use client";

import { CheckboxField } from "@/components/forms/checkbox-field";
import { FormField } from "@/components/forms/form-field";
import { FormMessage } from "@/components/forms/form-message";
import { SelectField } from "@/components/forms/select-field";
import { SubmitButton } from "@/components/forms/submit-button";
import { useActionForm } from "@/components/forms/use-action-form";
import type { ActionState } from "@/features/action-state";

export function CategoryEditForm({
  action,
  category,
  parents,
  hasChildren,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  category: { id: string; name: string; parentId: string | null; isArchived: boolean };
  parents: { id: string; name: string }[];
  hasChildren: boolean;
}) {
  const [state, onSubmit, pending] = useActionForm(action, {});
  const e = state.fieldErrors ?? {};
  return (
    <form onSubmit={onSubmit} className="grid max-w-xl gap-4" noValidate>
      <input type="hidden" name="id" value={category.id} />
      <FormMessage error={state.error} success={state.success} />
      <FormField id="name" label="Name" defaultValue={category.name} maxLength={60} required error={e.name} />
      {hasChildren ? (
        <p className="text-sm text-muted-foreground">This category has subcategories, so it stays at the top level.</p>
      ) : (
        <SelectField id="parent_id" label="Inside" defaultValue={category.parentId ?? ""} error={e.parent_id}>
          <option value="">Top level</option>
          {parents.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </SelectField>
      )}
      <CheckboxField
        id="is_archived"
        label="Archived"
        defaultChecked={category.isArchived}
        hint="Archived categories keep their history but are hidden when adding transactions."
      />
      <SubmitButton pending={pending} pendingLabel="Saving…" className="justify-self-start">
        Save
      </SubmitButton>
    </form>
  );
}
