# Local development

## Prerequisites

- Node.js 22 and pnpm 10 (`corepack enable` installs the pinned pnpm).
- A Supabase project for development, kept separate from production (see below).
- For database tests, one of:
  - **Any PostgreSQL 15+ server**, with `TEST_DATABASE_URL` pointing at it (CI uses a `postgres:17` container), or
  - **Linux, macOS or WSL:** `pnpm db:local:start` starts a throwaway cluster on port 54329 using the installed PostgreSQL binaries.
  - On Windows without WSL, install PostgreSQL 17 from postgresql.org and set `TEST_DATABASE_URL=postgres://postgres:<password>@localhost:5432/postgres`.

## First-time setup

```bash
pnpm install
cp .env.example .env.local          # then fill in the values (see below)
pnpm exec next telemetry disable    # Next.js build telemetry off on this machine
pnpm dev                            # http://localhost:3000
```

`NEXT_PUBLIC_*` values are **built into the app** when `next build` runs. Change them and you must rebuild. The server refuses to start if a variable is missing or malformed, or if a secret key has been put in a `NEXT_PUBLIC_*` variable.

## Supabase project setup (dev now; production in Phase 8)

1. Create a project at supabase.com and choose the region closest to you.
2. **Apply the migrations.** Either:
   - use the Supabase CLI: `supabase link --project-ref <ref>` and then `supabase db push`; or
   - paste each file from `supabase/migrations/` into the SQL editor, **in filename order**.

   Never change the schema by hand outside a migration.

3. **Authentication → Sign In / Providers:**
   - Email provider on, and **"Allow new users to sign up" off**. No public sign-up page exists, and nobody else should be able to create an account.
   - Turn on leaked-password protection and set a minimum password length of 12, if your plan offers these.
4. **Create your user:** Authentication → Users → _Add user_ → _Create new user_, with your email and a strong password, and "Auto confirm user" ticked. The database trigger creates your profile (PKR, Asia/Karachi) and default categories.
5. **Authentication → URL Configuration:** Site URL = `NEXT_PUBLIC_SITE_URL`. Redirect URLs = `http://localhost:3000/auth/confirm` (plus the production URL later).
6. **Authentication → Multi-Factor:** make sure TOTP is enabled. Then enrol your authenticator in the app under _Settings → Security_.
7. **Project Settings → API Keys:** copy the project URL and the **publishable** key (`sb_publishable_…`, or the legacy `anon` key) into `.env.local`. The **secret** key is not needed yet; it is only used later for permanent account deletion, and it never goes in a `NEXT_PUBLIC_` variable.
8. Optional, for nicer reset emails: in Authentication → Emails → _Reset Password_, point the link at
   `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/settings/security`.
   The default template also works; it uses the `?code=` flow, which `/auth/confirm` handles as well.

## Scripts

| Command                             | What it does                                                                                                                                           |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                          | Development server                                                                                                                                     |
| `pnpm build` / `pnpm start`         | Production build and server                                                                                                                            |
| `pnpm lint`                         | ESLint, including the domain-isolation import rules                                                                                                    |
| `pnpm typecheck`                    | Generates route types, then `tsc --noEmit` (strict)                                                                                                    |
| `pnpm format` / `pnpm format:check` | Prettier                                                                                                                                               |
| `pnpm test`                         | Unit and component tests (Vitest + React Testing Library)                                                                                              |
| `pnpm test:db`                      | Creates a fresh database `finance_track_test`, applies a small Supabase stand-in plus all migrations, then runs the RLS, isolation and invariant tests |
| `pnpm check:bundle`                 | After a build, fails if any privileged-key marker is in the browser bundle                                                                             |
| `pnpm check`                        | All of the above except `test:db`                                                                                                                      |

## How the database tests mimic Supabase

`tests/db/support/supabase-shim.sql` creates what the migrations expect from Supabase: the `anon`, `authenticated` and `service_role` roles; `auth.uid()` and `auth.jwt()` (which read `request.jwt.claims`, exactly as Supabase does); `auth.users` and `auth.mfa_factors`; and Supabase's **default grants**, so that the tests prove the migrations revoke them. `asUser()` in `tests/db/support/db.ts` switches to the `authenticated` role with a user's JWT claims, as PostgREST does for real requests. The shim is never applied to a real project.

## Project layout

See [architecture §2.3](02-architecture.md#23-directory-layout-planned). In this version of Next.js, request middleware lives in `src/proxy.ts` (it was renamed from `middleware.ts` in Next 16).
