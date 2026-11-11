import { WifiOff } from "lucide-react";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Offline" };

/** Shown by the service worker when a page can't load. Static: it contains no personal data. */
export default function OfflinePage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 px-4 text-center">
      <WifiOff className="size-10 text-muted-foreground" aria-hidden />
      <h1 className="text-xl font-semibold">You’re offline</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        Finance Track needs a connection to load your data. Nothing is stored on this device, so reconnect and try
        again.
      </p>
      {/* A full reload on purpose: client-side navigation can't work without a connection. */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a href="/" className="text-sm text-primary underline">
        Try again
      </a>
    </main>
  );
}
