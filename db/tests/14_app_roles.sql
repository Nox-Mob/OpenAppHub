-- A different role in each app (core 0010).
begin;
do $$
declare
  ann uuid := tests.create_user('ann@roles.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@roles.org', '{"full_name":"Bob"}');
  cy uuid := tests.create_user('cy@roles.org', '{"full_name":"Cy"}');
  org uuid;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Roles Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member'), (org, cy, 'viewer');

  perform tests.as_user(ann);
  perform tests.ok(public.app_role(org, 'board', bob) = 'member', 'the OpenAppHub role by default');
  perform public.set_app_role(org, bob, 'board', 'admin');
  perform public.set_app_role(org, bob, 'ledger', 'viewer');
  perform tests.ok(public.app_role(org, 'board', bob) = 'admin', 'admin in OpenBoardApp');
  perform tests.ok(public.app_role(org, 'ledger', bob) = 'viewer', 'view-only in OpenLedgerApp');
  perform tests.ok(public.app_role(org, 'charter', bob) = 'member', 'member in OpenCharterApp');
  perform tests.ok(public.app_role(org, 'board', ann) = 'owner', 'the owner is the owner everywhere');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, ann, 'ledger', 'viewer'), 'not the owner', 'owner in every app');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, bob, 'ledger', 'owner'), 'no second owner', 'one owner');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, bob, 'hub', 'admin'), 'known apps only', 'choose');
  -- Setting it back to the OpenAppHub role clears it.
  perform public.set_app_role(org, bob, 'ledger', 'member');
  perform tests.ok(not exists (select 1 from public.app_role_overrides where user_id = bob and app = 'ledger'), 'back to the default');

  perform tests.as_user(bob);
  perform tests.ok(public.has_app_role(org, 'board', '{owner,admin}'), 'Bob checks as an admin in Board');
  perform tests.ok(not public.has_role(org, '{owner,admin}'), 'but not in OpenAppHub');
  perform tests.ok((select role from public.my_app_memberships('board') where org_id = org) = 'admin', 'set-based too');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, cy, 'board', 'admin'), 'members cannot change roles', 'only owners and admins');
  perform tests.ok(tests.count(format('select * from public.app_role_overrides where org_id = %L', org)) = 1, 'members can see the roles');

  -- Leaving the organization removes them.
  perform tests.as_super();
  delete from public.memberships where org_id = org and user_id = bob;
  perform tests.ok(not exists (select 1 from public.app_role_overrides where user_id = bob), 'they go with the membership');
end $$;
rollback;
\echo ok
