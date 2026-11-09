# scripts/

## `migrate.mjs` — the suite migration runner

Canonical copy for every repo in the suite (SHARED-SPEC §3.3). Apps vendor it; don't edit it there.

```bash
DATABASE_URL=postgres://… node scripts/migrate.mjs [--seed] [--dry-run] [--skip <name>]… [--repo <key>]
```

1. Creates `ops.schema_migrations (repo, version, checksum, applied_at)` if missing.
2. Takes `pg_advisory_lock(424242)` so two runs never overlap.
3. Applies `db/core/*.sql` under the key `core`, then `db/migrations/*.sql` under the repo key
   (default: `package.json` `name`, here `openapphub`), in filename order, each file in its own transaction.
4. Skips files already recorded. **Fails** if a recorded file's checksum changed. Never edit an
   applied migration; add a new one.

| Flag            | Effect                                                                                                                                                                                     |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `--seed`        | Also runs `db/seed/*.sql` (recorded as `<repo>:seed`). **Staging only.**                                                                                                                   |
| `--dry-run`     | Prints the plan; changes nothing (apart from creating `ops` if missing).                                                                                                                   |
| `--skip <name>` | Skips a migration by file name, with or without `.sql`. Self-hosters skip the hub's billing with `--skip 0002_billing`. Skipped files aren't recorded, so they're skipped again next time. |
| `--repo <key>`  | Overrides the repo key.                                                                                                                                                                    |

Connection strings for GitHub Actions are the Supabase **Session pooler** strings (port 5432 on
the pooler host): runners can't reach the IPv6-only direct connection.

## DB tests

```bash
DATABASE_URL=postgres://… npm run db:test
```

Applies `db/tests/supabase_stub.sql` (no-op on real Supabase), runs the migrations, re-applies
`db/core` to prove it's idempotent, then runs `db/tests/[0-9]*.sql`. Use a throwaway database.

## `sync-shared.mjs` — copy shared code into an app

The hub holds the canonical `shared/`, `db/core/`, `scripts/migrate.mjs` and `docs/SHARED-SPEC.md`
(SHARED-SPEC §8). To update an app:

```bash
node scripts/sync-shared.mjs ../OpenBoardApp --dry-run   # see what would change
node scripts/sync-shared.mjs ../OpenBoardApp             # copy
```

It mirrors `shared/` (without the hub's tests) and `db/core/` (files removed here are removed
there), copies `scripts/migrate.mjs`, `scripts/check-shared.mjs` and `docs/SHARED-SPEC.md`, writes
`shared/MANIFEST.json` (a sha256 per file) and sets `"oahShared"` in the app's `package.json` to
`shared/VERSION`. Then open a PR in the app titled `chore: sync shared vX.Y.Z`.

In the app, CI runs `node scripts/check-shared.mjs`: it fails if a vendored file was edited by
hand, is missing, or if `oahShared` doesn't match `shared/VERSION`. Shared code is only ever
changed in the hub.
