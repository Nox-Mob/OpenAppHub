-- Billing for child organizations (core 0006): a chapter's own organization, created when its
-- national approves OpenBoardApp for it in OpenCharterApp, is covered by the parent's plan.
--   - no trial or subscription of its own
--   - app access and the billing banner follow the parent's subscription
--   - its members don't count against any plan's editor limit (the parent pays for the apps,
--     and a chapter board is a handful of people)
--   - checkout and the billing portal are refused for it (the hub sends people to the parent)

create or replace function billing.billing_org(p_org uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select o.parent_org_id from public.organizations o where o.id = p_org), p_org);
$$;

create or replace function billing.org_has_app_access(p_org uuid, p_app text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from billing.subscriptions s
    where s.org_id = billing.billing_org(p_org)
      and (
        (s.status = 'trialing' and (s.trial_ends_at is null or s.trial_ends_at > now()))
        or (s.status in ('active', 'past_due') and p_app = any (s.apps))
      )
  );
$$;

create or replace function billing.start_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first boolean := true;
begin
  if new.parent_org_id is not null then
    return new; -- covered by the parent's plan
  end if;
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
  if new.role = 'viewer' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.role <> 'viewer' then
    return new;
  end if;
  if exists (select 1 from public.organizations o where o.id = new.org_id and o.parent_org_id is not null) then
    return new; -- a chapter's organization: covered by the parent's plan
  end if;
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
  perform pg_advisory_xact_lock(hashtextextended(new.org_id::text, 7));
  select count(*) into v_count from public.memberships m
  where m.org_id = new.org_id and m.role <> 'viewer' and m.user_id <> new.user_id;
  if v_count >= v_limit then
    raise exception 'This organization''s plan allows % editors (everyone except viewers). Choose a larger plan, or add them as a viewer.', v_limit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

-- The banner and read-only rule in every app: the parent's subscription for a child.
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
    from billing.subscriptions s where s.org_id = billing.billing_org(p_org);
end;
$$;

revoke all on function billing.billing_org(uuid) from public, anon, authenticated;

-- The parent of a chapter's organization (name too), for the billing page and checkout.
create or replace function public.billing_parent_org(p_org uuid)
returns table (id uuid, name text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name
  from public.organizations c
  join public.organizations p on p.id = c.parent_org_id
  where c.id = p_org and public.is_member(p_org);
$$;

revoke all on function public.billing_parent_org(uuid) from public, anon;
grant execute on function public.billing_parent_org(uuid) to authenticated, service_role;
