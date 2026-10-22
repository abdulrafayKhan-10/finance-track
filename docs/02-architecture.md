# 2. Architecture

## 2.1 Stack

| Layer         | Choice                                                              | Why                                                                                        |
| ------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Framework     | Next.js (App Router, current stable 16.x), React, strict TypeScript | Server components and server actions keep database access and authorization on the server. |
| Styling/UI    | Tailwind CSS v4, shadcn/ui (Radix primitives), lucide icons         | Accessible primitives whose code lives in the repo, with no runtime UI vendor.             |
| Charts        | Recharts                                                            | Responsive, works with React, enough for line, bar, pie and stacked charts.                |
| Forms         | React Hook Form + Zod                                               | One Zod schema validates on both client and server.                                        |
| Money maths   | `decimal.js`                                                        | Arbitrary-precision decimals. JavaScript `number` is never used for money.                 |
| Dates         | `date-fns` + `@date-fns/tz`                                         | Calendar-date arithmetic in Asia/Karachi without moment-style mutation bugs.               |
| CSV           | `papaparse`                                                         | Streaming parser that handles quoting and BOMs (Excel exports).                            |
| Database/Auth | Supabase (PostgreSQL 15+/17, Auth, PostgREST) via `@supabase/ssr`   | Free tier, RLS, SQL migrations and cookie-based sessions.                                  |
| Tests         | Vitest, React Testing Library, Playwright                           | Covers unit, component and end-to-end tests.                                               |
| Hosting       | Vercel Hobby (frontend), Supabase Free (DB + Auth), GitHub          | All free at personal scale. Limits are in §2.8.                                            |

The aim is a small dependency set. Each new runtime dependency needs a reason recorded in the PR description.

## 2.2 Layering and module boundaries

```
┌──────────────────────────────────────────────────────────────┐
│ Presentation    src/app/**, src/components/**                │  React only. No formulas.
├──────────────────────────────────────────────────────────────┤
│ Application     src/features/<module>/{actions,queries}.ts   │  Use cases: authorize → validate → call repo/RPC → call domain
├──────────────────────────────────────────────────────────────┤
│ Domain          src/domain/**   (pure TypeScript)            │  Money, FX, ledger, budgets, goals, investments, net worth, reports
├──────────────────────────────────────────────────────────────┤
│ Data access     src/data/**     (Supabase clients, repos)    │  Typed queries and RPC calls. Rows → domain types.
├──────────────────────────────────────────────────────────────┤
│ Database        supabase/migrations/**                       │  Tables, constraints, RLS, transactional RPC functions
└──────────────────────────────────────────────────────────────┘
Cross-cutting: src/lib/validation (Zod), src/lib/env.ts, src/lib/auth.ts
```

Rules:

1. `src/domain` imports nothing from React, Next.js or Supabase. An ESLint `no-restricted-imports` rule enforces this.
2. Every financial figure shown in the UI comes from a domain function. Components only format values.
3. The database enforces structural invariants (ownership, balanced transfers, signs, non-negative quantities). The domain computes meaning (classification, conversion, cost basis, net worth). SQL does only plain aggregation (sums grouped by account, currency, category and month) and applies no policy, so each formula exists in one place.
4. Every write that touches more than one row goes through one PostgreSQL function (RPC) and runs in a single database transaction. A failure rolls back everything.
5. Numeric columns are read as **strings** (`amount::text` in selects, or text returns from RPCs) and turned into `Decimal` straight away. PostgREST would otherwise return them as JSON numbers and lose precision.

## 2.3 Directory layout (planned)

