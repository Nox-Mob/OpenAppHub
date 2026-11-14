-- org_member_directory only for members; delete_organization needs the owner and the exact name.
begin;
do $$
declare
  alice uuid := tests.create_user('alice@example.org', '{"full_name":"Alice"}');
  bob uuid := tests.create_user('bob@example.org');
  stranger uuid := tests.create_user('stranger@example.org');
  org uuid;
  other uuid;
begin
  perform tests.as_user(alice);
  org := public.create_organization('Alpha Association');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'admin');

  -- Directory.
  perform tests.as_user(bob);
  perform tests.ok(tests.count(format('select * from public.org_member_directory(%L)', org)) = 2, 'member sees directory');
  perform tests.ok((select email from public.org_member_directory(org) where user_id = alice) = 'alice@example.org', 'directory has emails');
  perform tests.ok((select display_name from public.org_member_directory(org) where user_id = alice) = 'Alice', 'directory has names');
  perform tests.as_user(stranger);
  perform tests.throws(format('select * from public.org_member_directory(%L)', org), 'non-member cannot read directory', 'not a member');
  perform tests.as_anon();
  perform tests.throws(format('select * from public.org_member_directory(%L)', org), 'anon cannot read directory');

  -- Delete: owner only, exact name.
  perform tests.as_user(bob);
  perform tests.throws(format('select public.delete_organization(%L, %L)', org, 'Alpha Association'), 'admin cannot delete', 'only the owner');
  perform tests.as_user(alice);
  perform tests.throws(format('select public.delete_organization(%L, %L)', org, 'alpha association'), 'name is case-sensitive', 'exactly');
  perform tests.throws(format('select public.delete_organization(%L, %L)', org, 'Alpha Association '), 'name must match exactly', 'exactly');
  perform tests.throws(format('select public.delete_organization(%L, null)', org), 'name required', 'exactly');
  other := public.create_organization('Other');
  perform public.create_invitation(org, 'x@example.org', 'member');
  perform public.delete_organization(org, 'Alpha Association', tests.reauth(alice, 'delete_organization'));

  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.organizations where id = org), 'org deleted');
  perform tests.ok(not exists (select 1 from public.memberships where org_id = org), 'memberships cascade');
  perform tests.ok(not exists (select 1 from public.invitations where org_id = org), 'invitations cascade');
  perform tests.ok(exists (select 1 from public.organizations where id = other), 'other org untouched');
end
$$;
-- The deferred one-owner check must pass at commit after the cascade.
set constraints all immediate;
rollback;
\echo ok
