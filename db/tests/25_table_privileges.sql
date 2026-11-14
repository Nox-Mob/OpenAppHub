-- Core 0020: the API roles hold no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN on any table in the
-- schemas the API reaches, including tables created after the migration.
begin;
do $$
declare
  v_bad text;
  v_maintain boolean := current_setting('server_version_num')::int >= 170000;
begin
  create table public._priv_probe (id int primary key);
  select string_agg(format('%s %s.%s', g.grantee, n.nspname, c.relname), ', ') into v_bad
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  cross join (values ('anon'), ('authenticated')) g(grantee)
  where c.relkind in ('r', 'p', 'v', 'm')
    and n.nspname in ('public', 'hub', 'billing')
    and (has_table_privilege(g.grantee, c.oid, 'TRUNCATE')
      or has_table_privilege(g.grantee, c.oid, 'REFERENCES')
      or has_table_privilege(g.grantee, c.oid, 'TRIGGER')
      or (v_maintain and has_table_privilege(g.grantee, c.oid, 'MAINTAIN')));
  perform tests.ok(v_bad is null, 'no TRUNCATE, REFERENCES, TRIGGER or MAINTAIN for the API roles: ' || coalesce(v_bad, 'none'));
end $$;
rollback;
