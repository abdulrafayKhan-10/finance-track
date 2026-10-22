# 8. Implementation checklist

Legend: `[x]` done and verified, `[ ]` not started, `[~]` in progress.

## Environment findings (Phase 1 inspection, 2026-10-22)
- The repository was empty: no commits and no files.
- Container: Node 22.22, npm 10.9, pnpm 10.28, PostgreSQL 16 client and server binaries. The npm registry is reachable (current Next.js 16.4.2, supabase-js 2.118, Tailwind 4.3).
- **Blocker (container only):** the Docker daemon is not running, so the Supabase CLI local stack cannot run here. **Workaround:** run the migrations and RLS/database tests against a local PostgreSQL 16 instance with an `auth` shim (`auth.uid()` reading `request.jwt.claims`, plus the `anon` and `authenticated` roles). This mirrors Supabase's mechanism and is also what CI will use.
- **Needs you (Phase 2/8):** a Supabase account with a project (URL + anon key + service-role key, stored only in Vercel and local `.env.local`) and a Vercel account linked to this GitHub repository. I cannot create these accounts for you.

## Phase 1: Requirements and architecture
- [x] Product requirements (`01`)
- [x] Architecture, module boundaries, route and component map, hosting limits (`02`)
- [x] Entity diagram, schema, RLS model, migration plan, backup design (`03`)
- [x] Accounting rules and formulas, invariant list (`04`)
- [x] Security threat checklist (`05`)
- [x] UI design system and PWA rules (`06`)
- [x] Testing strategy (`07`)
- [ ] **Your approval of the open decisions below**

## Phase 2: Foundation
- [ ] Scaffold Next.js (strict TS, ESLint with domain-import restrictions, Prettier), Tailwind, shadcn/ui
- [ ] `env.ts` validation; Supabase server, browser and admin clients
- [ ] Migrations 0001–0004 (reference, profiles, accounts, categories, ledger tables, audit) with RLS
- [ ] Local PG test harness + `auth` shim; RLS isolation tests for these tables
- [ ] Auth: login, logout, callback, middleware session refresh, protected layout, MFA enrol and challenge
- [ ] App shell: sidebar, bottom nav, theme, empty pages
- [ ] Local development and CI docs; GitHub Actions (lint, typecheck, unit, db, build)

## Phase 3: Core accounting (priority)
- [ ] `domain/money`, `domain/fx` + tests (rounding, currency mismatch)
- [ ] Ledger RPCs (create, update, delete transaction) with shape trigger + atomicity tests
- [ ] Accounts CRUD, opening balances, archive
- [ ] Categories CRUD, subcategories, merge
- [ ] Transactions UI: forms per kind, list, filters, search, keyset pagination
- [ ] Transfers (same and cross currency)
- [ ] Refunds, adjustments, pending/cleared
- [ ] Reconciliation + history
- [ ] Invariant suite INV-1..10 passing

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
