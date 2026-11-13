# Finance Track — guide for coding agents (and future you)

A private, single-user personal finance and investment tracker. Next.js 16 (App Router) + Supabase (Postgres, Auth, RLS), PKR by default, Asia/Karachi time. Manual entry, CSV import/export, JSON backup. Installable as a PWA, online-first.

Read this file before changing anything. The detailed specs live in `docs/` (01–09); this is the map and the rules.

## Commands

| Command                                      | When                                                                                                                                                                                                                         |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                                   | Local app on :3000 (needs `.env.local`)                                                                                                                                                                                      |
| `pnpm lint` / `pnpm typecheck` / `pnpm test` | Before every commit                                                                                                                                                                                                          |
| `pnpm test:db`                               | After touching SQL or anything the database enforces. Needs a local Postgres on :54329 (`scripts/local-postgres.sh start`, or on Windows `pg_ctl -D .tmp/pgdata -o "-p 54329" start` with `initdb -U postgres --auth=trust`) |
| `pnpm build && pnpm check:bundle`            | Before a release; the bundle check fails if a secret key reaches the browser                                                                                                                                                 |
| `pnpm test:e2e`                              | Before a release. Runs against the **dev** Supabase project in `.env.local` with temporary users (see `docs/local-development.md`)                                                                                           |
| `pnpm test:isolation`                        | Real-Supabase security checks only (two-user isolation, MFA gate, sign-up off)                                                                                                                                               |

On Windows use `npx pnpm@10.28.0 …` if `pnpm` isn't installed (`corepack enable` fixes that).

## Architecture: layers and what may import what

```
src/app/         routes: pages, layouts, route handlers      → features, components, domain, lib
src/components/  React UI (server + client components)        → features (types, actions), domain, lib
src/features/    use cases: queries.ts (reads), actions.ts     → data, domain, lib
                 ("use server" mutations), per module
src/data/        Supabase access: repositories, typed client   → domain, lib
src/domain/      pure TypeScript money/accounting rules         → nothing outside src/domain
src/lib/         small shared helpers (format, validation,     → domain
                 csv, backup format, env, auth guard)
supabase/migrations/  schema, RLS, RPCs, invariants (append-only)
```

ESLint enforces the arrows that matter (`eslint.config.mjs`): the domain can't import React, Next or data; components and routes can't import `src/data`; data/features can't import UI. If lint blocks an import, move the code to the right layer instead of disabling the rule.

**Where a calculation goes:** formulas live once, in `src/domain` (unit-tested). SQL only enforces invariants (shapes, ownership, non-negative positions) and does plain sums. Pages never compute money; they format results.

## Non-negotiable rules

**Money and numbers**

- Never use JS `number` for money, quantities or rates. Use `Money` / `Dec` from `src/domain/money` (decimal.js). Read numerics from the database as text (`amount::text`).
- Round once, at presentation or persistence, half-even, to the currency's minor units. User input with too many decimals is an error, never rounded.
- Never add amounts in different currencies; convert with `src/domain/fx` at the right date, and list what couldn't be converted.
- Signs follow `docs/04-accounting-rules.md` §4.1 (signed by net-worth effect). Transfers, buys and sells are never income or spending.

**Database**

- Migrations are append-only: never edit a migration that may have been applied anywhere; add a new numbered file (`supabase/migrations/YYYYMMDD0000NN_name.sql`).
- Every user table: `user_id default auth.uid()`, RLS enabled **and forced**, the restrictive `aal_ok()` MFA policy, owner-only policies using `(select auth.uid())`, explicit grants to `authenticated`, nothing to `anon`, an audit trigger. `tests/db/schema-security.test.ts` fails if you forget.
- Cross-row references use composite FKs `(id, user_id)` so another user's row can't be referenced even if RLS were bypassed.
- Multi-row writes go through one RPC (atomic). Functions are `security invoker` with `set search_path = ''`, errors use the `FT0xx` codes mapped in `src/lib/errors.ts`.
- Trigger functions that must also run when Supabase Auth deletes a user (the cascade runs as `supabase_auth_admin`, which has no rights here) must be `security definer` (see migration 0012).
- Supabase loads `pg_safeupdate` on API connections: every `DELETE`/`UPDATE` inside a function needs a `WHERE` (use `where user_id = auth.uid()`). Local Postgres does not enforce it, so `tests/db/schema-security.test.ts` checks function bodies for you.
- PostgREST returns at most 1,000 rows: any list that grows with history must use `fetchAll` (`src/data/supabase/paging.ts`) with a deterministic order ending in a unique key.
- After a schema change, update `src/data/supabase/database.types.ts` by hand (it is hand-maintained).

