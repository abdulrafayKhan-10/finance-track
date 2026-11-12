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
- [ ] **Needs you:** apply migration 0010 to the dev project, then try an opening holding, a buy, a valuation and a sell

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
- [~] Responsive polish, charts on mobile, accessibility pass: new screens are built mobile-first with labelled controls; a signed-in browser pass on phone and desktop is still to do (Phase 7 E2E)
- [x] Manifest, generated icons (`scripts/generate-icons.mjs`), service worker (static files and the offline page only; navigations network-only; caches cleared on sign-out), offline page
- [x] Fix: every list that grows with history (ledger lines, postings, movements, valuations, rates, budgets, allocations, snapshots, exports) is read page by page; before, Supabase's 1,000-row limit would have silently cut figures short
- [ ] **Needs you:** apply migration 0011, then try an import, a backup download, and the Data page

### Phase 6 notes

- The CSV parser is a small in-house RFC 4180 implementation (`src/lib/csv`) instead of `papaparse`: one less dependency, and it is unit-tested for quotes, line breaks, BOMs and `;`/tab separators.
- Imports create income and expense only; transfers are entered by hand. Imported rows get the tag `imported`.
- Restore keeps every id, so a backup can't be restored into a second account of the same database while the original records still exist (refused with a clear message).
- Server-action bodies may be up to 11 MB (for backup restores; the app caps files at 10 MB).

## Phase 7: Security and release verification — in progress (2026-11-12)

- [~] Full checklist in `05-security.md`: all items verified except public sign-up, which is still ON in the dev project (needs you; production in Phase 8)
- [~] Two-user isolation run against the real dev project (`pnpm test:isolation`): passed for every table from migrations 0001–0009, anonymous access refused, MFA gate verified with a real TOTP factor. The investment and import tables follow once 0010–0012 are applied there
- [~] E2E suite (Playwright, production build, desktop + Pixel 7): written (`e2e/`); the security-header and public checks pass; the signed-in journey and screen checks run once 0010–0012 are applied to the dev project
- [x] Found and fixed: Supabase Auth could not delete a user who had transactions (migration 0012, `tests/db/auth-deletion.test.ts`); "Delete my account" would have failed
- [ ] **Needs you:** apply `finance-track-migrations-0010-0012.sql`, turn public sign-up off, then I run `pnpm test:e2e` and review the screenshots

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
