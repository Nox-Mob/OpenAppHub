-- Plan limits with a role per app (owner decision 2026-11-12, H-09). An editor is the owner, an
-- OpenAppHub admin, or anyone who is a member or admin in at least one app
-- (public.is_org_editor, core 0011). Chapters' own organizations never count (the parent pays).
--
-- Roles now come from three places (the OpenAppHub role, a role set per app, a named role), so
-- the check runs after each change, on the resulting state, and refuses only a change
-- that adds an editor beyond the limit. An organization already above its limit (after a
-- downgrade) can still change anything that doesn't add one.

create or replace function billing._editor_limit(p_org uuid)
returns int
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_enabled boolean;
  v_limit int;
begin
  if exists (select 1 from public.organizations o where o.id = p_org and o.parent_org_id is not null) then
    return null; -- a chapter's organization: covered by the parent's plan
  end if;
  select s.billing_enabled into v_enabled from public.instance_settings s where s.id;
  if not coalesce(v_enabled, false) then
    return null;
  end if;
  select case
           when s.status in ('active', 'past_due') and s.plan_id is not null then p.max_members
           else billing.trial_member_limit()
         end
    into v_limit
  from billing.subscriptions s
  left join billing.plans p on p.id = s.plan_id
  where s.org_id = p_org;
  if not found then
    v_limit := billing.trial_member_limit();
  end if;
  return v_limit;
end;
$$;

-- Before a change: remember whether the person was an editor, and the organization's count.
create or replace function billing._editor_before()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
  v_user uuid;
begin
  if tg_table_name = 'org_named_roles' then
    v_org := coalesce(new.org_id, old.org_id);
    if current_setting('billing.count_' || replace(v_org::text, '-', ''), true) is null or current_setting('billing.count_' || replace(v_org::text, '-', ''), true) = '' then
      perform set_config('billing.count_' || replace(v_org::text, '-', ''), public.org_editor_count(v_org)::text, true);
    end if;
    return coalesce(new, old);
  end if;
  v_org := coalesce(new.org_id, old.org_id);
  v_user := coalesce(new.user_id, old.user_id);
  if tg_op = 'INSERT' and tg_table_name = 'memberships' then
    perform set_config('billing.was_' || replace(v_org::text, '-', '') || '_' || replace(v_user::text, '-', ''), 'f', true);
  elsif coalesce(current_setting('billing.was_' || replace(v_org::text, '-', '') || '_' || replace(v_user::text, '-', ''), true), '') = '' then
    perform set_config('billing.was_' || replace(v_org::text, '-', '') || '_' || replace(v_user::text, '-', ''),
      case when public.is_org_editor(v_org, v_user) then 't' else 'f' end, true);
  end if;
  return coalesce(new, old);
end;
$$;

-- At the end of the transaction: refuse it if it added an editor beyond the limit.
create or replace function billing._editor_after()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid := coalesce(new.org_id, old.org_id);
  v_user uuid;
  v_limit int;
  v_count int;
  v_before text;
begin
  if tg_op = 'DELETE' then
    return null;
  end if;
  v_limit := billing._editor_limit(v_org);
  if v_limit is null then
    return null;
  end if;
  if tg_table_name = 'org_named_roles' then
    v_before := current_setting('billing.count_' || replace(v_org::text, '-', ''), true);
    v_count := public.org_editor_count(v_org);
    if v_count > v_limit and v_count > coalesce(nullif(v_before, '')::int, 0) then
      raise exception 'This organization''s plan allows % editors (people who can change something in OpenAppHub or an app). Choose a larger plan, or make this role view-only in more apps.', v_limit
        using errcode = '23514';
    end if;
    return null;
  end if;
  v_user := new.user_id;
  if not exists (select 1 from public.memberships m where m.org_id = v_org and m.user_id = v_user) then
    return null;
  end if;
  if coalesce(current_setting('billing.was_' || replace(v_org::text, '-', '') || '_' || replace(v_user::text, '-', ''), true), 'f') = 't'
     or not public.is_org_editor(v_org, v_user) then
    return null;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_org::text, 7));
  if public.org_editor_count(v_org) > v_limit then
    raise exception 'This organization''s plan allows % editors (people who can change something in OpenAppHub or an app). Choose a larger plan, or make them a viewer.', v_limit
      using errcode = '23514';
  end if;
  return null;
end;
$$;

drop trigger if exists billing_member_limit on public.memberships;
drop trigger if exists billing_editor_before on public.memberships;
drop trigger if exists billing_editor_after on public.memberships;
create trigger billing_editor_before before insert or update of role, named_role_id on public.memberships
  for each row execute function billing._editor_before();
create trigger billing_editor_after after insert or update of role, named_role_id on public.memberships
  for each row execute function billing._editor_after();

drop trigger if exists billing_editor_before on public.app_role_overrides;
drop trigger if exists billing_editor_after on public.app_role_overrides;
create trigger billing_editor_before before insert or update or delete on public.app_role_overrides
  for each row execute function billing._editor_before();
create trigger billing_editor_after after insert or update on public.app_role_overrides
  for each row execute function billing._editor_after();

drop trigger if exists billing_editor_before on public.org_named_roles;
drop trigger if exists billing_editor_after on public.org_named_roles;
create trigger billing_editor_before before update of app_roles on public.org_named_roles
  for each row execute function billing._editor_before();
create trigger billing_editor_after after update of app_roles on public.org_named_roles
  for each row execute function billing._editor_after();

-- Editors right now, for "x of y editors" on the billing page.
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
  return public.org_editor_count(p_org);
end;
$$;

revoke all on function billing._editor_limit(uuid), billing._editor_before(), billing._editor_after() from public, anon, authenticated;
