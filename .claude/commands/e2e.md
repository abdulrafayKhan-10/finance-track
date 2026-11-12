---
description: Build and run the Playwright E2E and real-Supabase isolation suites against the DEV project, then review screenshots
---

1. Confirm `.env.local` points at the dev project (never the one the owner calls production). The suite refuses if `PRODUCTION_SUPABASE_URL` matches.
2. `npx next build`, then `npx playwright test --reporter=list`. First run on a machine: `npx playwright install chromium`.
3. If a test fails, read `test-results/e2e/<test>/error-context.md` and the screenshot before changing anything. Decide whether the app or the test is wrong; fix the app when a real person would hit the problem.
4. Look at the phone screenshots in `test-results/e2e/screens-*-mobile/` for layout problems the assertions can't catch.
5. Report: tests passed/failed (quote the summary line), what you fixed, and confirm no `ft-…@example.com` users were left behind (global setup deletes leftovers).
