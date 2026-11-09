-- OpenAppHub suite billing (SHARED-SPEC §5, AGENTS step 18). Hub only.
-- Self-hosted databases skip this file (--skip 0002_billing): without it,
-- public.has_app_access() always allows (billing_enabled stays false).
--
-- The schema `billing` is not exposed through the API. People read their
-- organization's state through public.get_org_billing(); only the hub's
-- server code (service role, §7.2) writes it, through the billing_* functions
-- at the end of this file.

create schema if not exists billing;
revoke all on schema billing from public, anon, authenticated;
grant usage on schema billing to service_role;

-- Plans: limits live here, not in code (§6.1). Prices are in Stripe and in
-- src/config/pricing.ts only. Placeholder rows until the owner confirms.
create table if not exists billing.plans (
  id text primary key check (id ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  max_members int check (max_members is null or max_members > 0),
  storage_gb int not null default 5 check (storage_gb > 0),
  apps_included int check (apps_included is null or apps_included > 0),
  max_units int check (max_units is null or max_units > 0),
  active boolean not null default true
);

insert into billing.plans (id, name, max_members, storage_gb, apps_included) values
  ('starter', 'Starter', 10, 5, 1),
  ('suite', 'Suite', 25, 20, null),
  ('plus', 'Plus', null, 100, null)
on conflict (id) do nothing;

create table if not exists billing.subscriptions (
  org_id uuid primary key references public.organizations (id) on delete cascade,
  plan_id text references billing.plans (id),
  status text not null check (status in
    ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'expired')),
  apps text[] not null default '{}',
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  updated_at timestamptz not null default now()
);

create table if not exists billing.stripe_events (
  id text primary key,
  type text not null,
  received_at timestamptz not null default now()
);

-- One free trial per person: who has had one, and for which organization.
create table if not exists billing.trial_grants (
  user_id uuid primary key references auth.users (id) on delete cascade,
  org_id uuid,
  granted_at timestamptz not null default now()
);

alter table billing.plans enable row level security;
alter table billing.subscriptions enable row level security;
alter table billing.stripe_events enable row level security;
alter table billing.trial_grants enable row level security;
revoke all on all tables in schema billing from public, anon, authenticated;
grant all on all tables in schema billing to service_role;

-- The trial's limits (§6.1): every app, 10 members, 30 days, no card.
create or replace function billing.trial_member_limit() returns int
language sql immutable set search_path = '' as $$ select 10 $$;

create or replace function billing.trial_days() returns int
language sql immutable set search_path = '' as $$ select 30 $$;

-- Access (§5): trialing and not expired; or active/past_due with the app in the plan.
create or replace function billing.org_has_app_access(p_org uuid, p_app text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from billing.subscriptions s
    where s.org_id = p_org
      and (
        (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
        or (s.status in ('active', 'past_due') and p_app = any (s.apps))
      )
  );
$$;

-- Trial on every new organization. One per person: if the creator already had
-- one, the new organization starts expired (read-only until a plan is chosen).
create or replace function billing.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean := true;
begin
  if new.created_by is not null then
    insert into billing.trial_grants (user_id, org_id) values (new.created_by, new.id)
    on conflict (user_id) do nothing;
    v_first := found;
  end if;
  insert into billing.subscriptions (org_id, status, apps, trial_ends_at)
  values (
    new.id,
    case when v_first then 'trialing' else 'expired' end,
    '{charter,board,ledger}',
    case when v_first then now() + make_interval(days => billing.trial_days()) else now() end
  )
  on conflict (org_id) do nothing;
  return new;
end;
$$;

drop trigger if exists billing_start_trial on public.organizations;
create trigger billing_start_trial
  after insert on public.organizations
  for each row execute function billing.start_trial();

-- Member limit (§5): counts core memberships only, so Charter portal members
-- never count. Only while billing is on.
create or replace function billing.check_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit int;
  v_count int;
begin
  select s.billing_enabled into v_enabled from public.instance_settings s where s.id;
  if not coalesce(v_enabled, false) then
    return new;
  end if;
  select case
           when s.status in ('active', 'past_due') and s.plan_id is not null then p.max_members
           else billing.trial_member_limit()
         end
    into v_limit
  from billing.subscriptions s
  left join billing.plans p on p.id = s.plan_id
  where s.org_id = new.org_id;
  if not found then
    v_limit := billing.trial_member_limit();
  end if;
  if v_limit is null then
    return new;
  end if;
  -- Serialize concurrent joins to the same organization.
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text, 7));
  select count(*) into v_count from public.memberships m where m.org_id = new.org_id;
  if v_count >= v_limit then
    raise exception 'This organization''s plan allows % members. Choose a larger plan to add more.', v_limit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_member_limit on public.memberships;
