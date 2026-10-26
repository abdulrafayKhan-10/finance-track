# 4. Accounting rules and formulas

This document is the specification for `src/domain`. Each rule has a test ID (`ACC-*`) that the test suite refers to.

## 4.1 Sign convention

Every ledger line is signed **by its effect on net worth**:

- Asset account: `+` means money in, `−` means money out.
- Liability account (credit card, loan): `−` means more is owed, `+` means the debt is reduced.

**Account balance (as of date D)** = `opening_balance` + Σ line amounts with `occurred_on ≤ D` (and `occurred_on ≥ opening_date`).
For a liability the stored balance is ≤ 0. The UI shows it as a positive amount owed: _Credit card: owes Rs 12,500_. (ACC-BAL-1..4)

- **Working balance** includes pending and cleared lines. It is used everywhere by default.
- **Cleared balance** includes cleared lines only. It is used for reconciliation.

Opening balances: the user enters an amount owed on a liability as a positive number, and it is stored negated. An opening balance is **not** income.

## 4.2 Classification: what counts as income and expense

| kind               | Household income | Household expense | Investment income | Investment cost | Net-worth effect                                               |
| ------------------ | :--------------: | :---------------: | :---------------: | :-------------: | -------------------------------------------------------------- |
| income             |        ✔         |                   |                   |                 | +                                                              |
| expense            |                  |         ✔         |                   |                 | −                                                              |
| refund             |                  |   ✔ (negative)    |                   |                 | +                                                              |
| transfer           |                  |                   |                   |                 | 0 in a single currency; FX difference only otherwise (see 4.6) |
| adjustment         |                  |                   |                   |                 | ± (shown separately as "Adjustments")                          |
| opening_holding    |                  |                   |                   |                 | + value (like an opening balance)                              |
| buy                |                  |                   |                   |                 | value − cost, if valued                                        |
| sell               |                  |                   |                   |                 | proceeds − prior value                                         |
| dividend, interest |                  |                   |         ✔         |                 | +                                                              |
| investment_fee     |                  |                   |                   |        ✔        | −                                                              |
| split              |                  |                   |                   |                 | 0                                                              |

Rules:

- **ACC-TRF-1:** a transfer never appears in income or expense totals, in budgets, or in the category report.
- **ACC-INV-1:** a buy is an asset conversion (cash becomes holdings), not spending. A sell is an asset conversion, not income. Only the **realized gain** from a sell is investment profit.
- **ACC-INV-2:** moving cash into an investment account is a transfer (a _contribution_). It is not profit.
- **ACC-REF-1 (refund policy):** a refund is recorded against an **expense category** and reduces that category's spending in the month the refund is dated. It does not count as income. If it is linked to the original expense (`refund_of_id`), the UI shows the pair. Refunds in a category can make net spending negative for that month; this is shown as a credit and is not clamped to 0.
- **ACC-ADJ-1 (adjustment policy):** reconciliation corrections, write-offs and "found cash" are adjustments. They change balances and net worth, are excluded from income, expense and budgets, require a note, are audited, and appear as their own line in cash-flow reports.
- **ACC-CC-1 (credit-card policy):** a card purchase is an **expense on the purchase date** (a negative line on the card account) and counts towards the budget then. **Paying the card bill is a transfer** from the bank account to the card account, so it never counts as an expense. This prevents double counting.
- **ACC-LOAN-1:** a loan repayment is split by the user into a transfer for the principal (bank → loan) and an expense for the interest ("Loan interest" category).
- **ACC-PEND-1 (pending policy):** pending records are included in working balances and in reports, with a "pending" marker. They are excluded from the cleared balance used for reconciliation.
- **ACC-REC-1 (reconciliation):** cleared balance on the statement date = opening balance + Σ cleared lines dated on or before it. Difference = statement − cleared. An optional adjustment for the difference is dated on the statement date and is cleared. Reconciled transactions are locked (see data model §3.6).
- **ACC-ARCH-1 (archived accounts):** archived accounts accept no new postings; existing transactions on them stay editable. Closed accounts still accept postings (for final interest or fees).

## 4.3 Cash flow and savings rate (for a period P, in the reporting currency)

