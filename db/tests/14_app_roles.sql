-- A role in each app (core 0010) decided on its own, and named roles (core 0011, H-09).
begin;
do $$
declare
  ann uuid := tests.create_user('ann@roles.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@roles.org', '{"full_name":"Bob"}');
  cy uuid := tests.create_user('cy@roles.org', '{"full_name":"Cy"}');
  dee uuid := tests.create_user('dee@roles.org', '{"full_name":"Dee Admin"}');
  eve uuid := tests.create_user('eve@roles.org', '{"full_name":"Eve"}');
  org uuid;
  treasurer uuid;
  inv record;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Roles Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member'), (org, cy, 'viewer'), (org, dee, 'admin');
  perform public.register_app_permission('charter', 'test.awards_approve', 'Approve awards', 'Test permission');
  perform public.register_app_permission('board', 'test.edit_records', 'Edit the official record');

  perform tests.as_user(ann);
  -- Nothing set: viewer in every app, whatever the OpenAppHub role, and shown as such.
  perform tests.ok(public.app_role(org, 'board', bob) = 'viewer', 'an OpenAppHub member is a viewer in an app until given a role');
  perform tests.ok(public.app_role(org, 'ledger', dee) = 'viewer', 'an OpenAppHub admin is not an app admin');
  perform tests.ok(public.app_role_source(org, 'board', bob) = 'fallback', 'the fallback is visible');
  perform tests.ok((select source from public.org_app_roles(org) where user_id = bob and app = 'charter') = 'fallback', 'and listed');
  perform tests.ok(public.app_role(org, 'board', ann) = 'owner', 'the owner is the owner everywhere');

  -- A role set for one person in one app.
  perform public.set_app_role(org, bob, 'board', 'admin');
  perform public.set_app_role(org, bob, 'ledger', 'viewer');
  perform tests.ok(public.app_role(org, 'board', bob) = 'admin', 'admin in OpenBoardApp');
  perform tests.ok(public.app_role_source(org, 'board', bob) = 'person', 'set for the person');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, ann, 'ledger', 'viewer'), 'not the owner', 'owner in every app');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, bob, 'ledger', 'owner'), 'no second owner', 'one owner');
  perform tests.throws(format('select public.set_app_role(%L, %L, %L, %L)', org, bob, 'hub', 'admin'), 'known apps only', 'choose');

  -- A named role: Treasurer is admin in Ledger, member in Board and Charter, and may approve awards.
  treasurer := public.save_named_role(org, null, 'Treasurer', 'Keeps the books',
    '{"ledger":"admin","board":"member","charter":"member"}', '{"charter":["test.awards_approve"]}');
  perform tests.throws(format('select public.save_named_role(%L, null, %L, %L, %L, %L)', org, 'treasurer', '', '{}', '{}'),
    'names are unique', 'already a role');
  perform tests.throws(format('select public.save_named_role(%L, null, %L, %L, %L, %L)', org, 'X', '', '{"board":"owner"}', '{}'),
    'no owner in a named role', 'admin, member or viewer');
  perform tests.throws(format('select public.save_named_role(%L, null, %L, %L, %L, %L)', org, 'Y', '', '{}', '{"board":["nope"]}'),
    'only registered permissions', 'Unknown permission');
  perform public.set_named_role(org, cy, treasurer);
  perform tests.ok(public.app_role(org, 'ledger', cy) = 'admin', 'named role: admin in Ledger');
  perform tests.ok(public.app_role(org, 'board', cy) = 'member', 'named role: member in Board');
  perform tests.ok(public.app_role_source(org, 'ledger', cy) = 'named', 'from the named role');
  perform tests.as_user(cy);
  perform tests.ok(not public.has_role(org, '{owner,admin}'), 'Cy is still a viewer in OpenAppHub');
  perform tests.ok(public.can_write(org, 'ledger'), 'and can write in Ledger');
  perform tests.ok(public.has_app_permission(org, 'charter', 'test.awards_approve'), 'a member in Charter who may approve awards');
  perform tests.ok(not public.has_app_permission(org, 'board', 'test.edit_records'), 'but not what the role does not grant');
  perform tests.ok((select role from public.my_app_memberships('ledger') where org_id = org) = 'admin', 'set-based too');
  perform tests.throws(format('select public.set_named_role(%L, %L, null)', org, cy), 'only OpenAppHub admins change roles', 'Only the owner');

  -- A role set for the person wins over the named role; clearing it goes back to the named role.
  perform tests.as_user(dee);
  perform public.set_app_role(org, cy, 'board', 'viewer');
  perform tests.ok(public.app_role(org, 'board', cy) = 'viewer', 'person beats named role');
  perform public.set_app_role(org, cy, 'board', null);
  perform tests.ok(public.app_role(org, 'board', cy) = 'member', 'cleared: the named role again');
  -- Changing the named role changes everyone who holds it.
  perform public.save_named_role(org, treasurer, 'Treasurer', '', '{"ledger":"member"}', '{}');
  perform tests.ok(public.app_role(org, 'ledger', cy) = 'member', 'role change applies to holders');
  perform tests.ok(public.app_role(org, 'board', cy) = 'viewer', 'an app the role leaves out is viewer');
  perform tests.ok(not public.has_app_permission(org, 'charter', 'test.awards_approve', cy), 'permission removed');
  -- Deleting it leaves people as viewers (plus what's set for them).
  perform public.delete_named_role(org, treasurer);
  perform tests.ok(public.app_role(org, 'ledger', cy) = 'viewer', 'deleted role: back to viewer');
  perform tests.ok((select named_role_id from public.memberships where org_id = org and user_id = cy) is null, 'and unassigned');

  -- Invitations carry roles; without any, viewer everywhere.
  treasurer := public.save_named_role(org, null, 'Secretary', '', '{"board":"admin"}', '{}');
  select * into inv from public.create_invitation(org, 'eve@roles.org', 'member');
  perform public.set_invitation_roles(inv.invitation_id, treasurer, '{"ledger":"member"}');
  perform tests.as_user(eve);
  perform public.accept_invitation(inv.token);
  perform tests.ok(public.app_role(org, 'board', eve) = 'admin', 'invited with a named role');
  perform tests.ok(public.app_role(org, 'ledger', eve) = 'member', 'and a role set for one app');
  perform tests.ok(public.app_role(org, 'charter', eve) = 'viewer', 'and viewer elsewhere');

  -- Editors for plan limits: OpenAppHub owner/admins, or member/admin in any app.
  perform tests.as_super();
  perform tests.ok(public.is_org_editor(org, dee), 'an OpenAppHub admin is an editor');
  perform tests.ok(public.is_org_editor(org, eve), 'an app admin is an editor');
  perform tests.ok(not public.is_org_editor(org, cy), 'a viewer everywhere is not');

  -- Members see everyone's roles; leaving removes what was set.
  perform tests.as_user(bob);
  perform tests.ok(tests.count(format('select * from public.org_app_roles(%L)', org)) = 15, 'five people times three apps');
  perform tests.as_super();
  delete from public.memberships where org_id = org and user_id = bob;
  perform tests.ok(not exists (select 1 from public.app_role_overrides where user_id = bob), 'they go with the membership');
end $$;
rollback;

-- Plan limits count app editors (hub 0006). Billing is a hub table: skip when self-hosted.
begin;
do $$
declare
  ann uuid := tests.create_user('ann2@roles.org');
  org uuid;
  extra uuid;
  named uuid;
begin
  if not exists (select 1 from pg_namespace where nspname = 'billing') then return; end if;
  perform tests.as_user(ann);
  org := public.create_organization('Limits Org');
  perform tests.as_super();
  update public.instance_settings set billing_enabled = true where id;
  update billing.subscriptions set plan_id = 'starter', status = 'active', apps = '{board}' where org_id = org;
  for i in 1..4 loop
    extra := tests.create_user(format('lm%s@roles.org', i));
    insert into public.memberships (org_id, user_id, role) values (org, extra, 'member');
    insert into public.app_role_overrides (org_id, user_id, app, role) values (org, extra, 'board', 'member');
  end loop;
  extra := tests.create_user('lm5@roles.org');
  insert into public.memberships (org_id, user_id, role) values (org, extra, 'member');
  perform tests.ok(true, 'an OpenAppHub member who is a viewer everywhere does not count');
  perform tests.throws(format('insert into public.app_role_overrides (org_id, user_id, app, role) values (%L, %L, %L, %L)', org, extra, 'ledger', 'member'),
    '6th editor by an app role is refused', 'allows 5 editors');
end $$;
rollback;
\echo ok
