---
paths:
  - "src/app/**"
  - "src/components/**"
  - "src/app/globals.css"
---

# UI rules

- Pages: `await requireUser()` first; data from `src/features/*/queries.ts`, writes via `src/features/*/actions.ts`. Never import `src/data` (ESLint enforces).
- Server components by default; `"use client"` only for interactivity. Pass plain values (strings, ids) to client components, not `Money`/`Dec` objects, unless the component formats them on the server side.
- Design system (docs/06-ui-design-system.md, "Treasury"): tokens in `globals.css` only. Use `bg-background`, `bg-card`, `text-ink`, `text-muted-foreground`, `text-positive` / `text-negative`, `text-brass` (investments only), `border-border`. No raw hex or arbitrary colours in components.
- Type: `font-display` (Bricolage Grotesque) for page titles and headline figures; body is Public Sans. Figures use `.tabular`. Never all-caps labels.
- Amounts: always `<Amount money={…} />`; negatives get a minus sign as well as colour.
- Forms: `FormField` / `SelectField` / `CheckboxField`, `useActionForm` so input survives server errors, `SubmitButton` with a pending label, `FormMessage` for outcomes. Buttons say what happens.
- Destructive actions: `ConfirmAction` naming the record; bulk deletes need typed confirmation.
- Layout: mobile first; no sideways scroll at 360 px; content keeps `pb-28` for the bottom nav on small screens; tables get a card list on mobile.
- Accessibility: visible focus ring, labels on every control, `aria-current` on nav, charts have a table alternative, reduced motion respected.
- New pages go into `e2e/screens.spec.ts`.
