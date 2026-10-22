"use client";

import { CircleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Safe error state for app pages: generic message, retry, no error details rendered. */
export default function AppError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border p-6">
      <div className="flex items-center gap-2 font-medium">
        <CircleAlert className="size-5 text-destructive" aria-hidden />
        This page could not be loaded.
      </div>
      <p className="text-sm text-muted-foreground">Check your connection and try again. No changes were saved.</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