create trigger billing_member_limit
  before insert on public.memberships
  for each row execute function billing.check_member_limit();

-- Staging demo organizations get a long trial, whoever creates them.
create or replace function billing.demo_org_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update billing.subscriptions
     set status = 'trialing', trial_ends_at = now() + interval '365 days', updated_at = now()
   where org_id = new.org_id;
  return new;
end;
$$;

drop trigger if exists billing_demo_org_trial on hub.demo_orgs;
create trigger billing_demo_org_trial
  after insert on hub.demo_orgs
  for each row execute function billing.demo_org_trial();

-- What members (and Charter portal members) see (§5). Charter's portal check is
-- resolved at run time, so this compiles without Charter's schema.
create or replace function public.get_org_billing(p_org uuid)
returns table (
  plan_id text,
  status text,
  apps text[],
  trial_ends_at timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_portal boolean := false;
begin
  if not public.is_member(p_org) then
    if to_regprocedure('charter.is_portal_member(uuid,uuid)') is not null then
      execute 'select charter.is_portal_member($1, null)' into v_portal using p_org;
    end if;
    if not coalesce(v_portal, false) then
      raise exception 'You''re not a member of this organization.' using errcode = '42501';
    end if;
  end if;
  return query
    select s.plan_id, s.status, s.apps, s.trial_ends_at, s.current_period_end, s.cancel_at_period_end
    from billing.subscriptions s where s.org_id = p_org;
end;
$$;

-- Plans for the billing page (limits only; prices come from pricing.ts).
create or replace function public.billing_plans()
returns table (id text, name text, max_members int, storage_gb int, apps_included int)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.max_members, p.storage_gb, p.apps_included
  from billing.plans p where p.active order by p.max_members nulls last, p.id;
$$;

-- Members in the organization right now (owner/admin), for "x of y members".
create or replace function public.billing_member_count(p_org uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_role(p_org, '{owner,admin}'::public.org_role[]) then
    raise exception 'Only the owner or an admin can see this.' using errcode = '42501';
  end if;
  return (select count(*)::int from public.memberships m where m.org_id = p_org);
end;
$$;

-- Service role only (the hub's Stripe code, §6.2 and §7.2) ---------------------

create or replace function public.billing_customer_for_org(p_org uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select s.stripe_customer_id from billing.subscriptions s where s.org_id = p_org;
$$;

create or replace function public.billing_set_customer(p_org uuid, p_customer text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  insert into billing.subscriptions (org_id, status, stripe_customer_id)
  values (p_org, 'expired', p_customer)
  on conflict (org_id) do update set stripe_customer_id = excluded.stripe_customer_id, updated_at = now();
$$;

-- Idempotency: true the first time an event id is seen, false after.
create or replace function public.billing_record_event(p_id text, p_type text)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $$
begin
  insert into billing.stripe_events (id, type) values (p_id, p_type) on conflict (id) do nothing;
  return found;
end;
$$;

-- Lets a failed handler be retried by Stripe (it re-sends the same event id).
create or replace function public.billing_forget_event(p_id text)
returns void
language sql
volatile
security definer
set search_path = ''
as $$
  delete from billing.stripe_events where id = p_id;
$$;

-- Applies a Stripe subscription to an organization. The organization comes
-- from p_org (checkout metadata) or, failing that, the subscription or customer
-- already on file. Returns the organization, or null when it can't be found.
create or replace function public.billing_apply_subscription(
  p_org uuid,
  p_customer text,
  p_subscription text,
  p_plan text,
  p_status text,
  p_apps text[],
  p_period_end timestamptz,
  p_cancel_at_period_end boolean
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid := p_org;
  v_plan text := p_plan;
  v_apps text[] := coalesce(p_apps, '{}');
  v_included int;
begin
  if v_org is null then
    select s.org_id into v_org from billing.subscriptions s
    where s.stripe_subscription_id = p_subscription
       or (p_customer is not null and s.stripe_customer_id = p_customer)
    order by (s.stripe_subscription_id = p_subscription) desc nulls last
    limit 1;
  end if;
  if v_org is null or not exists (select 1 from public.organizations o where o.id = v_org) then
    return null;
  end if;
  if p_status not in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'expired') then
    raise exception 'Unknown subscription status %', p_status using errcode = '22023';
  end if;
  if v_plan is not null and not exists (select 1 from billing.plans p where p.id = v_plan) then
    raise exception 'Unknown plan %', v_plan using errcode = '22023';
  end if;
  -- Plans that include every app get every app; the others keep the apps chosen.
  select p.apps_included into v_included from billing.plans p where p.id = v_plan;
  if v_plan is not null and v_included is null then
    v_apps := '{charter,board,ledger}';
  elsif v_included is not null then
    v_apps := (select coalesce(array_agg(a), '{}') from (
      select distinct a from unnest(v_apps) a where a in ('charter', 'board', 'ledger') order by a limit v_included
    ) x);
  end if;

  insert into billing.subscriptions as s (org_id, plan_id, status, apps, current_period_end,
    cancel_at_period_end, stripe_customer_id, stripe_subscription_id, updated_at)
  values (v_org, v_plan, p_status, v_apps, p_period_end, coalesce(p_cancel_at_period_end, false),
    p_customer, p_subscription, now())
  on conflict (org_id) do update set
    plan_id = coalesce(excluded.plan_id, s.plan_id),
    status = excluded.status,
    apps = case when excluded.plan_id is null and cardinality(excluded.apps) = 0 then s.apps else excluded.apps end,
    current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
    updated_at = now();
  return v_org;
end;
$$;

-- invoice.payment_failed and the like: change only the status.
create or replace function public.billing_set_status(p_subscription text, p_status text)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  if p_status not in ('trialing', 'active', 'past_due', 'canceled', 'unpaid', 'incomplete', 'expired') then
    raise exception 'Unknown subscription status %', p_status using errcode = '22023';
  end if;
  update billing.subscriptions set status = p_status, updated_at = now()
  where stripe_subscription_id = p_subscription
  returning org_id into v_org;
  return v_org;
end;
$$;

revoke all on function
  billing.trial_member_limit(),
  billing.trial_days(),
  billing.org_has_app_access(uuid, text),
  billing.start_trial(),
  billing.check_member_limit(),
  billing.demo_org_trial(),
  public.get_org_billing(uuid),
  public.billing_plans(),
  public.billing_member_count(uuid),
  public.billing_customer_for_org(uuid),
  public.billing_set_customer(uuid, text),
  public.billing_record_event(text, text),
  public.billing_forget_event(text),
  public.billing_apply_subscription(uuid, text, text, text, text, text[], timestamptz, boolean),
  public.billing_set_status(text, text)
from public, anon, authenticated;

grant execute on function
  public.get_org_billing(uuid),
  public.billing_plans(),
  public.billing_member_count(uuid)
to authenticated;

grant execute on function
  public.billing_customer_for_org(uuid),
  public.billing_set_customer(uuid, text),
  public.billing_record_event(text, text),
  public.billing_forget_event(text),
  public.billing_apply_subscription(uuid, text, text, text, text, text[], timestamptz, boolean),
  public.billing_set_status(text, text)
to service_role;

-- Organizations created before billing (test organizations): a fresh trial each.
insert into billing.subscriptions (org_id, status, apps, trial_ends_at)
select o.id, 'trialing', '{charter,board,ledger}', now() + make_interval(days => billing.trial_days())
from public.organizations o
on conflict (org_id) do nothing;

insert into billing.trial_grants (user_id, org_id)
select distinct on (o.created_by) o.created_by, o.id
from public.organizations o
where o.created_by is not null
order by o.created_by, o.created_at
on conflict (user_id) do nothing;

-- Last line (§5): billing is on. Self-hosters skip this whole file.
update public.instance_settings set billing_enabled = true where id;
