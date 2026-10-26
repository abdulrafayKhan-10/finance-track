# 8. Implementation checklist

Legend: `[x]` done and verified, `[ ]` not started, `[~]` in progress.

## Environment findings (Phase 1 inspection, 2026-10-22)

- The repository was empty: no commits and no files.
- Container: Node 22.22, npm 10.9, pnpm 10.28, PostgreSQL 16 client and server binaries. The npm registry is reachable (current Next.js 16.4.2, supabase-js 2.118, Tailwind 4.3).
- **Blocker (container only):** the Docker daemon is not running, so the Supabase CLI local stack cannot run here. **Workaround:** run the migrations and RLS/database tests against a local PostgreSQL 16 instance with an `auth` shim (`auth.uid()` reading `request.jwt.claims`, plus the `anon` and `authenticated` roles). This mirrors Supabase's mechanism and is also what CI will use.
- **Needs you (Phase 2/8):** a Supabase account with a project (URL + publishable key; the secret key only from Phase 6; stored only in Vercel and local `.env.local`) and a Vercel account linked to this GitHub repository. I cannot create these accounts for you.

## Phase 1: Requirements and architecture

- [x] Product requirements (`01`)
- [x] Architecture, module boundaries, route and component map, hosting limits (`02`)
- [x] Entity diagram, schema, RLS model, migration plan, backup design (`03`)
- [x] Accounting rules and formulas, invariant list (`04`)
- [x] Security threat checklist (`05`)
- [x] UI design system and PWA rules (`06`)
- [x] Testing strategy (`07`)
- [x] Approval of the plan and the default decisions below (2026-10-22)

## Phase 2: Foundation — done (2026-10-22)

