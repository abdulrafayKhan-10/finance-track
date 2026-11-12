---
description: Run Finance Track's full verification (lint, types, unit, database, build, bundle) and report results
---

Run these in order from the repository root and report each result with the actual output summary. Stop and diagnose at the first failure; do not claim a step passed unless it ran.

1. `npx eslint .`
2. `npx next typegen && npx tsc --noEmit`
3. `npx vitest run --project unit --project component`
4. Database tests: if Postgres answers on 127.0.0.1:54329 run `npx vitest run --project db`. On Windows with PostgreSQL at `E:/PostgreSQL/17/bin`, start the throwaway cluster first: `E:/PostgreSQL/17/bin/pg_ctl -D .tmp/pgdata -o "-p 54329 -c listen_addresses=127.0.0.1" -l .tmp/pgdata/server.log -w start` (create it once with `initdb -D .tmp/pgdata -U postgres --auth=trust -E UTF8 --locale=C`), and stop it afterwards. If no Postgres is available, say the db tests were not run.
5. `npx next build`
6. `node scripts/check-client-bundle.mjs`

Ignore Prettier's CRLF-only warnings on Windows. Finish with a one-line summary per step.
