-- Plan limits count editors (owner decision 2026-11-10): everyone with a core role
-- above viewer (owner, admin, member). Viewers, and Charter's dues-paying members (who
-- have no core membership), never count. "Editors" rather than "members" so the limit
-- isn't confused with Charter's members. Starter 5, Suite 15, Plus unlimited; the trial
-- keeps 10. The column stays max_members (renaming it would break callers); it holds
-- the editor limit.
update billing.plans set max_members = 5 where id = 'starter';
update billing.plans set max_members = 15 where id = 'suite';
update billing.plans set max_members = null where id = 'plus';

-- Checked when someone joins with a role above viewer, or is raised from viewer.
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
  select count(*) into v_count from public.memberships m
  where m.org_id = new.org_id and m.role <> 'viewer' and m.user_id <> new.user_id;
  if v_count >= v_limit then
    raise exception 'This organization''s plan allows % editors (everyone except viewers). Choose a larger plan, or add them as a viewer.', v_limit
      using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists billing_member_limit on public.memberships;
create trigger billing_member_limit
  before insert or update of role on public.memberships
  for each row execute function billing.check_member_limit();

-- Editors right now (owner/admin), for "x of y editors" on the billing page.
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
  return (select count(*)::int from public.memberships m where m.org_id = p_org and m.role <> 'viewer');
end;
$$;

revoke all on function billing.check_member_limit() from public, anon, authenticated;
revoke all on function public.billing_member_count(uuid) from public, anon;
grant execute on function public.billing_member_count(uuid) to authenticated;
