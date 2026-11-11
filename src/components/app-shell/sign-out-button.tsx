"use client";

import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";
import { clearAppCaches } from "./service-worker";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut} onSubmit={clearAppCaches} className={className}>
      <Button type="submit" variant="ghost" className="w-full justify-start gap-3 text-muted-foreground">
        <LogOut aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
