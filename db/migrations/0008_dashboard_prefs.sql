-- H-03: dashboard round two. Each person chooses which dashboard panels show, and which
-- organization opens first (their default) when they haven't just picked one.
alter table hub.user_preferences
  add column if not exists dashboard_hidden text[] not null default '{}',
  add column if not exists default_org_id uuid references public.organizations (id) on delete set null;

create or replace function public.hub_get_dashboard_prefs()
returns table (hidden text[], default_org_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(p.dashboard_hidden, '{}'),
         -- Only an organization the person is still in.
         (select m.org_id from public.memberships m where m.user_id = me.uid and m.org_id = p.default_org_id)
  from (select auth.uid() as uid) me
  left join hub.user_preferences p on p.user_id = me.uid
  where me.uid is not null;
$$;

-- Panels to hide: their ids (tasks, week, money, meetings, decisions, officers, apps). Unknown
-- ids are dropped, so an old browser can't store junk.
create or replace function public.hub_set_dashboard_panels(p_hidden text[])
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_uid();
  v_hidden text[] := array(
    select distinct x from unnest(coalesce(p_hidden, '{}')) x
    where x in ('tasks', 'week', 'money', 'meetings', 'decisions', 'officers', 'apps') order by x
  );
begin
  insert into hub.user_preferences (user_id, dashboard_hidden, updated_at)
  values (v_uid, v_hidden, now())
  on conflict (user_id) do update set dashboard_hidden = excluded.dashboard_hidden, updated_at = now();
end;
$$;

-- The organization that opens first; null for none (the first by name).
create or replace function public.hub_set_default_org(p_org uuid)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_uid uuid := public._require_uid();
begin
  if p_org is not null and not exists (select 1 from public.memberships where user_id = v_uid and org_id = p_org) then
    raise exception 'You''re not in that organization.' using errcode = '42501';
  end if;
  insert into hub.user_preferences (user_id, default_org_id, updated_at)
  values (v_uid, p_org, now())
  on conflict (user_id) do update set default_org_id = excluded.default_org_id, updated_at = now();
end;
$$;

revoke all on function public.hub_get_dashboard_prefs(), public.hub_set_dashboard_panels(text[]),
  public.hub_set_default_org(uuid) from public, anon;
grant execute on function public.hub_get_dashboard_prefs(), public.hub_set_dashboard_panels(text[]),
  public.hub_set_default_org(uuid) to authenticated;
