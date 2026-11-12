---
paths:
  - "src/domain/**"
  - "tests/unit/domain/**"
---

# Domain rules (money and accounting)

- Pure TypeScript only: no React, Next, Supabase, `@/data`, `@/features`, `@/components` (ESLint enforces).
- Money is `Money` (amount + currency); quantities, prices and rates are `Dec`. Build them from strings with `dec()` / `Money.of()`; never from JS numbers.
- `Money` throws when currencies differ. Convert with `convert` / `sumConverted` from `src/domain/fx` at the event's own date; amounts with no rate go into an `excluded` list, never into a total.
- Round only at the edge (`toFixed()` / `toStorage()` / `rounded()`), half-even.
- Every formula has an `ACC-*` / `INV-*` reference in `docs/04-accounting-rules.md`. Change the doc first, then the code, then a test named after the rule.
- Investments: weighted-average cost per (account, asset) position, movements in ledger order `(occurred_on, created_at, transaction id, id)`; unvalued holdings are excluded and listed, never valued at cost.
- If the net-worth calculation changes, bump `NET_WORTH_METHOD_VERSION` (snapshots record it).
- Tests: fixtures in `tests/unit/support/ledger-builder.ts`; assert with `.equals(Money.of(...))`, not string compares of floats.
