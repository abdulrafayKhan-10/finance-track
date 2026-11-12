@AGENTS.md

## Claude Code specifics

- Folder-scoped rules load automatically from `.claude/rules/` when you work in those folders.
- Reviewers: ask for the `accounting-reviewer` agent after changing money logic, and the `migration-reviewer` agent after writing SQL.
- Commands: `/check` runs the full verification, `/new-migration` walks through a schema change, `/e2e` runs the browser suite safely.
- Never run E2E or isolation tests against a project the owner calls production; the suite refuses when `PRODUCTION_SUPABASE_URL` matches.
