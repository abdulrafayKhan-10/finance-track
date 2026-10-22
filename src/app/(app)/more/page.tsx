import { ChevronRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { NAV_ITEMS } from "@/components/app-shell/nav-items";
import { PageHeader } from "@/components/app-shell/page-header";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { requireUser } from "@/lib/auth";

export const metadata: Metadata = { title: "More" };

/** Mobile overflow menu: every module, plus sign-out. */
export default async function MorePage() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="More" description={user.email ?? undefined} />
      <nav aria-label="All modules" className="grid divide-y overflow-hidden rounded-xl border">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className="flex min-h-12 items-center gap-3 px-4 hover:bg-accent">
            <Icon className="size-5 text-muted-foreground" aria-hidden />
            <span className="flex-1">{label}</span>
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ))}
      </nav>
      <SignOutButton className="mt-6" />
    </>
  );
}
