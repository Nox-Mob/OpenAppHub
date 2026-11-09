#!/usr/bin/env bash
# Runs the core + hub migrations and the SQL tests against DATABASE_URL.
# Plain Postgres works (a Supabase stub is applied first); so does `supabase start`.
# Usage: DATABASE_URL=postgres://… bash db/tests/run.sh
set -euo pipefail
cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?DATABASE_URL is not set}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/tests/supabase_stub.sql
# An account that exists before the core migrations (signed up before the first
# migration ran): 0002 must backfill its profile. Triggers are off for this insert.
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "set session_replication_role = replica; insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e1', 'early@example.org', '{\"full_name\":\"Early Bird\"}') on conflict (id) do nothing;"
node scripts/migrate.mjs
# Run the migrations twice: core SQL must be idempotent when re-applied by hand.
for f in db/core/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/tests/_helpers.sql

status=0
for f in db/tests/[0-9]*.sql; do
  echo "── $f"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; then status=1; fi
done
exit $status