```
Income            = Σ income lines + Σ dividend lines + Σ interest lines              (converted, see 4.6)
Household spend   = −(Σ expense lines + Σ refund lines)                                (refunds reduce spend)
Net cash flow     = Income − Household spend
Savings rate      = Net cash flow ÷ Income        if Income > 0
                  = "not available"              if Income ≤ 0                         (ACC-SR-1: never ∞, NaN or 0 by default)
```

Investment fees, adjustments, transfers, buys and sells are reported in separate sections and are **not** part of the savings rate. The dashboard can still show "Invested this period" (net contributions to investment accounts) next to the savings rate.

## 4.4 Budgets

- **Actual eligible spending** for (month M, category C) = −Σ(expense and refund lines in C and its subcategories, dated in M), converted to the budget currency at each line's date (4.6).
- The **overall limit** uses all expense and refund lines in M.
- `Remaining = Budget − Actual`. `% used = Actual ÷ Budget` (budget > 0 is enforced). The status is _over_ when Actual > Budget and _warning_ at ≥ 85% (configurable).
- Transfers, buys and investment fees are never eligible (ACC-BUD-1). Lines whose conversion is unavailable are listed as "not counted: missing rate" and are never silently dropped (ACC-BUD-2).
- History compares the same category over the previous 6 or 12 months.

## 4.5 Savings goals

- **linked_account mode:** progress = the working balance of the linked account, converted to the goal currency at today's rate (or "unavailable"). The user cannot add allocations in this mode.
- **allocations mode:** progress = Σ allocations (earmarks). Allocations are a planning label on money that is already counted in an account. They **never** change balances or net worth (ACC-GOAL-1).
- If an account's total allocations exceed its current balance, the app warns about over-allocation (ACC-GOAL-2).
- `% = min(progress ÷ target, 100%)` is shown, and the raw progress is also kept. A goal is shown as _reached_ when progress ≥ target; it becomes _completed_ only when the user confirms.

## 4.6 Currency rules

- **Precision:** money is stored at 4 dp. User input is validated to the currency's minor units. Domain arithmetic uses `Decimal` at full precision. **Rounding happens once, when a result is presented or persisted**, using **ROUND_HALF_EVEN** to the currency's minor units (ACC-RND-1..3). Quantities are kept to 10 dp and prices to 10 dp.
- **Rate direction:** `exchange_rates(base, quote, rate, effective_on)` means 1 `base` = `rate` `quote`. To convert X from A to B: use a direct A→B rate (`X × rate`), otherwise the inverse B→A (`X ÷ rate`). There is **no triangulation in v1**.
- **Effective date:** a conversion for date D uses the rate with the greatest `effective_on ≤ D`. The result carries the rate and its date. A rate dated after D is never used (ACC-FX-1). If the rate used is older than 31 days, the figure is flagged "stale rate" but still used.
- **Historical rule:** each line is converted at **its own transaction date**. Balances and net worth _as of D_ convert at D's applicable rate. Today's rate is never used for history (ACC-FX-2).
- **Missing rate:** the domain returns `{ status: 'unavailable', original: Money }`. Totals then show the convertible part plus an explicit list of excluded original-currency amounts. Amounts in different currencies are **never** added nominally (ACC-FX-3).
- **Cross-currency transfer:** the two lines are in their own account currencies, and the implied rate is shown. It is not income or expense. In reporting-currency terms, any difference between the two converted legs is an **FX difference**, shown in net-worth change analysis, not in cash flow (ACC-FX-4).

## 4.7 Investments: weighted-average cost

A position is identified by **(investment account, asset)**. Movements are processed in order of `(occurred_on, created_at, id)`. All amounts are in the **asset currency**.

```
opening_holding(q, cost):  qty += q;  cost_basis += cost
buy(q, p, fee):            qty += q;  cost_basis += q×p + fee
sell(q, p, fee):           avg = cost_basis ÷ qty
                           removed = avg × q
                           realized += (q×p − fee) − removed
                           qty −= q;  cost_basis −= removed
                           if qty == 0: cost_basis = 0           (no residue on a full exit; ACC-WAC-3)
split(ratio as Δqty):      qty += Δqty; cost_basis unchanged      (avg cost per unit adjusts)
dividend / interest:       investment_income += amount            (does not change cost basis)
investment_fee:            fees += amount                          (does not change cost basis)
```

