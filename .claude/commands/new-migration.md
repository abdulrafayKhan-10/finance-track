---
description: Add a Finance Track database change the safe way (migration, types, repository, tests, backup coverage)
argument-hint: <what the change is for>
---

Change requested: $ARGUMENTS

Follow `.claude/rules/database.md` and the "Add a field or table" recipe in `AGENTS.md`:

1. Read the latest migrations in `supabase/migrations/` to find the next number and the conventions in use. Never edit an existing migration.
2. Write `supabase/migrations/<date>0000<NN>_<name>.sql` with RLS, grants, audit and constraints.
3. Add `tests/db/<topic>.test.ts`: invariants with exact SQLSTATEs and a cross-user test. Run `npx vitest run --project db` against the local Postgres (see `/check`).
4. Update `src/data/supabase/database.types.ts`, then the repository and feature code.
5. If the table holds user data: extend `BACKUP_TABLES`, `restore_backup`, `delete_my_data` (in the same new migration) and `e2e/isolation.spec.ts`.
6. Update `docs/03-data-model.md`.
7. Ask the `migration-reviewer` agent to review.
8. Write a paste-ready copy to the owner's Desktop wrapped in `begin; … insert into supabase_migrations.schema_migrations (version, name) values (…) on conflict do nothing; commit;` and tell them to run it in the Supabase SQL Editor.
