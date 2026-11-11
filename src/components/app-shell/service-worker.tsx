"use client";

import { useEffect } from "react";

/** Registers /sw.js in production builds only (in development it would cache stale chunks). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Installing is optional: the app works the same without it.
    });
  }, []);
  return null;
}

/** Asks the service worker to drop its caches (on sign-out) and clears any left by older versions. */
export function clearAppCaches() {
  try {
    navigator.serviceWorker?.controller?.postMessage("clear-caches");
    if ("caches" in window) void caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k))));
  } catch {
    // Nothing to clear.
  }
}