- [x] Next.js 16.4 (App Router, strict TS + `noUncheckedIndexedAccess`), Tailwind v4, ESLint with domain and component import restrictions, Prettier
- [x] UI primitives in shadcn/ui style (Button, Input, Label, Card, Alert), written from source because the shadcn registry is blocked in this container; `components.json` is present so `shadcn add` works on your PC
- [x] Environment validation (Zod) at server start; a secret key in a `NEXT_PUBLIC_*` variable is refused
- [x] Supabase clients: server (user session + RLS) and proxy session refresh. The admin client is deferred to Phase 6, where account deletion first needs it
- [x] Migrations 0001–0004: reference data, profiles, accounts, categories, ledger tables with the deferred shape invariant, audit history; RLS enabled and forced on every table; MFA-restrictive policies; anon has no privileges
- [x] Local PostgreSQL test harness plus Supabase stand-in; 51 database tests (isolation, invariants, MFA, audit, deletion)
- [x] Auth: password sign-in, TOTP challenge, sign-out, forgot/reset password via `/auth/confirm`, MFA enrol and remove, change password; `src/proxy.ts` refreshes the session, redirects anonymous users and sets a per-request CSP nonce
- [x] App shell: desktop sidebar, mobile bottom navigation + More page, light/dark/system theme, loading, error and not-found states; module pages say honestly which phase they arrive in
- [x] CI workflow (`.github/workflows/ci.yml`) and [local development guide](local-development.md)
- [ ] **Needs you:** create the dev Supabase project and your user, following [local development](local-development.md#supabase-project-setup-dev-now-production-in-phase-8), then sign in once from your PC. Real Supabase Auth has not been exercised yet; the smoke test used a local stand-in

### Phase 2 deviations from the plan

- `cacheComponents` (on by default in new Next 16 projects) is **off**: every page is private and rendered per request, and nonce-based CSP needs dynamic rendering anyway.
- `style-src` allows `'unsafe-inline'` because UI primitives position popovers with inline style attributes. Scripts remain nonce-only (`'strict-dynamic'`).
- Category inserts are not audited (the 16 default categories would add noise); category updates and deletes are.
- `database.types.ts` is hand-written for the one table the app reads so far. Regenerate it with the Supabase CLI once a project is linked.

## Phase 3: Core accounting — done (2026-10-26)

- [x] Domain: `Money` (decimal.js, half-even, refuses mixing currencies), currencies, dates (Asia/Karachi "today"), FX lookup and conversion (as-of rates, inverse, stale flag, unavailable), balances, classification, cash flow and savings rate, entry signing, reconciliation check
- [x] Ledger RPCs (migration 0005) with edit-conflict protection, archived-account guard and exact-decimal guard; reconciliation (migration 0006)
- [x] Accounts: create, edit, archive/close, delete when unused; balances and cleared balances per account, totals per currency
- [x] Categories: create, subcategories, rename, archive, merge, delete when unused; usage counts
- [x] Transactions: form per kind (expense, income, transfer, refund, adjustment), edit, delete with confirmation, history, list with search, filters, sort and keyset pagination
- [x] Transfers in one currency and across currencies (amount sent and received)
- [x] Refunds, adjustments (reason required), pending/cleared
- [x] Reconciliation with live difference, optional adjustment, locking, undo and "changed since reconciled"
- [x] Profile: display name, reporting currency, timezone
- [x] Tests: 130 unit/component tests and 73 database tests. Invariants: INV-1, 2, 3, 4, 6, 8 and 10 are covered; INV-5, 7 and 9 need investments and valuations and are covered in Phases 4–5
- [x] Browser walkthrough (desktop + mobile) against real PostgreSQL through a local PostgREST-style stand-in: 26/26 checks

### Phase 3 notes

- Split transactions (several categories on one expense) are supported by the schema but not by the form yet; such records show "can't be edited with this form".
- Linking a refund to its original expense (`refund_of_id`) is kept on edit but can't be set from the form yet.
- Sorting is by date (newest or oldest first). Sorting by amount is not offered because transfers and splits have no single amount.
- The account ledger shows the newest 100 postings, with a "show all" link.

## Phase 4: Budgets, goals and reporting

- [ ] Exchange-rate management UI
- [ ] Budgets (category + overall, copy month, history)
- [ ] Savings goals (linked/allocations, over-allocation warning)
- [ ] Cash flow, savings rate, category reports
- [ ] Net worth (cash and liabilities), snapshots
- [ ] Dashboard with period picker

## Phase 5: Investment portfolio

- [ ] Assets (all 7 categories, per-category details)
- [ ] Investment transactions (opening holding, buy, sell, dividend, interest, fee, split) + position invariant
- [ ] WAC engine, realized and unrealized gains, income and fees
- [ ] Valuations (unit and total entry, history, as-of, par mode)
- [ ] Portfolio page, allocation, history; net worth includes holdings
- [ ] Tests: partial and full sells, splits, unvalued handling, double counting

## Phase 6: UX, CSV and PWA

- [ ] CSV import wizard (mapping, validation, duplicates, all-or-nothing, undo batch)
- [ ] CSV exports (all entities + reports); JSON backup; restore + round-trip test
- [ ] Responsive polish, charts on mobile, accessibility pass
- [ ] Manifest, icons, service worker (static-only caching), offline page

## Phase 7: Security and release verification

- [ ] Full checklist in `05-security.md`
- [ ] Two-user isolation run against a real Supabase project
- [ ] E2E suite desktop and mobile viewports

## Phase 8: Free deployment

- [ ] Supabase production project, migrations pushed, auth URLs, sign-ups disabled after owner registration
- [ ] Vercel project + env vars; HTTPS; security headers verified
- [ ] Deployment runbook, free-tier limits re-verified, backup and restore runbook, troubleshooting
- [ ] Verified on Windows PC and phone (you confirm on your devices)

## Later (not in v1)

Recurring transactions; offline write queue; market-price provider; FIFO lots; IRR/TWR; lakh/crore grouping default.

## Open decisions: defaults I will use unless you say otherwise

1. **Frontend host:** Vercel Hobby (alternative: Cloudflare).
2. **Dev database:** a second free Supabase project named "finance-track-dev" for E2E and manual testing, with local PostgreSQL for automated tests. If you install Docker Desktop on your PC, you can use the Supabase local stack instead.
3. **MFA:** TOTP (authenticator app) offered and strongly recommended; required once enrolled.
4. **Credit cards:** an expense when you buy; paying the bill is a transfer (ACC-CC-1).
5. **Pending transactions:** included in balances and reports, marked "pending"; excluded from reconciliation (ACC-PEND-1).
6. **Unvalued holdings:** excluded from net worth and shown with a warning and their cost basis (ACC-VAL-1).
7. **Dividends and interest:** counted as income for the savings rate; realized gains are not (§4.3).
8. **Number grouping:** international `1,250,000` by default; lakh/crore as an option.
