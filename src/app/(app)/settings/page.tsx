import { ChevronRight, ShieldCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        <div className="grid divide-y overflow-hidden rounded-xl border">
          <Link href="/settings/security" className="flex items-center gap-3 p-4 hover:bg-accent">
            <ShieldCheck className="size-5 text-muted-foreground" aria-hidden />
            <span className="grid flex-1 gap-0.5">
              <span className="font-medium">Security</span>
              <span className="text-sm text-muted-foreground">Password and two-factor authentication</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="font-medium">Theme</span>
            <ThemeToggle />
          </div>
        </div>
        <NotBuiltYet
          phase={3}
          features={[
            "Profile, reporting currency and timezone",
            "Categories (Phase 3) and exchange rates (Phase 4)",
            "Data export, backup, restore and account deletion (Phase 6)",
          ]}
        />
      </div>
    </>
  );
}
