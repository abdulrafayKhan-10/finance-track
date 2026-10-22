# 1. Product requirements

## 1.1 Purpose

This is a private web application (installable as a PWA) that one person uses to record their finances by hand and to answer these questions:

- How much am I worth, and how has that changed?
- Where did my money go this month, and am I within budget?
- What do my investments cost, what are they worth by my own latest valuation, and what have I gained or lost?
- Am I on track for my savings goals?

The application must open the same data on a Windows PC and on a phone.

## 1.2 Fixed product decisions

| Area       | Decision                                                                                                                                                     |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Data entry | Entirely manual. CSV import and export are supported. No bank APIs or aggregators.                                                                           |
| Prices     | Manual valuations only. No live prices. Valuations are never labelled real-time. The model allows a price provider to be added later.                        |
| Storage    | Private cloud PostgreSQL (Supabase) with Row Level Security. Data syncs because every device reads the same database.                                        |
| Offline    | Online-first. The PWA can be installed but does not store financial data offline. Full offline support is not claimed.                                       |
| Users      | One personal user in v1. Public sign-up is disabled after the owner account is created. The schema is still multi-user safe so that isolation can be tested. |
| Defaults   | Reporting currency PKR, timezone Asia/Karachi. Other currencies are supported.                                                                               |
| Cost       | No paid service is needed for core functionality.                                                                                                            |

## 1.3 Modules and must-have capabilities

### Dashboard

- Net worth, split into cash and liabilities versus investment valuations.
- Liquid cash and bank total. Income, expenses, net cash flow and savings rate for a chosen period.
- Portfolio value (manual valuations), showing the oldest valuation date used.
- Recent transactions, spending by category, account balances, budget progress, goal progress and the net-worth trend.
- Every figure is calculated from stored records. Demo data exists only in development.

### Transactions

- Create, view, edit and delete income, expenses, refunds, transfers, adjustments and investment transactions (buy, sell, dividend, interest, fee, split, opening holding).
- Fields: amount and currency (the account's currency), date, category and subcategory, accounts, description, notes, tags, and created/updated timestamps.
- Search, sort, filters (date range, account, category, kind, tag, status) and keyset pagination.
- Category management.
- CSV import with column mapping, full validation before saving, duplicate detection and an all-or-nothing commit.
- CSV export.
- Confirmation before any destructive action. Loading, empty and error states.

### Accounts

- Types: cash, bank, digital wallet, savings, investment, credit card, loan, other asset and other liability.
- Fields: name, type, currency, opening balance, opening date, institution (a label only), notes and status (active, closed or archived).
- Balances are derived from the opening balance plus ledger lines; they are never stored separately.
- Reconciliation against a statement balance, with optional adjustment and an audit history.
- No credentials, card security codes or banking passwords are stored, and the UI does not ask for them.

### Budgets

- Monthly budget per category and an optional overall monthly limit.
- Shows budgeted, actual eligible spending, remaining, % used, over-budget warnings and comparison with previous months.

### Savings goals

- Name, description, target amount and currency, target date, status and completion.
- Either linked to an account (progress = that account's balance) or funded by explicit allocations (earmarks with history). These are never added to net worth.

### Investments

- Asset categories: stocks/ETFs, funds, gold, crypto, fixed income, cash-like and custom.
- Manual transactions and manual valuations with dated history.
- Quantity, cost basis (weighted average), latest valuation and date, estimated value, unrealized and realized gain or loss, dividends and interest, fees, allocation and history.

### Assets, liabilities and net worth

- Net worth = assets − liabilities, using explicit inclusion rules (see [accounting rules](04-accounting-rules.md)).
- Reproducible snapshots that store the valuation dates and exchange rates they used.

### Reports and exports

- Monthly and yearly income and expenses, cash flow, savings rate, spending by category, budget performance, account balances, portfolio allocation, gains, and dividends and interest.
- Date filters and CSV export for every report.
- A full structured JSON backup and a tested restore.

### Settings

- Profile, reporting currency, timezone, theme, categories, exchange rates, security (password and TOTP MFA), data export, backup, restore and account deletion.

## 1.4 Non-goals for v1

- Bank connections, aggregators, automatic payments, trading and live prices.
- External AI analysis, third-party analytics and telemetry.
- Full offline editing and sync.
- Multi-user households or shared accounts.
- Tax computation, FIFO/specific-lot cost basis, and money-weighted or time-weighted returns (IRR/TWR).
- Recurring transactions. This is an optional later item; if it is built, it is tested (see the checklist).

## 1.5 Definition of done (initial personal use)

The owner can sign in securely; record transactions; manage accounts; transfer money; track budgets; record every supported investment category with manual valuations; see net worth; review reports; export data; and see the same records on a PC and a phone. Critical accounting tests pass, cross-user isolation is verified, backup and restore are documented and tested, and the deployed application has been checked on both devices.
