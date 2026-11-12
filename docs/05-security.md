# 5. Security threat model and checklist

## 5.1 Assets to protect

The user's financial records, the user's session, Supabase keys, and the integrity of the figures (a wrong balance is a security failure too).

## 5.2 Threats and mitigations

| Threat                                          | Mitigation                                                                                                                                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Another signed-in user reads or changes my rows | RLS forced on every table; composite ownership FKs; RPCs are `SECURITY INVOKER`; cross-user test suite                                                                                                                           |
| Anonymous access through the public anon key    | `anon` has no table grants; public sign-up is disabled after the owner registers                                                                                                                                                 |
| Service-role key leaks to the browser           | Kept only in a server-only module (`import 'server-only'`); env validation rejects any `NEXT_PUBLIC_*SERVICE*` value; a build check greps the client bundle for the key                                                          |
| Stolen password                                 | Strong password policy, TOTP MFA (aal2 required for app routes once enrolled), Supabase's built-in rate limiting, leaked-password protection where the plan offers it                                                            |
| Session theft or XSS                            | HttpOnly, Secure, SameSite=Lax cookies via `@supabase/ssr`; React escaping; no `dangerouslySetInnerHTML`; strict CSP with nonces; `X-Frame-Options: DENY`; `Referrer-Policy: same-origin`; HSTS                                  |
| CSRF on server actions                          | Next.js server actions check the Origin header; there are no GET routes with side effects                                                                                                                                        |
| Malicious CSV (formula injection)               | Exported cells beginning with `= + - @ \t \r` are prefixed with `'`; imports are parsed as data only, with a size and row limit                                                                                                  |
| SQL injection in RPCs                           | Parameterized PL/pgSQL only; `search_path = ''`; no dynamic SQL built from user input                                                                                                                                            |
| Over-broad error messages                       | Coded errors mapped to generic messages; no record contents or stack traces sent to the client; server logs exclude amounts and descriptions                                                                                     |
| Service worker caches private data              | The service worker caches only hashed static assets and the offline page; HTML, `/api`, server actions and Supabase calls are network-only; `Cache-Control: no-store` on authenticated responses; caches are cleared on sign-out |
| Data leaving to third parties                   | No analytics, telemetry, error SaaS or AI services. Vercel Analytics and Speed Insights are disabled. Fonts are self-hosted via `next/font`                                                                                      |
| Data loss                                       | Atomic RPCs; audit history; tested export and restore; documented free-tier backup gap                                                                                                                                           |
| Dev/prod mix-up                                 | Separate Supabase projects and env files; seed scripts refuse to run when the URL is the production URL                                                                                                                          |

## 5.3 Checklist (re-verified in Phase 7)

Items ticked in Phase 2 are covered by automated tests that run in CI. Cross-user tests cover every table that exists so far; RPCs are added to them as they are built.

- [x] RLS enabled **and forced** on every user table (an automated SQL test lists the tables without it, and the list must be empty) — `tests/db/schema-security.test.ts`
- [x] Every policy uses `(select auth.uid())`; no `using (true)` except read-only reference data (`currencies`) — `tests/db/schema-security.test.ts`
- [x] `anon` role: zero privileges on public tables and functions — `tests/db/schema-security.test.ts`
- [x] Cross-user tests: user B cannot select, insert, update or delete A's rows in any table, or by calling any RPC with A's ids — `tests/db/isolation.test.ts`, `tests/db/ledger-rpcs.test.ts`, `tests/db/investments.test.ts`, `tests/db/imports-backup.test.ts`, and against the real dev project through the public API (`e2e/isolation.spec.ts`)
- [x] Composite FKs reject a line that points at another user's account even when RLS is bypassed — `tests/db/isolation.test.ts`
- [x] Service-role key absent from the client bundle (`pnpm check:bundle`, run in CI)
- [x] Env validation fails fast on a missing or invalid variable (unit tests, plus a manual `next start` without env, which refused to start)
- [ ] Public sign-ups disabled in production; the redirect URL allow-list contains only the production and local URLs — checked by `e2e/auth-settings.spec.ts`. **2026-11-12: sign-ups were still ON in the dev project**; production is set up in Phase 8
- [x] MFA enrolment works; app routes require aal2 once enrolled — verified against the real dev project with a real TOTP factor: a password-only (aal1) session reads no rows and can't write; after the code it reads them (`e2e/auth-settings.spec.ts`)
- [x] Security headers present (checked by a test against the production build) — CSP with nonce and no `unsafe-eval`, frame-ancestors none, X-Frame-Options, nosniff, Referrer-Policy, HSTS, Permissions-Policy, COOP, `no-store`, no `X-Powered-By` (`e2e/public.spec.ts`)
- [x] No financial data in logs, URLs (only ids in query strings) or the service-worker cache — server logs record error type names only; the service worker caches static files and the offline page only. Accepted exception: the transaction search box and date filters use the query string (what the user typed, so the filtered page can be bookmarked); no stored record contents are put in URLs
- [x] CSV export neutralizes formula injection (Phase 6, `src/lib/csv`)
- [x] Account deletion removes every row and the auth user; the export is offered first (Phase 6, Settings → Data) — Phase 7 found that deletion by Supabase Auth failed when the user had transactions (integrity triggers ran without rights for the auth role); fixed in migration 0012 and covered by `tests/db/auth-deletion.test.ts`
- [x] Dependencies audited (`pnpm audit --prod`, 2026-11-12): no known vulnerabilities
- [x] `.env*`, backups and dumps are listed in `.gitignore`; a secret scan is run on the repository — whole history scanned for secret keys, access tokens, JWTs and connection strings: only test fixtures found. The app's own download names (`finance-track-backup-*.json`, `finance-track-*.csv`) were added to `.gitignore`
