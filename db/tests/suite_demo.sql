-- Used by run.sh: the suite demo (db/seed/0002_suite_demo.sql) on a staging database.
-- No app is installed in hub CI, so this checks the accounts, the organization and that a
-- reset undoes a visitor's changes. Each app's CI checks its own demo_fill. Rolled back.
\set ON_ERROR_STOP 1
begin;
update hub.instance set environment = 'staging';
\i db/seed/0001_hub_staging.sql
\i db/seed/0002_suite_demo.sql

-- A visitor changes the demo password and name, and the test account starts an organization.
update auth.users set encrypted_password = 'changed', raw_user_meta_data = '{"full_name":"Someone"}'
where id = 'de000000-0000-4000-8000-000000000001';
insert into public.organizations (id, name, slug, created_by)
values ('de000000-0000-4000-8000-0000000000ff', 'Visitor Org', 'visitor-org', 'de000000-0000-4000-8000-000000000002');
insert into public.memberships (org_id, user_id, role)
values ('de000000-0000-4000-8000-0000000000ff', 'de000000-0000-4000-8000-000000000002', 'owner')
on conflict do nothing;

select hub.reset_suite_demo();
select hub.reset_suite_demo();

do $$
declare
  c_demo constant uuid := 'de000000-0000-4000-8000-000000000001';
  c_test constant uuid := 'de000000-0000-4000-8000-000000000002';
begin
  if (select count(*) from auth.users where id in (c_demo, c_test)
      and encrypted_password = extensions.crypt('OpenAppHubDemo2026', encrypted_password)) <> 2 then
    raise exception 'suite demo: the two accounts do not have the demo password';
  end if;
  if (select raw_user_meta_data ->> 'full_name' from auth.users where id = c_demo) <> 'Alex Morgan' then
    raise exception 'suite demo: the demo account name was not restored';
  end if;
  if (select count(*) from auth.identities where user_id in (c_demo, c_test)) <> 2 then
    raise exception 'suite demo: each account needs one email identity';
  end if;
  if exists (select 1 from public.organizations where id = 'de000000-0000-4000-8000-0000000000ff') then
    raise exception 'suite demo: the organization the test account made is still there';
  end if;
  if exists (select 1 from public.memberships where user_id = c_test) then
    raise exception 'suite demo: the test account should belong to no organization';
  end if;
  if (select count(*) from public.memberships where user_id = c_demo and role = 'owner'
      and org_id = 'de000000-0000-4000-8000-0000000000a1') <> 1 then
    raise exception 'suite demo: the demo account does not own Riverside Community Association';
  end if;
  if not exists (select 1 from hub.demo_orgs where org_id = 'de000000-0000-4000-8000-0000000000a1') then
    raise exception 'suite demo: the organization is not marked as a demo';
  end if;
  if exists (select 1 from billing.trial_grants where user_id = c_test) then
    raise exception 'suite demo: the test account should not have used its trial';
  end if;
end
$$;
rollback;

-- Off staging, the reset refuses to run.
begin;
update hub.instance set environment = 'staging';
\i db/seed/0002_suite_demo.sql
update hub.instance set environment = null;
do $$
begin
  perform hub.reset_suite_demo();
  raise exception 'suite demo: reset ran on a database not marked staging';
exception when raise_exception then
  if sqlerrm like 'suite demo:%' then raise; end if;
end
$$;
rollback;
