-- No access in an app, and app admins changing roles in their own app (core 0015).
begin;
do $$
declare
  ann uuid := tests.create_user('ann@access.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@access.org', '{"full_name":"Bob"}');
  cy uuid := tests.create_user('cy@access.org', '{"full_name":"Cy"}');
  dee uuid := tests.create_user('dee@access.org', '{"full_name":"Dee Admin"}');
  org uuid;
  nr uuid;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Access Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member'), (org, cy, 'member'), (org, dee, 'admin');

  -- No access, for one person in one app.
  perform tests.as_user(ann);
  perform public.set_app_role(org, bob, 'ledger', 'member');
  perform public.set_app_access(org, bob, 'ledger', true);
  perform tests.ok(public.app_role(org, 'ledger', bob) is null, 'no role in Ledger');
  perform tests.ok(not public.can_open_app(org, 'ledger', bob), 'can''t open Ledger');
  perform tests.ok(public.can_open_app(org, 'board', bob) and public.app_role(org, 'board', bob) = 'viewer', 'still in Board, as before');
  perform tests.ok((select source from public.org_app_roles(org) where user_id = bob and app = 'ledger') = 'person'
                   and (select role from public.org_app_roles(org) where user_id = bob and app = 'ledger') is null, 'listed as No access, set for the person');
  perform tests.as_user(bob);
  perform tests.ok(not exists (select 1 from public.my_app_memberships('ledger') where org_id = org), 'Ledger doesn''t list the organization for them');
  perform tests.ok(exists (select 1 from public.my_app_memberships('board') where org_id = org), 'Board does');
  perform tests.ok(public.is_member(org), 'they''re still in the organization');
  -- Back again: the role set for them is gone with it (they're back to the fallback).
  perform tests.as_user(ann);
  perform public.set_app_access(org, bob, 'ledger', false);
  perform tests.ok(public.app_role(org, 'ledger', bob) = 'viewer', 'access back');

  -- The owner always has access; nobody takes their own away.
  perform tests.throws(format('select public.set_app_access(%L, %L, %L, true)', org, ann, 'board'), 'not the owner', 'always has access');
  perform tests.as_user(dee);
  perform tests.throws(format('select public.set_app_access(%L, %L, %L, true)', org, dee, 'board'), 'not yourself', 'your own access');

  -- Through a named role: "none" for an app.
  perform tests.as_user(ann);
  nr := public.save_named_role(org, null, 'Volunteer', '', '{"ledger": "none", "board": "member"}', '{}');
  perform public.set_named_role(org, cy, nr);
  perform tests.ok(public.app_role(org, 'ledger', cy) is null and public.app_role(org, 'board', cy) = 'member', 'the named role keeps them out of Ledger only');
  perform tests.ok((select source from public.org_app_roles(org) where user_id = cy and app = 'ledger') = 'named', 'from the named role');
  perform tests.throws(format($q$select public.save_named_role(%L, null, 'X', '', '{"ledger": "nobody"}', '{}')$q$, org), 'only known roles', 'or none, for no access');
  -- A role set for the person still beats the named role.
  perform public.set_app_role(org, cy, 'ledger', 'viewer');
  perform tests.ok(public.app_role(org, 'ledger', cy) = 'viewer', 'set for the person wins');
  -- No extra permissions with No access.
  perform tests.as_super();
  perform public.register_app_permission('ledger', 'test.close', 'Close', '');
  perform tests.as_user(ann);
  perform public.save_named_role(org, nr, 'Volunteer', '', '{"ledger": "none"}', '{"ledger": ["test.close"]}');
  perform public.set_app_role(org, cy, 'ledger', null);
  perform tests.ok(not public.has_app_permission(org, 'ledger', 'test.close', cy), 'a permission doesn''t get them in');

  -- App admins changing roles in their own app: off by default.
  perform public.set_app_role(org, bob, 'board', 'admin');
  perform tests.as_user(bob);
  perform tests.ok(not (select app_admins_manage_roles from public.org_role_settings(org)), 'off by default');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, cy, 'board', 'viewer'), 'an app admin can''t, while off', 'Only the owner');
  perform tests.throws(format('select public.set_org_role_settings(%L, true)', org), 'only the owner and admins switch it', 'Only the owner');
  perform tests.as_user(dee);
  perform public.set_org_role_settings(org, true);
  perform tests.as_user(bob);
  perform public.set_app_role(org, cy, 'board', 'viewer');
  perform tests.ok(public.app_role(org, 'board', cy) = 'viewer', 'with it on, a Board admin changes Board roles');
  perform public.set_app_access(org, cy, 'board', true);
  perform tests.ok(not public.can_open_app(org, 'board', cy), 'including No access');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, cy, 'charter', 'admin'), 'not in other apps', 'Only the owner');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, ann, 'board', 'viewer'), 'not the owner', 'owner in every app');
  perform tests.throws(format('select public.set_named_role(%L, %L, null)', org, cy), 'named roles stay with OpenAppHub admins', 'Only the owner');
end $$;
rollback;