```
src/
  app/
    (auth)/login/  auth/callback/  auth/confirm/
    (app)/layout.tsx              # authenticated shell: sidebar + bottom nav
    (app)/page.tsx                # dashboard
    (app)/transactions/ [id]/ new/ import/
    (app)/accounts/ [id]/ [id]/reconcile/
    (app)/budgets/
    (app)/goals/ [id]/
    (app)/investments/ assets/[id]/ new/
    (app)/net-worth/
    (app)/reports/
    (app)/settings/ categories/ currencies/ security/ data/
    manifest.ts  offline/page.tsx
  components/ui/                  # shadcn primitives
  components/<feature>/           # feature UI: forms, tables, charts
  features/<module>/actions.ts    # server actions ('use server')
  features/<module>/queries.ts    # server-only data loaders
  domain/
    money/       # Money type, rounding, formatting helpers (no Intl in the core)
    fx/          # rate lookup, conversion, "unavailable" results
    ledger/      # balances, classification, cash flow
    budgets/  goals/  investments/  networth/  reports/  csv/
  data/
    supabase/{server,browser,admin}.ts   # admin = service role, server-only, used for account deletion only
    repositories/*.ts
    database.types.ts                    # generated by `supabase gen types`
  lib/{env.ts, validation/, auth.ts, dates.ts}
supabase/
  migrations/*.sql
  seed.dev.sql                    # demo data, development only
  tests/*.sql                     # RLS and invariant tests (pgTAP-style)
tests/
  unit/  integration/  e2e/  fixtures/
public/ icons/  sw.js
```

## 2.4 Request and data flow

- **Reads:** a server component calls `features/x/queries.ts`. That module gets the Supabase server client using the user's session cookie, so RLS applies. It runs repository queries, passes the rows to domain functions, and gives view models to components.
- **Writes:** a form validates with Zod on the client and calls a server action. The action checks the session (`getUser()`, which re-verifies the JWT with Supabase Auth), validates again with the same Zod schema, and calls a single RPC such as `create_transaction(payload jsonb)`. The RPC runs `SECURITY INVOKER`, so RLS still applies, re-checks the invariants, writes all rows, and audit triggers record the change. The action then revalidates the affected paths.
- **Errors:** RPCs raise coded errors (for example `FT001 transfer_unbalanced`). Actions map these codes to safe user messages. Raw database errors and record contents never reach the client.

The browser Supabase client is used only for authentication flows. All financial data goes through server code. This keeps one authorization path and avoids caching responses on the client.

## 2.5 Synchronisation model

Every device reads and writes the same Postgres database. There is no local data store. Pages are dynamic: authenticated routes use `cache: 'no-store'` and `dynamic = 'force-dynamic'`. A device sees new data after it navigates or refreshes. Realtime push is not needed in v1.

## 2.6 Route and component map

| Route                        | Purpose                                                     | Main components                                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                     | Email and password sign-in, then TOTP challenge if enrolled | `LoginForm`, `MfaChallenge`                                                                                                                                                                                                 |
| `/`                          | Dashboard with period selector                              | `PeriodPicker`, `NetWorthCard`, `CashFlowCards`, `SavingsRateCard`, `PortfolioCard`, `SpendingByCategoryChart`, `AccountBalancesList`, `BudgetProgressList`, `GoalProgressList`, `NetWorthTrendChart`, `RecentTransactions` |
| `/transactions`              | Ledger list                                                 | `TransactionFilters`, `TransactionTable` (desktop), `TransactionCards` (mobile), `Pagination`, `ExportCsvButton`                                                                                                            |
| `/transactions/new`, `/[id]` | Create or edit                                              | `TransactionForm` (switches by kind: income, expense, refund, transfer, adjustment), `DeleteConfirmDialog`, `AuditTrail`                                                                                                    |
| `/transactions/import`       | CSV import wizard                                           | `CsvUpload`, `ColumnMapper`, `ImportPreview` (row errors and duplicate flags), `ImportCommit`                                                                                                                               |
| `/accounts`, `/[id]`         | Accounts grouped by assets and liabilities; account ledger  | `AccountForm`, `AccountGroupList`, `AccountLedger`, `BalanceHistoryChart`                                                                                                                                                   |
| `/accounts/[id]/reconcile`   | Reconciliation                                              | `ReconcileForm`, `ClearedToggleTable`, `ReconciliationHistory`                                                                                                                                                              |
| `/budgets`                   | Budgets for a month                                         | `MonthPicker`, `BudgetTable`, `BudgetForm`, `CopyPreviousMonth`, `BudgetHistoryChart`                                                                                                                                       |
| `/goals`, `/[id]`            | Goals                                                       | `GoalForm`, `GoalCard`, `AllocationForm`, `AllocationHistory`                                                                                                                                                               |
| `/investments`               | Portfolio                                                   | `HoldingsTable`, `AllocationChart`, `PortfolioHistoryChart`, `GainsSummary`, `IncomeSummary`                                                                                                                                |
| `/investments/assets/[id]`   | One asset                                                   | `AssetForm`, `ValuationForm`, `ValuationHistory`, `PositionByAccount`, `AssetTransactions`                                                                                                                                  |
| `/investments/new`           | Investment transaction                                      | `InvestmentTransactionForm` (buy, sell, dividend, interest, fee, split, opening holding)                                                                                                                                    |
| `/net-worth`                 | Net worth detail and snapshots                              | `NetWorthBreakdown`, `SnapshotList`, `CreateSnapshotButton`, `UnvaluedWarning`                                                                                                                                              |
| `/reports`                   | Monthly and yearly reports                                  | `ReportTabs`, `IncomeExpenseReport`, `CategoryReport`, `BudgetPerformance`, `InvestmentReport`                                                                                                                              |
| `/settings/*`                | Settings                                                    | `ProfileForm`, `CategoryManager`, `ExchangeRateTable`, `MfaEnrol`, `DataExport`, `BackupRestore`, `DeleteAccount`                                                                                                           |

