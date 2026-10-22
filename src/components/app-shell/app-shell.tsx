import Link from "next/link";
import { BottomNav, SidebarNav } from "./nav";
import { BRAND_ICON } from "./nav-items";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

export function AppShell({ email, children }: { email: string | null; children: React.ReactNode }) {
  const Brand = BRAND_ICON;
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-4 border-r bg-sidebar p-3 lg:flex">
        <Link href="/" className="flex items-center gap-2 px-3 py-2 font-semibold">
          <Brand className="size-5 text-primary" aria-hidden />
          Finance Track
        </Link>
        <SidebarNav />
        <div className="mt-auto grid gap-2 border-t pt-3">
          <div className="flex items-center justify-between px-3">
            <span className="text-xs text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          {email && <p className="truncate px-3 text-xs text-muted-foreground">{email}</p>}
          <SignOutButton />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b bg-background/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur lg:hidden">
          <Link href="/" className="flex h-14 items-center gap-2 font-semibold">
            <Brand className="size-5 text-primary" aria-hidden />
            Finance Track
          </Link>
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 pb-28 lg:px-8 lg:pb-10">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
