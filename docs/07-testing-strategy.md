# 7. Testing strategy

## 7.1 Layers

| Layer | Tool | Scope | Runs in |
|-------|------|-------|---------|
| Domain unit | Vitest | Every formula in [accounting rules](04-accounting-rules.md) (`ACC-*`, `INV-*`), Money, FX, rounding, CSV parsing and mapping, duplicate fingerprints | CI, locally, Claude Code container |
| Database | Vitest + `pg` against PostgreSQL with migrations applied and an `auth` shim | RLS for every table, composite-FK isolation, RPC atomicity, shape triggers, position invariant, audit rows, restore round-trip | CI and container (local PG 16); a smoke run against Supabase local when Docker is available |
| Component | Vitest + React Testing Library (jsdom) | Forms (validation messages, kind switching), tables (empty, loading and error states), confirmation dialogs | CI |
| End-to-end | Playwright (Chromium, plus a mobile viewport such as Pixel 7) | Sign in → create accounts → income, expense, transfer → budget → buy, valuation, sell → net worth → export, all against a dev Supabase project | CI on demand and before release |

## 7.2 Invariant tests come first
The Phase 3 exit criterion is that INV-1 to INV-10 and the core `ACC-*` cases pass **before** any dashboard work. Each test uses fixtures built from a small, readable builder (`ledger().account('Bank', 'PKR', 1000).expense(...)`) so that the expected values can be checked by hand.

Required scenarios, matching the brief: opening balances; income and expense; same- and cross-currency transfers; refunds; adjustments; reconciliation; budgets (excluding transfers, buys and card payments); goals (linked vs allocations, no double counting); net worth (cash + investment cash + valued holdings − liabilities; unvalued excluded and reported); buy, partial sell, full sell, sell-more-than-held rejected; WAC after a split; fees; dividends and interest; decimal rounding half-even, including 0.1+0.2 style traps; FX direct, inverse, missing, stale and future-dated rates; historical valuation as-of; CSV import validation, duplicates and all-or-nothing behaviour; CSV export round-trip and formula escaping; backup and restore equivalence; auth and RLS cross-user access with two users; mobile layout smoke tests.

## 7.3 Isolation tests (two users)
For each table and RPC: user B attempts select, insert (with A's `user_id`), update and delete on A's ids. Expected results: zero rows, a policy violation or an FK violation. A meta-test fails if a new table is added without RLS or without a matching isolation test.

## 7.4 Quality gates (each milestone)
`pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test` (unit + component), `pnpm test:db`, `pnpm build`. E2E runs before a release. A check is reported as passed only if it was actually run, and the command output is quoted in the milestone report.
