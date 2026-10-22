import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/data/supabase/proxy-session";
import { getPublicEnv } from "@/lib/env/public";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_PATHS = ["/login", "/login/forgot", "/auth/confirm", "/offline"];

function isPublic(pathname: string) {
  return PUBLIC_PATHS.includes(pathname);
}

function contentSecurityPolicy(nonce: string) {
  const isDev = process.env.NODE_ENV === "development";
  const supabase = new URL(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL).origin;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    // Inline style attributes are used by UI primitives for positioning; no inline scripts are allowed.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${supabase}${isDev ? " ws: wss:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "manifest-src 'self'",
    "worker-src 'self'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export async function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);

  const forwardHeaders = new Headers(request.headers);
  forwardHeaders.set("x-nonce", nonce);
  forwardHeaders.set("Content-Security-Policy", csp);

  const { response, isSignedIn } = await updateSession(request, forwardHeaders);
  const { pathname, search } = request.nextUrl;

  let result: NextResponse = response;
  if (!isSignedIn && !isPublic(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
    result = NextResponse.redirect(url);
    // Keep any cookie changes (e.g. a cleared, expired session).
    for (const cookie of response.cookies.getAll()) result.cookies.set(cookie);
  }

  result.headers.set("Content-Security-Policy", csp);
  // Pages render private financial data: never store them in any cache.
  result.headers.set("Cache-Control", "private, no-store, max-age=0");
  return result;
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image|favicon.ico|icons/|robots.txt|manifest.webmanifest|sw.js).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
