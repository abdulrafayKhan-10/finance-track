# 6. UI design system

## 6.1 Direction: "Treasury"

The app is a private ledger for money held in rupees, gold and shares, so its look comes from banknotes and ledgers: treasury-green ink on cool paper, brass for gold and investments, and the fine engraved line pattern (guilloche) used in security printing.

- **One bold element.** Net worth is printed on an ink "note" with the engraving in its lower field (dashboard), and the same ink panel frames sign-in. Everything else stays quiet: paper background, white panels with hairline borders, no drop shadows, no gradients.
- **Numbers first.** Tabular figures, right-aligned in tables, a minus sign as well as colour for negatives, headline figures in the display face.
- **Calm, dense where it helps** (tables, lists) and spacious where it helps (forms).
- **Brass means investments.** It is not a general accent; using it elsewhere dilutes the meaning.

## 6.2 Tokens (`src/app/globals.css`, light and dark)

| Token                             | Light                | Dark              | Use                                 |
| --------------------------------- | -------------------- | ----------------- | ----------------------------------- |
| `background`                      | #F4F7F5 paper        | #0E1A16           | page                                |
| `card`                            | #FFFFFF              | #14231E           | panels, inputs                      |
| `foreground` / `muted-foreground` | #15241F / #53635D    | #E5EEE9 / #9DB1A9 | text                                |
| `primary`                         | #123C33 treasury ink | #8FD0B5           | actions, links, focus               |
| `sidebar`, `note`                 | #123C33              | #0A1411, #123A30  | the ink panels                      |
| `brass` / `brass-foreground`      | #A8781E / #7A560F    | #D6AB55 / #E4C072 | investments only                    |
| `positive` / `negative`           | #23744A / #B3402E    | #6CC993 / #EF8C79 | gains, money in / losses, money out |
| `warning`                         | #8F6512              | #E2B65A           | stale rates, unvalued holdings      |
| `series-1` / `series-2`           | #1F6F5C / #B07A1E    | #5DBB97 / #D9A445 | the two chart series                |

Every text/background pair meets WCAG AA in both themes (checked when the palette was set; re-check when changing a token).

- **Type:** Public Sans (body, forms, tables; clear tabular figures) and Bricolage Grotesque (`font-display`: page titles, section headings, headline amounts), both self-hosted via `next/font`. Sentence case everywhere; no all-caps labels.
- **Radius hierarchy:** the note 1.25rem (`rounded-note`), panels `rounded-xl`, controls `rounded-md`.
- **Spacing:** a 4px grid. Touch targets ≥ 44×44px on touch layouts.
- **Theme:** system, light or dark (`next-themes`), applied before paint.
- **Signature component:** `src/components/figures/guilloche.tsx` (deterministic SVG, decorative, `aria-hidden`). Never place it behind text that must be read.

## 6.3 Formatting

- `formatMoney(Money)` uses international grouping by default (`Rs 1,250,000.00`), because `en-PK` grouping output differs between browsers. Lakh/crore grouping (`12,50,000.00`) is an opt-in setting with its own tested formatter.
- Every converted figure gets a tooltip showing the original amount, the rate and the rate date. Unavailable conversions show "—" with an explanation.
- Valuation figures carry a "Manual valuation · date" badge.

## 6.4 Layout

- **Desktop (≥ 1024px):** a deep-ink sidebar with the modules (the current one marked by a lighter panel and a brass edge) beside paper content.
- **Mobile:** an ink top bar (matching the status-bar colour) and a bottom navigation bar with 5 items (Dashboard, Transactions, Accounts, Investments, More). Tables turn into card lists. Charts use reduced axes and tap tooltips. Forms are single-column with native date and number keyboards (`inputmode="decimal"`).
- Safe-area insets are respected for PWA standalone mode on iOS and Android.

## 6.5 Components and states

- shadcn/ui primitives: Button, Input, Select, Combobox, Dialog/AlertDialog (destructive confirmations), Sheet (mobile forms), Table, Tabs, Badge, Toast (sonner), Skeleton, Card, Calendar/DatePicker, Form.
- Every data view has **loading** (a skeleton that matches the layout), **empty** (an explanation plus a primary action), **error** (a safe message plus retry) and **success** states (a toast confirming the action).
- Destructive actions use an AlertDialog that names the record. Bulk or import deletes require typing a confirmation.
- Accessibility: labelled inputs, error text linked with `aria-describedby`, focus-visible rings, keyboard navigation everywhere, charts paired with a data table or summary text, and `prefers-reduced-motion` respected.

## 6.6 PWA

- `app/manifest.ts`: name, short_name, `display: standalone`, theme and background colours, 192/512/maskable icons, `start_url: /`.
- `public/sw.js`: precache hashed `/_next/static/*`, icons and `/offline`. Navigation is **network-only**, with the offline page as fallback. Nothing authenticated is cached. The cache is versioned and old caches are purged on activate.
- The offline page says: "You're offline. Finance Track needs a connection to load your data." There is no offline data entry in v1.
