---
paths:
  - "supabase/**"
  - "tests/db/**"
  - "src/data/**"
---

# Database rules

- Never edit an existing migration; add `supabase/migrations/YYYYMMDD0000NN_<name>.sql` with the next number.
- New user table checklist: `user_id uuid not null default auth.uid() references auth.users on delete cascade`; `unique (id, user_id)`; composite FKs `(x_id, user_id)`; `enable` + `force row level security`; restrictive `<t>_mfa` policy with `app_private.aal_ok()`; select/insert/update/delete policies on `(select auth.uid())`; `revoke all … from authenticated` then explicit grants; audit trigger `app_private.audit_row()`; `updated_at` trigger if it has the column.
- Functions: `language plpgsql security invoker set search_path = ''`, fully qualified names (`public.x`, `app_private.y`), revoke from `public, anon`, grant execute to `authenticated`. Raise `FT0xx` codes and add new ones to `src/lib/errors.ts`.
- Every `DELETE`/`UPDATE` in a function needs a `WHERE` (Supabase’s `pg_safeupdate` refuses bare ones; local Postgres doesn’t). Prefer `where user_id = auth.uid()`.
- Triggers that fire during a user deletion cascade must be `security definer` (Supabase deletes users as `supabase_auth_admin`).
- New tables that hold user data must also be added to: `BACKUP_TABLES` in `src/lib/backup.ts`, `restore_backup` and `delete_my_data` (new migration), `e2e/isolation.spec.ts`.
- Reads that can exceed 1,000 rows use `fetchAll` with an order ending in a unique key.
- Numerics are selected as text (`col::text`); dates and timestamps too when exact round-trips matter.
- Update `src/data/supabase/database.types.ts` by hand after schema changes.
- Tests: `tests/db/*.test.ts` with `asUser` / `asAdmin` / `rpc` / `errorCode` from `tests/db/support/db.ts`. Every invariant gets a test that expects the exact SQLSTATE, plus a cross-user test.
- The owner applies migrations in the Supabase SQL Editor: when you add one, say so and offer a paste-ready file.
