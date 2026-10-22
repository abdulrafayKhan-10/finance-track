"use client";

import { LoaderCircle } from "lucide-react";
import type * as React from "react";
import { Button } from "@/components/ui/button";

export function SubmitButton({
  pending,
  pendingLabel,
  children,
  ...props
}: { pending: boolean; pendingLabel: string } & React.ComponentProps<typeof Button>) {
  return (
    <Button type="submit" disabled={pending} aria-disabled={pending} {...props}>
      {pending && <LoaderCircle className="animate-spin" aria-hidden />}
      {pending ? pendingLabel : children}
    </Button>
  );
}
