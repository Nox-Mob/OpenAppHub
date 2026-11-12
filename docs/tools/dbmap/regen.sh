#!/usr/bin/env bash
# Regenerate docs/database-map.md from a database built by every repo's migrations.
# Usage: DATABASE_URL=postgres://… bash docs/tools/dbmap/regen.sh
# Build the database first (a throwaway local Postgres): the hub's db/tests/supabase_stub.sql,
# then `node scripts/migrate.mjs` in OpenAppHub, OpenCharterApp, OpenLedgerApp, OpenBoardApp.
# Never point it at production (it only reads, but there's no reason to).
set -euo pipefail
cd "$(dirname "$0")"
: "${DATABASE_URL:?DATABASE_URL is not set}"
S="'public','hub','billing','charter','board','ledger'"
q() { psql "$DATABASE_URL" -qtA -F $'\t' -c "$1"; }
q "select c.table_schema, c.table_name, c.column_name, c.ordinal_position,
  case when c.data_type='USER-DEFINED' then c.udt_name when c.data_type='ARRAY' then replace(c.udt_name,'_','')||'[]' else c.data_type end,
  c.is_nullable, coalesce(c.column_default,'')
from information_schema.columns c join information_schema.tables t on t.table_schema=c.table_schema and t.table_name=c.table_name and t.table_type='BASE TABLE'
where c.table_schema in ($S) order by 1,2,4" > cols.tsv
q "select n1.nspname, c1.relname, (select string_agg(a.attname, ',' order by k.ord) from unnest(con.conkey) with ordinality k(n,ord) join pg_attribute a on a.attrelid=con.conrelid and a.attnum=k.n),
  n2.nspname, c2.relname, con.confdeltype
from pg_constraint con join pg_class c1 on c1.oid=con.conrelid join pg_namespace n1 on n1.oid=c1.relnamespace
join pg_class c2 on c2.oid=con.confrelid join pg_namespace n2 on n2.oid=c2.relnamespace
where con.contype='f' and n1.nspname in ($S) order by 1,2,3" > fks.tsv
q "select n.nspname, c.relname, a.attname from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace join pg_attribute a on a.attrelid=c.oid and a.attnum = any(i.indkey) where i.indisprimary and n.nspname in ($S)" > pks.tsv
q "select n.nspname, c.relname, (select string_agg(a.attname, ',') from pg_attribute a where a.attrelid=c.oid and a.attnum = any(i.indkey)) from pg_index i join pg_class c on c.oid=i.indrelid join pg_namespace n on n.oid=c.relnamespace where i.indisunique and not i.indisprimary and n.nspname in ($S)" > uniq.tsv
q "select n.nspname, c.relname, coalesce(obj_description(c.oid),'') from pg_class c join pg_namespace n on n.oid=c.relnamespace where c.relkind in ('r','v') and n.nspname in ($S)" > comments.tsv
python3 gen.py spec.json > generated.md
python3 assemble.py
rm -f cols.tsv fks.tsv pks.tsv uniq.tsv comments.tsv generated.md
