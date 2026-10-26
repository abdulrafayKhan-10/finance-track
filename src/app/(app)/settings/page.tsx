import { ChevronRight, ShieldCheck, Tags, UserRound } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NotBuiltYet } from "@/components/app-shell/not-built-yet";
import { PageHeader } from "@/components/app-shell/page-header";
import { ThemeToggle } from "@/components/app-shell/theme-toggle";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Settings" };

const LINKS = [
  { href: "/settings/profile", icon: UserRound, title: "Profile", text: "Reporting currency and timezone" },
  { href: "/settings/categories", icon: Tags, title: "Categories", text: "Income and expense categories" },
  { href: "/settings/security", icon: ShieldCheck, title: "Security", text: "Password and two-factor authentication" },
];

export default async function SettingsPage() {
  await requireUser();
  return (
    <>
      <PageHeader title="Settings" />
      <div className="grid gap-6">
        <div className="grid divide-y overflow-hidden rounded-xl border">
          {LINKS.map(({ href, icon: Icon, title, text }) => (
            <Link key={href} href={href} className="flex items-center gap-3 p-4 hover:bg-accent">
              <Icon className="size-5 text-muted-foreground" aria-hidden />
              <span className="grid flex-1 gap-0.5">
                <span className="font-medium">{title}</span>
                <span className="text-sm text-muted-foreground">{text}</span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          ))}
          <div className="flex items-center justify-between gap-3 p-4">
            <span className="font-medium">Theme</span>
            <ThemeToggle />
          </div>
        </div>
        <NotBuiltYet
          phase={4}
          features={["Exchange rates (Phase 4)", "Data export, backup, restore and account deletion (Phase 6)"]}
        />
      </div>
    </>
  );
}
