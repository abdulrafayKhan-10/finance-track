import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Native <select>, styled. Native controls give the best keyboard, screen
 * reader and mobile picker behaviour for plain option lists.
 */
function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "flex h-11 w-full min-w-0 rounded-md border border-input bg-background px-3 py-1 text-base shadow-xs outline-none disabled:cursor-not-allowed disabled:opacity-50 md:h-9 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
