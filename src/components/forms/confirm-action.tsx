"use client";

import { useActionState, useState } from "react";
import { FormMessage } from "@/components/forms/form-message";
import { SubmitButton } from "@/components/forms/submit-button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/features/action-state";

/**
 * A button that opens a confirmation dialog naming what will happen, then
 * runs a server action with the given hidden fields. Errors stay in the dialog.
 */
export function ConfirmAction({
  action,
  fields,
  triggerLabel,
  title,
  description,
  confirmLabel,
  destructive = true,
  children,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  fields: Record<string, string>;
  triggerLabel: string;
  title: string;
  description: React.ReactNode;
  confirmLabel: string;
  destructive?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>
        <Button
          type="button"
          variant={destructive ? "outline" : "secondary"}
          className={destructive ? "text-destructive" : undefined}
        >
          {triggerLabel}
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription asChild>
          <div>{description}</div>
        </AlertDialogDescription>
        <form action={formAction} className="grid gap-4">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          {children}
          <FormMessage error={state.error} />
          <div className="flex flex-wrap justify-end gap-2">
            <AlertDialogCancel type="button">Cancel</AlertDialogCancel>
            <SubmitButton pending={pending} pendingLabel="Working…" variant={destructive ? "destructive" : "default"}>
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </AlertDialogContent>
    </AlertDialog>
  );
}
