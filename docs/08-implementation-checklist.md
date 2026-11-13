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
- [x] **Needs you:** create the dev Supabase project and your user, then sign in once from your PC. Done 2026-11-12: migrations 0001–0009 applied through the SQL Editor (the PC has no IPv6 route to the direct database host), owner signed in against real Supabase Auth

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

## Phase 4: Budgets, goals and reporting — done (2026-10-27)

- [x] Exchange rates: add and delete dated rates (Settings → Exchange rates); every conversion uses the rate in force on the amount's own date
- [x] Budgets: per top-level expense category plus an overall limit, month navigation, copy last month, over/near warnings, 3-month comparison
- [x] Savings goals: linked-account or allocation goals, allocate and release, over-allocation warning, complete, archive and delete
- [x] Net worth: assets − liabilities with per-account conversion and rates shown, liquid and investment-account cash broken out, 24-month trend with a table view, snapshots with drift detection
- [x] Reports: monthly (chart + table, totals), categories (with subcategory breakdown), budget performance and yearly
- [x] Dashboard: period picker, net worth hero and 12-month trend, income, spending, net cash flow, savings rate, spending by category, budgets, balances, goals, recent transactions
- [x] Tests: 164 unit/component tests and 84 database tests (budgets, goals, rates, snapshots, cross-user isolation for every new table). INV-7 (no double counting) is now covered; INV-5 and INV-9 wait for Phase 5
- [x] Browser walkthrough (desktop + mobile, light + dark) against real PostgreSQL through the local stand-in: 28/28 checks
- [x] Chart colours validated with the palette checker (2 series, light and dark: all checks pass)

### Phase 4 notes

- The dashboard's Investments card says honestly that valuations arrive in Phase 5; investment accounts count only their cash until then.
- Budgets keep the currency they were created in; changing the reporting currency doesn't convert old budgets.
- CSV export of reports is part of Phase 6.

## Phase 5: Investment portfolio — built (2026-11-12), awaiting your check against real Supabase

- [x] Assets (all 7 categories, per-category details): migration 0010; category defaults for unit and decimal places (gold defaults to tola); currency locked once the asset has history; archive, or delete while unused
- [x] Investment transactions (opening holding, buy, sell, dividend, interest, fee, split) + position invariant: shape rules in the deferred trigger; the running quantity of every (account, asset) position can never go below zero, including after an edit or delete of an earlier buy (`FT008`); archived assets take no new activity (`FT009`)
- [x] WAC engine, realized and unrealized gains, income and fees (`src/domain/investments`)
- [x] Valuations (unit price or total value, history, as-of, par mode); a total is divided by the quantity held on its date and the original input is kept
- [x] Portfolio page, allocation, 12-month history; net worth includes valued holdings (method version 2); dashboard investments card; investment transactions in the transaction list and editable from it
- [x] Tests: 14 database tests (shapes, oversell, edit/delete breaking a later sale, archived assets, precision, isolation, audit), 21 domain tests (partial and full sells, splits, as-of valuations, unvalued handling, par, double counting, FX), 10 validation tests. INV-5 and INV-9 are now covered
- [x] Migration 0010 applied to the dev project; buy, valuation and sell verified end to end (Phase 7)

### Phase 5 notes

- `transactions.asset_id` is set on every investment kind (buy, sell and opening holding too, not only dividend, interest, fee and split), so an asset's history is one indexed lookup. All movements of a transaction belong to that asset.
- `asset_valuations` has no `currency` column: a valuation is always in its asset's currency, which is locked once valuations exist.
- The cash leg of a same-currency buy or sell is quantity × price ± fee, rounded half-even to the currency's minor units (as a broker rounds). When the cash account uses another currency, the form asks for the amount that actually moved.
- Snapshots taken before Phase 5 (method version 1) say "made before holdings were counted" when today's recalculation differs.
- Investment income and gains by period in Reports, and CSV export of holdings, come with the Phase 6 report and export work.

## Phase 6: UX, CSV and PWA — built (2026-11-12), awaiting your check against real Supabase

