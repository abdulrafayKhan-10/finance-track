import type * as React from "react";

export function CheckboxField({
  id,
  label,
  hint,
  ...props
}: { id: string; label: string; hint?: string } & Omit<React.ComponentProps<"input">, "type">) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        name={id}
        type="checkbox"
        aria-describedby={hint ? `${id}-hint` : undefined}
        className="mt-0.5 size-5 shrink-0 rounded border-input accent-[var(--primary)] md:size-4"
        {...props}
      />
      <div className="grid gap-0.5">
        <label htmlFor={id} className="text-sm leading-tight font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${id}-hint`} className="text-xs text-muted-foreground">
            {hint}
          </p>
        )}
      </div>
    </div>
  );
}
