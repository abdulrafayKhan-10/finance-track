import type * as React from "react";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

export function SelectField({
  id,
  label,
  error,
  hint,
  children,
  ...props
}: { id: string; label: string; error?: string; hint?: string } & React.ComponentProps<typeof Select>) {
  const describedBy = [error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      <Select id={id} name={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...props}>
        {children}
      </Select>
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
