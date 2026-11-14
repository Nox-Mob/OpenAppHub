-- Exactly one owner; the owner only changes through transfer_ownership.
begin;
do $$
declare
  alice uuid := tests.create_user('alice@example.org');
  bob uuid := tests.create_user('bob@example.org');
  carol uuid := tests.create_user('carol@example.org');
  eve uuid := tests.create_user('eve@example.org');
  org uuid;
begin
  perform tests.as_user(alice);
  org := public.create_organization('Alpha');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'admin'), (org, carol, 'member');

  -- Admin can't make anyone owner, demote the owner or remove the owner.
  perform tests.as_user(bob);
  perform tests.throws(format('update public.memberships set role = %L where org_id = %L and user_id = %L', 'owner', org, carol), 'admin cannot make someone owner');
  update public.memberships set role = 'admin' where org_id = org and user_id = alice;
  delete from public.memberships where org_id = org and user_id = alice;
  perform tests.as_super();
  perform tests.ok((select count(*) from public.memberships where org_id = org and role = 'owner') = 1, 'still one owner');
  perform tests.ok((select role from public.memberships where org_id = org and user_id = alice) = 'owner', 'alice still owner');

  -- The owner can't leave or demote themselves either.
  perform tests.as_user(alice);
  delete from public.memberships where org_id = org and user_id = alice;
  update public.memberships set role = 'admin' where org_id = org and user_id = alice;
  perform tests.ok(public.has_role(org, '{owner}'), 'owner cannot leave or self-demote');

  -- Even the database owner (bypassing RLS) is stopped by the trigger.
  perform tests.as_super();
  perform tests.throws(format('update public.memberships set role = %L where org_id = %L and user_id = %L', 'admin', org, alice), 'trigger blocks demoting owner', 'transfer');
  perform tests.throws(format('update public.memberships set role = %L where org_id = %L and user_id = %L', 'owner', org, carol), 'trigger blocks a second owner', 'transfer');
  perform tests.throws(format('delete from public.memberships where org_id = %L and user_id = %L', org, alice), 'trigger blocks removing owner', 'transfer ownership first');
  perform tests.throws(format('insert into public.memberships (org_id, user_id, role) values (%L, %L, %L)', org, eve, 'owner'), 'cannot insert a second owner', 'already has an owner');
  perform tests.throws(format('delete from auth.users where id = %L', alice), 'cannot delete the account of an owner', 'transfer ownership first');

  -- Transfer: only the owner, only to an existing member.
  perform tests.as_user(bob);
  perform tests.throws(format('select public.transfer_ownership(%L, %L)', org, bob), 'admin cannot transfer', 'only the owner');
  perform tests.throws(format('select * from public.ownership_transfer_candidates(%L)', org), 'admin cannot list candidates', 'only the owner');

  perform tests.as_user(alice);
  perform tests.ok(tests.count(format('select * from public.ownership_transfer_candidates(%L)', org)) = 2, 'candidates: everyone but the owner');
  perform tests.throws(format('select public.transfer_ownership(%L, %L)', org, eve), 'new owner must be a member', 'already be a member');
  perform tests.throws(format('select public.transfer_ownership(%L, %L)', org, alice), 'cannot transfer to self', 'another member');

  perform public.transfer_ownership(org, carol, null, tests.reauth(alice, 'transfer_ownership'));
  perform tests.as_super();
  perform tests.ok((select role from public.memberships where org_id = org and user_id = carol) = 'owner', 'carol is owner');
  perform tests.ok((select role from public.memberships where org_id = org and user_id = alice) = 'admin', 'alice is admin');
  perform tests.ok((select count(*) from public.memberships where org_id = org and role = 'owner') = 1, 'exactly one owner');
  perform tests.ok(coalesce(current_setting('app.ownership_transfer', true), '') = '', 'transfer flag is cleared');

  -- The old owner can now leave.
  perform tests.as_user(alice);
  delete from public.memberships where org_id = org and user_id = alice;
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.memberships where org_id = org and user_id = alice), 'former owner can leave');
end
$$;
rollback;

-- An org left with no owner fails at commit (deferred check).
begin;
do $$
declare
  alice uuid := tests.create_user('alice2@example.org');
  org uuid;
begin
  perform tests.as_user(alice);
  org := public.create_organization('No Owner');
  perform tests.as_super();
  perform set_config('app.ownership_transfer', 'on', true);
  update public.memberships set role = 'admin' where org_id = org;
  perform tests.throws('set constraints all immediate', 'zero owners is rejected', 'exactly one owner');
end
$$;
rollback;
\echo ok