## 2.7 Key trade-offs

| Decision                                                                                                      | Alternative                                        | Reason                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Journal header + signed lines** (one transaction, 1–2 lines on balance-sheet accounts; categories on lines) | Full double-entry with income and expense accounts | Gives the guarantees of double-entry for transfers (one atomic record, two legs that balance) without making me manage "Expenses:Food" accounts. Categories on lines allow split transactions later without changing the schema. |
| **Derived balances, cost basis and gains** (computed from lines, not stored)                                  | Stored running balances                            | Editing or deleting an old record cannot leave a stale total. At personal scale (tens of thousands of rows) the cost is negligible, and caching can be added later behind the same domain function.                              |
| **Calculations in TypeScript domain**                                                                         | SQL views                                          | Unit-testable with Vitest, written once, and reused for reports, CSV and snapshots. SQL only enforces invariants and does plain sums.                                                                                            |
| **RPC per multi-row write**                                                                                   | Several PostgREST calls from the server            | Atomicity. A failed transfer or import leaves nothing half-written.                                                                                                                                                              |
| **Online-first PWA**                                                                                          | Offline queue                                      | The brief puts reliability first. Offline writes need conflict resolution, so they are left for later.                                                                                                                           |
| **Weighted-average cost**                                                                                     | FIFO or specific lots                              | The brief requires it. Its limitations are documented. A lots table can be added later because movements are stored, not totals.                                                                                                 |
| **Hand-written minimal service worker**                                                                       | `next-pwa` / Serwist                               | Full control so that authenticated HTML and data responses are never cached. One less dependency.                                                                                                                                |

## 2.8 Hosting and free-tier limits

These must be **re-checked against the providers' current pricing pages before deployment (Phase 8)** because they change.

- **Vercel Hobby:** free, for personal and non-commercial use only. It has limits on function execution time, bandwidth and invocations; a single-user app stays far below them. It has no SLA. Alternative: Cloudflare Workers/Pages using the OpenNext adapter.
- **Supabase Free:** a small database quota (500 MB at the time of writing, which is more than enough for decades of personal transactions) and a limited number of active free projects. **Projects are paused after about a week without activity** and must be resumed from the dashboard. The Free plan has **no point-in-time recovery and no downloadable automated backups**. For this project the app's own JSON and CSV export is the backup (see [data model §3.9](03-data-model.md#39-backup-restore-and-recovery)). Auth emails go through a rate-limited built-in sender; that is fine for one user.
- **GitHub:** the source code is public or private as you choose. Financial data, `.env` files and backups are **never** committed.

## 2.9 Environments

| Environment                  | Database                                                                                                           | Data                                           |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| CI and Claude Code container | Plain PostgreSQL 16 with a small `auth` shim (the `auth.uid()` and `authenticated` roles), with migrations applied | Synthetic fixtures only                        |
| Local development (your PC)  | Supabase CLI local stack (needs Docker Desktop) **or** a separate free "dev" Supabase project                      | `seed.dev.sql` demo data                       |
| Production                   | One Supabase Free project + Vercel                                                                                 | Your real data only. No seed is ever run here. |

`src/lib/env.ts` validates environment variables with Zod at startup and refuses to start if a value is missing or malformed. It also refuses to start if the service-role key would be exposed as `NEXT_PUBLIC_*`.
