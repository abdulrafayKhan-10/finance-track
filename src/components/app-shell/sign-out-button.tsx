"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { cn } from "@/lib/utils";
import { clearAppCaches } from "./service-worker";

export function SignOutButton({ className, tone = "paper" }: { className?: string; tone?: "paper" | "ink" }) {
  return (
    <form action={signOut} onSubmit={clearAppCaches} className={className}>
      <Button
        type="submit"
        variant="ghost"
        className={cn(
          "w-full justify-start gap-3",
          tone === "ink"
            ? "text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground"
            : "text-muted-foreground",
        )}
      >
        <LogOut aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
