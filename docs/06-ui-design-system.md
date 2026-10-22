# 6. UI design system

## 6.1 Principles

Calm, dense where it helps (tables) and spacious where it helps (forms). Numbers come first: tabular figures, right-aligned, with signs and colours that never carry meaning alone.

## 6.2 Tokens (CSS variables, shadcn convention, light and dark)

- **Neutrals:** `--background`, `--foreground`, `--muted`, `--card`, `--border`.
- **Semantic:** `--primary` (teal), `--positive` (green), `--negative` (red), `--warning` (amber), `--info`. Every pair meets WCAG AA contrast in both themes.
- **Money:** positive amounts plain, negative amounts with a "−" sign **and** the negative colour. Liabilities read as "owes Rs X".
- **Type:** Inter (self-hosted) with `font-variant-numeric: tabular-nums` for all figures. Scale 12/14/16/20/24/30.
- **Spacing:** a 4px grid. Radius 0.5rem. Touch targets ≥ 44×44px.
- **Theme:** system, light or dark, stored in the profile with a cookie fallback, applied before paint so there is no flash.

## 6.3 Formatting

- `formatMoney(Money)` uses international grouping by default (`Rs 1,250,000.00`), because `en-PK` grouping output differs between browsers. Lakh/crore grouping (`12,50,000.00`) is an opt-in setting with its own tested formatter.
- Every converted figure gets a tooltip showing the original amount, the rate and the rate date. Unavailable conversions show "—" with an explanation.
- Valuation figures carry a "Manual valuation · date" badge.

## 6.4 Layout

- **Desktop (≥ 1024px):** collapsible left sidebar with the 10 modules, a top bar with the period picker and a quick-add button.
- **Mobile:** a bottom navigation bar with 5 items (Dashboard, Transactions, **+ Add**, Investments, More). Tables turn into card lists. Charts use reduced axes and tap tooltips. Forms are single-column with native date and number keyboards (`inputmode="decimal"`).
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
