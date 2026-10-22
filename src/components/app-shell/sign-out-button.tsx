import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/features/auth/actions";

export function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOut} className={className}>
      <Button type="submit" variant="ghost" className="w-full justify-start gap-3 text-muted-foreground">
        <LogOut aria-hidden />
        Sign out
      </Button>
    </form>
  );
}
