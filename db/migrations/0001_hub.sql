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
-- When someone signs up they accept the Terms and the Privacy Policy; this
-- records that they did and when. There are no versions: when the documents
-- change, everyone is told by email, and continuing to use OpenAppHub means
-- accepting the new ones.

create table if not exists hub.legal_acceptances (
  user_id uuid not null references auth.users (id) on delete cascade,
  document text not null check (document in ('terms', 'privacy')),
  accepted_at timestamptz not null,
  primary key (user_id, document)
);

-- Sign-up sends terms_accepted_at / privacy_accepted_at in the user's metadata.
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
      insert into hub.legal_acceptances (user_id, document, accepted_at)
      values (new.id, v_doc, v_at)
      on conflict (user_id, document) do nothing;
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
insert into hub.legal_acceptances (user_id, document, accepted_at)
select u.id, d.doc, (u.raw_user_meta_data ->> (d.doc || '_accepted_at'))::timestamptz
from auth.users u
cross join (values ('terms'), ('privacy')) as d(doc)
where u.raw_user_meta_data ->> (d.doc || '_accepted_at') ~ '^\d{4}-\d{2}-\d{2}T'
on conflict (user_id, document) do nothing;

-- Organization billing contact ------------------------------------------------------
-- Where invoices go, when that isn't the owner's own email. Used by billing.

create table if not exists hub.org_settings (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  billing_email text
    check (billing_email is null or (billing_email = lower(btrim(billing_email))
      and char_length(billing_email) <= 254 and billing_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')),
  billing_name text check (billing_name is null or char_length(billing_name) <= 200),
  updated_at timestamptz not null default now()
);

-- Guided setup (the dashboard's "Get set up" list): when the owner or an admin
-- confirmed the time zone and currency, and when they dismissed the list.
alter table hub.org_settings
  add column if not exists setup_preferences_at timestamptz,
  add column if not exists setup_dismissed_at timestamptz;

-- Email preferences ----------------------------------------------------------------
-- Account, security and legal notices (sign-in, password and email changes,
-- changes to the Terms or Privacy Policy) are always sent and aren't listed here.

create table if not exists hub.user_preferences (
  user_id uuid primary key references auth.users (id) on delete cascade,
  billing_emails boolean not null default true,
  org_activity_emails boolean not null default true,
  product_news boolean not null default false,
  updated_at timestamptz not null default now()
);

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
alter table hub.org_settings enable row level security;
alter table hub.user_preferences enable row level security;
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

create or replace function public.hub_get_org_billing_contact(p_org uuid)
returns table (billing_email text, billing_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can see the billing contact.' using errcode = '42501';
  end if;
  return query select s.billing_email, s.billing_name from hub.org_settings s where s.org_id = p_org;
end;
$$;

create or replace function public.hub_set_org_billing_contact(p_org uuid, p_email text, p_name text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can change the billing contact.' using errcode = '42501';
  end if;
  if v_email is not null and (char_length(v_email) > 254 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'Enter a valid email address.' using errcode = '22023';
  end if;
  insert into hub.org_settings (org_id, billing_email, billing_name, updated_at)
  values (p_org, v_email, left(v_name, 200), now())
  on conflict (org_id) do update
    set billing_email = excluded.billing_email, billing_name = excluded.billing_name, updated_at = now();
end;
$$;

create or replace function public.hub_get_my_preferences()
returns table (billing_emails boolean, org_activity_emails boolean, product_news boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.billing_emails, true), coalesce(p.org_activity_emails, true), coalesce(p.product_news, false)
  from (select auth.uid() as uid) me
  left join hub.user_preferences p on p.user_id = me.uid
  where me.uid is not null;
$$;

create or replace function public.hub_set_my_preferences(p_billing boolean, p_org_activity boolean, p_product_news boolean)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_uid();
begin
  insert into hub.user_preferences (user_id, billing_emails, org_activity_emails, product_news, updated_at)
  values (v_uid, coalesce(p_billing, true), coalesce(p_org_activity, true), coalesce(p_product_news, false), now())
  on conflict (user_id) do update
    set billing_emails = excluded.billing_emails,
        org_activity_emails = excluded.org_activity_emails,
        product_news = excluded.product_news,
        updated_at = now();
end;
$$;

-- Guided setup status for the dashboard (owner/admin). Invitations count only
-- while pending; members include the owner.
create or replace function public.hub_org_setup_status(p_org uuid)
returns table (
  preferences_done boolean,
  dismissed boolean,
  member_count int,
  pending_invitations int,
  has_billing_contact boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can see the setup steps.' using errcode = '42501';
  end if;
  return query
    select
      s.setup_preferences_at is not null,
      s.setup_dismissed_at is not null,
      (select count(*)::int from public.memberships m where m.org_id = p_org),
      (select count(*)::int from public.invitations i
        where i.org_id = p_org and i.role is not null and i.accepted_at is null
          and i.revoked_at is null and i.expires_at > now()),
      s.billing_email is not null
    from (select 1) one
    left join hub.org_settings s on s.org_id = p_org;
end;
$$;

-- p_step: 'preferences' (time zone and currency confirmed), 'dismiss' or 'reopen'.
create or replace function public.hub_mark_org_setup(p_org uuid, p_step text)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can change the setup steps.' using errcode = '42501';
  end if;
  if p_step not in ('preferences', 'dismiss', 'reopen') then
    raise exception 'Unknown setup step.' using errcode = '22023';
  end if;
  insert into hub.org_settings (org_id, setup_preferences_at, setup_dismissed_at)
  values (p_org,
          case when p_step = 'preferences' then now() end,
          case when p_step = 'dismiss' then now() end)
  on conflict (org_id) do update set
    setup_preferences_at = case when p_step = 'preferences'
      then coalesce(hub.org_settings.setup_preferences_at, now()) else hub.org_settings.setup_preferences_at end,
    setup_dismissed_at = case when p_step = 'dismiss' then now()
      when p_step = 'reopen' then null else hub.org_settings.setup_dismissed_at end,
    updated_at = now();
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
  public.hub_list_demo_orgs(),
  public.hub_get_org_billing_contact(uuid),
  public.hub_set_org_billing_contact(uuid, text, text),
  public.hub_get_my_preferences(),
  public.hub_set_my_preferences(boolean, boolean, boolean),
  public.hub_org_setup_status(uuid),
  public.hub_mark_org_setup(uuid, text)
from public, anon, authenticated;

grant execute on function public.hub_join_waitlist(text, text) to anon, authenticated;
grant execute on function
  public.hub_org_audit(uuid, int, bigint),
  public.hub_is_platform_operator(),
  public.hub_demo_tools_enabled(),
  public.hub_create_demo_org(text),
  public.hub_delete_demo_org(uuid),
  public.hub_list_demo_orgs(),
  public.hub_get_org_billing_contact(uuid),
  public.hub_set_org_billing_contact(uuid, text, text),
  public.hub_get_my_preferences(),
  public.hub_set_my_preferences(boolean, boolean, boolean),
  public.hub_org_setup_status(uuid),
  public.hub_mark_org_setup(uuid, text)
to authenticated;
