-- Org isolation, roles, profiles, create/rename/delete organization.
begin;
do $$
declare
  alice uuid := tests.create_user('alice@example.org', '{"full_name":"Alice Owner"}');
  bob uuid := tests.create_user('bob@example.org', '{"name":"Bob"}');
  carol uuid := tests.create_user('carol@example.org');
  dave uuid := tests.create_user('dave@example.org');
  org_a uuid;
  org_b uuid;
begin
  -- handle_new_user: full_name, then name, then the email's local part.
  perform tests.ok((select display_name from public.profiles where id = alice) = 'Alice Owner', 'profile uses full_name');
  perform tests.ok((select display_name from public.profiles where id = bob) = 'Bob', 'profile uses name');
  perform tests.ok((select display_name from public.profiles where id = carol) = 'carol', 'profile falls back to email');

  perform tests.as_user(alice);
  org_a := public.create_organization('  Alpha Association  ');
  perform tests.ok((select name from public.organizations where id = org_a) = 'Alpha Association', 'name is trimmed');
  perform tests.ok((select slug from public.organizations where id = org_a) like 'alpha-association-%', 'slug from name');
  perform tests.ok(public.has_role(org_a, '{owner}'), 'creator is owner');
  perform tests.throws($q$select public.create_organization('   ')$q$, 'empty name rejected', '1 to 120');
  perform tests.throws($q$insert into public.organizations (name) values ('Sneaky')$q$, 'no direct org insert');

  perform tests.as_user(bob);
  org_b := public.create_organization('Beta Board');

  -- Isolation: each user only sees their own org.
  perform tests.ok(tests.count('select * from public.organizations') = 1, 'bob sees one org');
  perform tests.ok(not public.is_member(org_a), 'bob is not in alpha');
  perform tests.ok(tests.count(format('select * from public.memberships where org_id = %L', org_a)) = 0, 'bob cannot read alpha memberships');
  perform tests.ok(tests.count(format('select * from public.profiles where id = %L', alice)) = 0, 'bob cannot read alice profile');
  perform tests.throws(format('select public.rename_organization(%L, %L)', org_a, 'Hacked'), 'non-member cannot rename', 'owner or an admin');

  -- Anon sees nothing.
  perform tests.as_anon();
  perform tests.throws('select count(*) from public.organizations', 'anon cannot read organizations');
  perform tests.throws('select count(*) from public.profiles', 'anon cannot read profiles');
  perform tests.throws(format('select public.is_member(%L)', org_a), 'anon cannot call is_member');

  -- Add members directly (as superuser) to test roles.
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values
    (org_a, bob, 'admin'), (org_a, carol, 'member'), (org_a, dave, 'viewer');

  perform tests.as_user(dave);
  perform tests.ok(public.is_member(org_a), 'viewer is a member');
  perform tests.ok(not public.can_write(org_a, 'board'), 'viewer cannot write');
  perform tests.ok(tests.count(format('select * from public.profiles where id = %L', alice)) = 1, 'members see each other''s profiles');
  perform tests.ok(tests.count(format('select * from public.memberships where org_id = %L', org_a)) = 4, 'members see the member list');
  update public.memberships set role = 'admin' where org_id = org_a and user_id = dave;
  perform tests.ok((select role from public.memberships where org_id = org_a and user_id = dave) = 'viewer', 'viewer cannot promote self');
  perform tests.throws(format('select public.rename_organization(%L, %L)', org_a, 'X'), 'viewer cannot rename', 'owner or an admin');

  perform tests.as_user(carol);
  perform tests.ok(public.can_write(org_a, 'board'), 'member can write with billing off');
  update public.memberships set role = 'viewer' where org_id = org_a and user_id = dave;
  perform tests.ok((select role from public.memberships where org_id = org_a and user_id = dave) = 'viewer', 'member cannot change roles');
  perform tests.ok((select role from public.memberships where org_id = org_a and user_id = dave) = 'viewer', 'still viewer');

  perform tests.as_user(bob);
  update public.memberships set role = 'member' where org_id = org_a and user_id = dave;
  perform tests.ok((select role from public.memberships where org_id = org_a and user_id = dave) = 'member', 'admin changes roles');
  perform public.rename_organization(org_a, 'Alpha Assoc');
  perform tests.ok((select name from public.organizations where id = org_a) = 'Alpha Assoc', 'admin renames');
  perform tests.throws(format('update public.memberships set user_id = %L where org_id = %L and user_id = %L', bob, org_a, dave), 'cannot reassign a membership''s user');

  -- Profiles: update own row only.
  perform tests.as_user(carol);
  update public.profiles set display_name = 'Carol C' where id = carol;
  update public.profiles set display_name = 'Pwned' where id = alice;
  perform tests.as_super();
  perform tests.ok((select display_name from public.profiles where id = carol) = 'Carol C', 'update own profile');
  perform tests.ok((select display_name from public.profiles where id = alice) = 'Alice Owner', 'cannot update other profile');

  -- Leaving and removing.
  perform tests.as_user(dave);
  delete from public.memberships where org_id = org_a and user_id = dave;
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.memberships where org_id = org_a and user_id = dave), 'member can leave');
  perform tests.as_user(bob);
  delete from public.memberships where org_id = org_a and user_id = carol;
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.memberships where org_id = org_a and user_id = carol), 'admin removes member');

  -- instance_settings: signed-in read, no write.
  perform tests.as_user(bob);
  perform tests.ok((select billing_enabled from public.instance_settings) = false, 'billing off by default');
  perform tests.throws('update public.instance_settings set billing_enabled = true', 'cannot change instance settings');
  perform tests.ok(public.has_app_access(org_a, 'board'), 'app access when billing off');

  -- Billing on without the billing schema: degrade to no write access.
  perform tests.as_super();
  update public.instance_settings set billing_enabled = true;
  perform tests.as_user(bob);
  perform tests.ok(not public.has_app_access(org_a, 'board'), 'billing on without billing schema denies');
  perform tests.ok(not public.can_write(org_a, 'board'), 'and so cannot write');
  perform tests.ok(public.is_member(org_a), 'but can still read');
end
$$;
rollback;
\echo ok
