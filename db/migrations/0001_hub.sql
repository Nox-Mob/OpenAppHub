-- OpenAppHub hub schema (AGENTS steps 10, 16, 17; SHARED-SPEC §3.1, §11).
-- Hub-only: self-hosted apps never get this file (it lives in db/migrations,
-- not db/core). The `hub` schema is not exposed to the Data API; the few things
-- the hub's screens need are definer functions in `public`, prefixed hub_, that
-- check the caller's rights themselves.

create schema if not exists hub;
revoke all on schema hub from public, anon, authenticated;
grant usage on schema hub to service_role;

-- Where this database runs. Set to 'staging' by db/seed (staging only); stays
-- null on production, which keeps demo tools off there.
create table if not exists hub.instance (
  id boolean primary key default true check (id),
  environment text check (environment in ('production', 'staging', 'development'))
);
insert into hub.instance (id) values (true) on conflict (id) do nothing;

-- Waitlist (sign-ups closed) ---------------------------------------------------

create table if not exists hub.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique
    check (email = lower(btrim(email)) and char_length(email) <= 254 and email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  source text check (source is null or char_length(source) <= 100),
  created_at timestamptz not null default now()
);

-- Terms and privacy acceptance ----------------------------------------------------

create table if not exists hub.legal_acceptances (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  version text not null,
  accepted_at timestamptz not null,
  unique (user_id, document, version)
);

-- Sign-up sends terms_accepted_at / privacy_accepted_at (and the version) in the
-- user's metadata; this records them. Version defaults to the sign-up date.
create or replace function hub.record_legal_acceptance()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_doc text;
  v_at timestamptz;
begin
  foreach v_doc in array array['terms', 'privacy'] loop
    begin
      v_at := (v_meta ->> (v_doc || '_accepted_at'))::timestamptz;
    exception when others then
      v_at := null;
    end;
    if v_at is not null then
      insert into hub.legal_acceptances (user_id, document, version, accepted_at)
      values (
        new.id,
        v_doc,
        coalesce(nullif(v_meta ->> 'legal_version', ''), to_char(v_at at time zone 'UTC', 'YYYY-MM-DD')),
        v_at
      )
      on conflict (user_id, document, version) do nothing;
    end if;
  end loop;
  return new;
end;
$$;

drop trigger if exists hub_record_legal_acceptance on auth.users;
create trigger hub_record_legal_acceptance
  after insert on auth.users
  for each row execute function hub.record_legal_acceptance();

-- Accounts created before this migration.
insert into hub.legal_acceptances (user_id, document, version, accepted_at)
select u.id, d.doc, to_char((u.raw_user_meta_data ->> (d.doc || '_accepted_at'))::timestamptz at time zone 'UTC', 'YYYY-MM-DD'),
       (u.raw_user_meta_data ->> (d.doc || '_accepted_at'))::timestamptz
from auth.users u
cross join (values ('terms'), ('privacy')) as d(doc)
where u.raw_user_meta_data ->> (d.doc || '_accepted_at') ~ '^\d{4}-\d{2}-\d{2}T'
on conflict (user_id, document, version) do nothing;

-- Audit of core tables (AGENTS step 16) ---------------------------------------------
-- No foreign key to organizations: the record of a deleted org is kept.

create table if not exists hub.audit_log (
  id bigint generated always as identity primary key,
  org_id uuid,
  actor uuid,
  action text not null check (action in ('insert', 'update', 'delete')),
  table_name text not null,
  row_key text,
  old_data jsonb,
  new_data jsonb,
  at timestamptz not null default now()
);
create index if not exists audit_log_org_at_idx on hub.audit_log (org_id, at desc);

create or replace function hub.audit_core_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_row jsonb := coalesce(v_new, v_old);
  v_org uuid;
  v_key text;
begin
  -- Never copy invitation token hashes into the log.
  v_old := v_old - 'token_hash';
  v_new := v_new - 'token_hash';
  if tg_table_name = 'organizations' then
    v_org := (v_row ->> 'id')::uuid;
    v_key := v_row ->> 'id';
  elsif tg_table_name = 'memberships' then
    v_org := (v_row ->> 'org_id')::uuid;
    v_key := v_row ->> 'user_id';
  else
    v_org := (v_row ->> 'org_id')::uuid;
    v_key := v_row ->> 'id';
  end if;
  if tg_op = 'UPDATE' and v_old = v_new then
    return null;
  end if;
  insert into hub.audit_log (org_id, actor, action, table_name, row_key, old_data, new_data)
  values (v_org, auth.uid(), lower(tg_op), tg_table_name, v_key, v_old, v_new);
  return null;
