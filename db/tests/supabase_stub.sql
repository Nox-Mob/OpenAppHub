-- Minimal stand-in for the parts of Supabase that core SQL relies on, so the
-- migrations and DB tests also run on plain Postgres (CI). Every statement is
-- guarded: on a real Supabase database (`supabase start`) this changes nothing.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;

create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email varchar(255),
  email_confirmed_at timestamptz,
  raw_user_meta_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);
-- Present on real Supabase; added here for the stub.
alter table auth.users add column if not exists banned_until timestamptz;

do $$
begin
  if to_regprocedure('auth.uid()') is null then
    create function auth.uid() returns uuid language sql stable as $f$
      select nullif(
        coalesce(
          current_setting('request.jwt.claim.sub', true),
          current_setting('request.jwt.claims', true)::jsonb ->> 'sub'
        ),
        ''
      )::uuid
    $f$;
    grant execute on function auth.uid() to anon, authenticated, service_role;
  end if;
end
$$;