**Security and privacy**

- The secret key lives only in `src/data/supabase/admin.ts` (server-only) and is used for account deletion and E2E setup only.
- Never log record contents, amounts or descriptions; log error type names only. Error messages shown to users come from `src/lib/errors.ts`.
- Exports go through `src/lib/csv` (formula injection is neutralized). Downloads are `no-store`.
- The service worker (`public/sw.js`) caches static files and the offline page only. Never cache pages, actions or data.

**UI**

- Design tokens are CSS variables in `src/app/globals.css` (light and dark); use the Tailwind token classes (`bg-card`, `text-muted-foreground`, `text-positive`…), never raw hex in components.
- Every amount renders through `<Amount>` (tabular figures, sign, colour never the only signal). Every form field has a label (`FormField`, `SelectField`); errors appear next to the field.
- Mobile first: no sideways scroll at 360 px; the bottom nav needs the page's bottom padding. Visible keyboard focus. Respect reduced motion.
- Copy is plain, sentence case, says what happens ("Save transaction", then "Transaction saved.").

## Recipes

**Add a field or table** → new migration (+ RLS/grants/audit as above) → `database.types.ts` → repository in `src/data/repositories` → domain logic + unit tests → feature `queries.ts`/`actions.ts` → validation in `src/lib/validation` → UI → `tests/db` for every invariant and cross-user isolation → if it holds user data, add it to `BACKUP_TABLES` (`src/lib/backup.ts`) and to `restore_backup`/`delete_my_data` in a new migration, and to `e2e/isolation.spec.ts`.

**Add a page** → `src/app/(app)/<route>/page.tsx` calling `await requireUser()` first, data from a feature query, UI from `src/components`. Add it to `e2e/screens.spec.ts`.

**Change an accounting rule** → update `docs/04-accounting-rules.md` first, then `src/domain` + tests. If net-worth math changes, bump `NET_WORTH_METHOD_VERSION`.

**Add an export** → a case in `src/features/exports/exports.ts` (+ `EXPORT_KINDS`); it is served at `/export/<kind>`.

## Definition of done

1. `pnpm lint`, `pnpm typecheck`, `pnpm test` pass; `pnpm test:db` too if SQL or invariants changed; `pnpm build` for UI or config changes.
2. New behaviour has tests at the lowest layer that can prove it (domain unit → db → e2e).
3. Docs updated where the change is described (`docs/03` schema/RPCs, `docs/04` rules, `docs/08` checklist).
4. Migrations needed by the dev/prod project are called out to the owner (they are applied in the Supabase SQL Editor; the owner's network has no IPv6 route to the direct DB host).

## Gotchas

- The working tree uses CRLF on Windows (`core.autocrlf=true`); Git stores LF. Prettier's `format:check` reports every CRLF file there; that is not a real failure.
- Deferred constraint triggers check transaction shapes at commit; RPCs `set constraints … immediate` so errors come from the call. A function that writes several transactions in one call must set them back to `deferred` before each (see `import_transactions`).
- `loadFinanceContext()` and `loadInvestments()` are cached per request: use them instead of re-reading accounts, rates or assets.
- Next.js 16 differs from older versions (see the block below): `PageProps<"/route">`, async `params`/`searchParams`, `src/proxy.ts` instead of middleware.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
