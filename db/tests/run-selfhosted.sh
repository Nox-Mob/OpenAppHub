#!/usr/bin/env bash
# Self-hosting check: the core SQL must work on a database that has no hub and
# no billing (a self-hosted single-app database). Applies db/core only, through
# the runner with the hub's migrations skipped, then runs the core tests.
#
# Usage: DATABASE_URL=postgres://… bash db/tests/run-selfhosted.sh   (empty throwaway DB)
set -euo pipefail
: "${DATABASE_URL:?DATABASE_URL is not set}"

psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/tests/supabase_stub.sql
# An account that exists before core is applied (profile backfill test).
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -c "set session_replication_role = replica; insert into auth.users (id, email, raw_user_meta_data) values ('00000000-0000-0000-0000-0000000000e1', 'early@example.org', '{\"full_name\":\"Early Bird\"}') on conflict (id) do nothing;"
skips=()
for f in db/migrations/*.sql; do skips+=(--skip "$(basename "$f" .sql)"); done
node scripts/migrate.mjs "${skips[@]}"
# Re-apply by hand: core must be idempotent.
for f in db/core/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f" >/dev/null; done
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/tests/_helpers.sql

for schema in hub billing; do
  if [ "$(psql "$DATABASE_URL" -tAc "select count(*) from pg_namespace where nspname = '$schema'")" != "0" ]; then
    echo "FAILED: schema $schema exists on the self-hosted database"; exit 1
  fi
done
if [ "$(psql "$DATABASE_URL" -tAc "select billing_enabled from public.instance_settings")" != "f" ]; then
  echo "FAILED: billing is on without the billing migration"; exit 1
fi

status=0
for f in db/tests/[0-9]*.sql; do
  # Hub-only tests need the hub's own migrations.
  if grep -qE '\b(hub|billing)\.[a-z_]+|hub_[a-z_]+\(' "$f"; then
    echo "── $f (hub only, skipped)"; continue
  fi
  echo "── $f"
  if ! psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f "$f"; then status=1; fi
done
exit $status