- [x] CSV import wizard (`/transactions/import`): column mapping with guesses from the header, three date orders and named months, one signed amount column or money-out/money-in columns, sign flip, category matching by name (else Uncategorized), every row checked before saving, duplicate flags (imported before, same date and amount, repeated in file) start unticked, all-or-nothing commit (migration 0011, `FT010` with failing rows), undo a whole batch (type UNDO)
- [x] CSV exports of every entity (Settings → Data) and every report (Reports, incl. the new Investments tab); filtered transaction export from the Transactions page; formula injection neutralized
- [x] JSON backup (every table with ids, read page by page) and restore into an empty account in one transaction; system categories remapped; round-trip database test compares every row and the derived balances and positions
- [x] Delete all my data (type DELETE) and delete account (email + password re-check; needs `SUPABASE_SECRET_KEY`)
- [x] Responsive polish, charts on mobile, accessibility pass: verified signed in on a Pixel 7 and a desktop in Phase 7 (no sideways scroll, no console errors, labelled controls found by accessible name)
- [x] Manifest, generated icons (`scripts/generate-icons.mjs`), service worker (static files and the offline page only; navigations network-only; caches cleared on sign-out), offline page
- [x] Fix: every list that grows with history (ledger lines, postings, movements, valuations, rates, budgets, allocations, snapshots, exports) is read page by page; before, Supabase's 1,000-row limit would have silently cut figures short
- [x] Migration 0011 applied to the dev project (2026-11-12, together with 0010 and 0012)

### Phase 6 notes

- The CSV parser is a small in-house RFC 4180 implementation (`src/lib/csv`) instead of `papaparse`: one less dependency, and it is unit-tested for quotes, line breaks, BOMs and `;`/tab separators.
- Imports create income and expense only; transfers are entered by hand. Imported rows get the tag `imported`.
- Restore keeps every id, so a backup can't be restored into a second account of the same database while the original records still exist (refused with a clear message).
- Server-action bodies may be up to 11 MB (for backup restores; the app caps files at 10 MB).

## Phase 7: Security and release verification — done (2026-11-12)

- [x] Full checklist in `05-security.md`: every item verified; public sign-up is off in the dev project (production is configured in Phase 8)
- [x] Two-user isolation against the real dev project (`pnpm test:isolation`): B can't read, change, delete or reach through RPCs anything of A's in any of the 16 user tables, including investments and imports; anonymous calls refused; MFA aal2 gate verified with a real TOTP factor
- [x] E2E suite (`pnpm test:e2e`, production build, desktop + Pixel 7): 50 tests pass. The release journey checks net worth to the rupee (Rs 150,000.00) after income, expense, transfer, budget, gold buy/valuation/sell; oversell refused; CSV export, backup, import and undo work; all 15 main screens render on phone and desktop with no console errors and no sideways scroll
- [x] Found and fixed: Supabase Auth could not delete a user who had transactions (migration 0012); "Delete my account" would have failed
- [x] Found and fixed: a trend chart with a single month drew nothing (now shows the point); undoing an import gave no visible confirmation (now a notice)
- [x] Visual review of the phone and desktop screenshots

## Functional audit (2026-11-14)

A browser audit (`e2e/audit.spec.ts`) exercised every feature with dummy data as a temporary user on the dev project, then deleted that account through the app. 16 of 17 steps pass; the delete-all-data-and-restore step waits for migration 0013 on the dev project.

- Fixed: merging or deleting a category left the user on "Page not found" (now returns to the list with a notice)
- Fixed: inline forms (budgets, goal allocations, valuations, rates) wiped typed input on an error (now cleared only after a successful save)
- Fixed: "Delete all my data" always failed on Supabase (`pg_safeupdate`: DELETE without WHERE); migration 0013, plus a test that scans every function for bare DELETE/UPDATE
- Unrecognised database error codes are now logged by code (no user data) so failures can be diagnosed
- [ ] **Needs you:** apply `finance-track-migration-0013.sql`, then `AUDIT=1 npx playwright test --project=audit` runs all 17 steps

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
