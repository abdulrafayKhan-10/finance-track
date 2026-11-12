import { Wallet } from "lucide-react";
import { Guilloche } from "@/components/figures/guilloche";

/** Sign-in and recovery: an ink panel with the engraved pattern beside a quiet paper form. */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative isolate flex flex-col justify-between overflow-hidden bg-note px-6 pt-[calc(env(safe-area-inset-top)+1.5rem)] pb-8 text-sidebar-foreground lg:px-12 lg:py-12">
        <Guilloche className="absolute inset-x-0 bottom-0 -z-10 h-48 w-full lg:h-72" />
        <div className="flex items-center gap-2.5 font-display text-lg font-semibold tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-brass/90 text-sidebar">
            <Wallet className="size-5" aria-hidden />
          </span>
          Finance Track
        </div>
        <p className="mt-10 max-w-sm font-display text-2xl leading-snug font-medium tracking-tight text-balance lg:text-[2rem]">
          Every rupee you hold, owe and invest, in one private ledger.
        </p>
      </div>
      <main className="flex items-start justify-center px-4 py-10 lg:items-center lg:py-16">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