end;
$$;

drop trigger if exists hub_audit on public.organizations;
create trigger hub_audit after insert or update or delete on public.organizations
  for each row execute function hub.audit_core_row();
drop trigger if exists hub_audit on public.memberships;
create trigger hub_audit after insert or update or delete on public.memberships
  for each row execute function hub.audit_core_row();
drop trigger if exists hub_audit on public.invitations;
create trigger hub_audit after insert or update or delete on public.invitations
  for each row execute function hub.audit_core_row();

-- Platform operators and demo organizations (staging only, AGENTS step 17) ----------

create table if not exists hub.platform_operators (
  user_id uuid primary key references auth.users (id) on delete cascade,
  note text,
  added_at timestamptz not null default now()
);

create table if not exists hub.demo_orgs (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

alter table hub.instance enable row level security;
alter table hub.waitlist enable row level security;
alter table hub.legal_acceptances enable row level security;
alter table hub.audit_log enable row level security;
alter table hub.platform_operators enable row level security;
alter table hub.demo_orgs enable row level security;
grant all on all tables in schema hub to service_role;

-- Functions the hub's screens call (public, definer, each checks the caller) ---------

create or replace function public.hub_join_waitlist(p_email text, p_source text default null)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  insert into hub.waitlist (email, source)
  values (v_email, left(nullif(btrim(coalesce(p_source, '')), ''), 100))
  on conflict (email) do nothing;
end;
$$;

create or replace function public.hub_org_audit(p_org uuid, p_limit int default 100, p_before bigint default null)
returns table (
  id bigint,
  at timestamptz,
  actor uuid,
  actor_name text,
  action text,
  table_name text,
  row_key text,
  old_data jsonb,
  new_data jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can see the audit log.' using errcode = '42501';
  end if;
  return query
    select a.id, a.at, a.actor, coalesce(p.display_name, 'Someone'), a.action, a.table_name, a.row_key,
           a.old_data, a.new_data
    from hub.audit_log a
    left join public.profiles p on p.id = a.actor
    where a.org_id = p_org and (p_before is null or a.id < p_before)
    order by a.id desc
    limit least(greatest(coalesce(p_limit, 100), 1), 500);
end;
$$;

create or replace function public.hub_is_platform_operator()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from hub.platform_operators o where o.user_id = auth.uid());
$$;

create or replace function public.hub_demo_tools_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select environment = 'staging' from hub.instance where id), false)
     and exists (select 1 from hub.platform_operators o where o.user_id = auth.uid());
$$;

create or replace function public.hub_create_demo_org(p_name text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if not public.hub_demo_tools_enabled() then
    raise exception 'Demo organizations can only be created by platform operators on staging.' using errcode = '42501';
  end if;
  v_org := public.create_organization(p_name);
  insert into hub.demo_orgs (org_id, created_by) values (v_org, auth.uid());
  return v_org;
end;
$$;

create or replace function public.hub_delete_demo_org(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.hub_demo_tools_enabled() then
    raise exception 'Only platform operators on staging can delete demo organizations.' using errcode = '42501';
  end if;
  if not exists (select 1 from hub.demo_orgs d where d.org_id = p_org) then
    raise exception 'That isn''t a demo organization.' using errcode = '22023';
  end if;
  delete from public.organizations where id = p_org;
end;
$$;

create or replace function public.hub_list_demo_orgs()
returns table (org_id uuid, name text, created_at timestamptz, members bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.hub_demo_tools_enabled() then
    raise exception 'Demo tools are for platform operators on staging.' using errcode = '42501';
  end if;
  return query
    select d.org_id, o.name, d.created_at, (select count(*) from public.memberships m where m.org_id = d.org_id)
    from hub.demo_orgs d join public.organizations o on o.id = d.org_id
    order by d.created_at desc;
end;
$$;

revoke all on function
  hub.record_legal_acceptance(),
  hub.audit_core_row(),
  public.hub_join_waitlist(text, text),
  public.hub_org_audit(uuid, int, bigint),
  public.hub_is_platform_operator(),
  public.hub_demo_tools_enabled(),
  public.hub_create_demo_org(text),
  public.hub_delete_demo_org(uuid),
  public.hub_list_demo_orgs()
from public, anon, authenticated;

grant execute on function public.hub_join_waitlist(text, text) to anon, authenticated;
grant execute on function
  public.hub_org_audit(uuid, int, bigint),
  public.hub_is_platform_operator(),
  public.hub_demo_tools_enabled(),
  public.hub_create_demo_org(text),
  public.hub_delete_demo_org(uuid),
  public.hub_list_demo_orgs()
to authenticated;
