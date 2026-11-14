-- Pre-production tuning (2026-11-14): the hub's schemas through core 0016's helper (policies
-- call auth once per query; every foreign key indexed), and a limit on the public waitlist.

select public._tune_schema('public');
select public._tune_schema('hub');
select public._tune_schema('billing');

-- The waitlist is open to anyone (anon), so cap how fast it can grow: a script filling it with
-- junk addresses gets refused after 30 sign-ups in 10 minutes across everyone. Real traffic
-- before launch is far below that.
create index if not exists waitlist_created_at_idx on hub.waitlist (created_at);

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
  if exists (select 1 from hub.waitlist w where w.email = v_email) then
    return;
  end if;
  if (select count(*) from hub.waitlist w where w.created_at > now() - interval '10 minutes') >= 30 then
    raise exception 'A lot of people are signing up right now. Please try again in a few minutes.'
      using errcode = '53400';
  end if;
  insert into hub.waitlist (email, source)
  values (v_email, left(nullif(btrim(coalesce(p_source, '')), ''), 100))
  on conflict (email) do nothing;
end;
$$;

-- Stripe can deliver events out of order (https://docs.stripe.com/webhooks#event-ordering): a
-- late "subscription updated: active" must not undo a newer "subscription deleted". Each
-- subscription remembers the time of the newest event applied (Stripe's event `created`), and an
-- older event changes nothing. Callers that don't pass a time behave as before.
alter table billing.subscriptions add column if not exists stripe_event_at timestamptz;

drop function if exists public.billing_apply_subscription(uuid, text, text, text, text, text[], timestamptz, boolean);
drop function if exists public.billing_set_status(text, text);

create or replace function public.billing_apply_subscription(
  p_org uuid,
  p_customer text,
  p_subscription text,
  p_plan text,
  p_status text,
  p_apps text[],
  p_period_end timestamptz,
  p_cancel_at_period_end boolean,
  p_event_at timestamptz default null
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
  -- An event older than the last one applied to this organization's subscription changes nothing.
  if p_event_at is not null and exists (
       select 1 from billing.subscriptions s
       where s.org_id = v_org and s.stripe_event_at is not null and s.stripe_event_at > p_event_at
         and (p_subscription is null or s.stripe_subscription_id is null or s.stripe_subscription_id = p_subscription)) then
    return v_org;
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
    cancel_at_period_end, stripe_customer_id, stripe_subscription_id, stripe_event_at, updated_at)
  values (v_org, v_plan, p_status, v_apps, p_period_end, coalesce(p_cancel_at_period_end, false),
    p_customer, p_subscription, p_event_at, now())
  on conflict (org_id) do update set
    plan_id = coalesce(excluded.plan_id, s.plan_id),
    status = excluded.status,
    apps = case when excluded.plan_id is null and cardinality(excluded.apps) = 0 then s.apps else excluded.apps end,
    current_period_end = coalesce(excluded.current_period_end, s.current_period_end),
    cancel_at_period_end = excluded.cancel_at_period_end,
    stripe_customer_id = coalesce(excluded.stripe_customer_id, s.stripe_customer_id),
    stripe_subscription_id = coalesce(excluded.stripe_subscription_id, s.stripe_subscription_id),
    stripe_event_at = greatest(excluded.stripe_event_at, s.stripe_event_at),
    updated_at = now();
  return v_org;
end;
$$;

-- invoice.payment_failed and the like: change only the status (unless a newer event came first).
create or replace function public.billing_set_status(p_subscription text, p_status text, p_event_at timestamptz default null)
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
  update billing.subscriptions s
  set status = p_status, stripe_event_at = greatest(p_event_at, s.stripe_event_at), updated_at = now()
  where s.stripe_subscription_id = p_subscription
    and (p_event_at is null or s.stripe_event_at is null or s.stripe_event_at <= p_event_at)
  returning s.org_id into v_org;
  if v_org is null then
    select s.org_id into v_org from billing.subscriptions s where s.stripe_subscription_id = p_subscription;
  end if;
  return v_org;
end;
$$;

revoke all on function
  public.billing_apply_subscription(uuid, text, text, text, text, text[], timestamptz, boolean, timestamptz),
  public.billing_set_status(text, text, timestamptz)
from public, anon, authenticated;
grant execute on function
  public.billing_apply_subscription(uuid, text, text, text, text, text[], timestamptz, boolean, timestamptz),
  public.billing_set_status(text, text, timestamptz)
to service_role;

-- Housekeeping: the Stripe event IDs kept to skip duplicates grew forever. Stripe retries an
-- event for up to 3 days, so 90 days is plenty.
create or replace function public.prune_stripe_events()
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  with d as (delete from billing.stripe_events where received_at < now() - interval '90 days' returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.prune_stripe_events() from public, anon, authenticated;
insert into public.email_jobs (name, fn, every)
values ('hub.prune_stripe_events', 'public.prune_stripe_events', interval '1 day')
on conflict (name) do update set fn = excluded.fn, every = excluded.every;
