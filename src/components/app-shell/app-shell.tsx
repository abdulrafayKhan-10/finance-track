import Link from "next/link";
import { BottomNav, SidebarNav } from "./nav";
import { BRAND_ICON } from "./nav-items";
import { SignOutButton } from "./sign-out-button";
import { ThemeToggle } from "./theme-toggle";

function Brand() {
  const Icon = BRAND_ICON;
  return (
    <Link
      href="/"
      className="flex items-center gap-2.5 rounded-md font-display text-[1.05rem] font-semibold tracking-tight"
    >
      <span className="grid size-8 place-items-center rounded-lg bg-brass/90 text-sidebar">
        <Icon className="size-[1.1rem]" aria-hidden />
      </span>
      Finance Track
    </Link>
  );
}

/**
 * Desktop: a deep-ink sidebar beside paper content. Mobile: an ink top bar
 * (it meets the status bar, which uses the same colour) and a bottom nav.
 */
export function AppShell({ email, children }: { email: string | null; children: React.ReactNode }) {
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col gap-6 bg-sidebar px-4 py-5 text-sidebar-foreground lg:flex">
        <div className="px-2">
          <Brand />
        </div>
        <SidebarNav />
        <div className="mt-auto grid gap-3 border-t border-sidebar-border pt-4">
          <div className="flex items-center justify-between px-2">
            <span className="text-xs text-sidebar-muted">Theme</span>
            <ThemeToggle tone="ink" />
          </div>
          {email && <p className="truncate px-2 text-xs text-sidebar-muted">{email}</p>}
          <SignOutButton tone="ink" />
        </div>
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 bg-sidebar px-4 pt-[env(safe-area-inset-top)] text-sidebar-foreground lg:hidden">
          <div className="flex h-14 items-center">
            <Brand />
          </div>
          <ThemeToggle tone="ink" />
        </header>
        <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 pt-6 pb-28 sm:px-6 lg:px-10 lg:pt-10 lg:pb-12">
          {children}
        </main>
      </div>

      <BottomNav />
    </div>
  );
}