- Selling more than is held is rejected when the record is written (ACC-WAC-4).
- **Cash legs:** a buy or sell has one cash line in the paying or receiving account's currency. If that currency differs from the asset currency, the implied FX rate is shown. Cost basis is still tracked in the asset currency.
- **Limitations (documented for the user):** weighted average is not FIFO and may not match a broker's or tax authority's lot-based figures. Gains are measured in the asset currency. When they are converted to PKR, both value and cost use the valuation-date rate, so currency gains on the original cost are not separated out. There is no IRR or time-weighted return.

## 4.8 Valuations

- **Latest valuation as of D** = the valuation with the greatest `valued_on ≤ D`.
- `Estimated value = qty × unit_price`, labelled **"Manual valuation · dd MMM yyyy"**. It is never called a price or "live".
- **Unvalued positions** (no valuation on or before D, and `valuation_mode = manual`): value = _unavailable_. They are **excluded from portfolio value and net worth**, and the total shows a warning: "N holdings unvalued (cost basis Rs X, not included)". Cost is never shown as if it were value (ACC-VAL-1).
- `par` mode (only for cash_like and fixed_income): value = qty × 1, labelled "Par value (assumed)".
- Unrealized gain = estimated value − cost basis. It is only available when the position is valued (ACC-VAL-2). Realized and unrealized gains are always reported separately (ACC-INV-3).

## 4.9 Net worth

```
Assets      = Σ balance(asset-class accounts, include_in_net_worth)        # cash, bank, wallet, savings, other_asset, investment-account CASH
            + Σ estimated value(valued positions in investment accounts)
Liabilities = Σ |balance(liability-class accounts)|                        # cards, loans, other_liability
Net worth   = Assets − Liabilities
```

All amounts are converted to the reporting currency as of D (4.6).

No double counting, by construction (ACC-NW-1..3):

- An investment account's ledger lines hold only its **cash**. Its holdings appear only through positions. A buy moves value from the cash line to the position.
- Goal allocations are not assets.
- A physical asset (gold at home, a car) is either an `other_asset` _account_ with manual adjustments **or** an `asset` held in an investment-type account, never both. The UI guides the user towards using assets for anything that has a quantity.
- Holdings are never counted twice when one asset is held in two accounts, because each (account, asset) position is separate and the quantities do not overlap.

**Snapshots** store the computed figures plus every input used (balances, quantities, valuation and date, FX rate and date, unvalued and unconvertible items, `method_version`). Re-running the calculation for `as_of` against the same records reproduces the snapshot exactly (ACC-NW-4). The history chart combines stored snapshots with month-end values computed on demand, and labels which is which.

## 4.10 Dates and timezone

- A financial event has a **calendar date** (`date`) chosen by the user and interpreted in the profile timezone (Asia/Karachi, UTC+5, with no DST). There is no time-of-day.
- Months and years are calendar ranges on those dates: `[first day, last day]` inclusive.
- "Today" is computed in Asia/Karachi on the server (`dates.ts`) and never comes from the server's UTC date (ACC-DATE-1). This matters between 00:00 and 05:00 PKT.
- Audit timestamps are stored in UTC (`timestamptz`) and shown in the profile timezone.

## 4.11 Required invariants → tests

| ID     | Invariant                                             | Enforced by                                                   |
| ------ | ----------------------------------------------------- | ------------------------------------------------------------- |
| INV-1  | Internal transfers create no income or expense        | domain classification + tests                                 |
| INV-2  | A line cannot touch another user's account            | composite FK + RLS + cross-user tests                         |
| INV-3  | A transfer writes both legs or neither                | single RPC transaction + deferred shape trigger               |
| INV-4  | Contributions are not profit                          | classification (transfer) + tests                             |
| INV-5  | Unrealized ≠ realized                                 | separate domain outputs + tests                               |
| INV-6  | No nominal cross-currency sums                        | `Money` type refuses adding mismatched currencies (it throws) |
| INV-7  | Assets and liabilities are not double counted         | net-worth construction rules + tests                          |
| INV-8  | Edits and deletes do not corrupt balances             | derived balances + edit/delete tests                          |
| INV-9  | Historical and current valuations are distinguishable | as-of lookup + labels + tests                                 |
| INV-10 | A failed operation writes nothing                     | RPC atomicity + failure-injection tests                       |
