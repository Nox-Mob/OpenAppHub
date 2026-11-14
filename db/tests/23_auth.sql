-- Authentication hardening (core 0018): two-step sign-in required of owners and admins when the
-- organization asks, and a recent sign-in for dangerous actions.
begin;
create or replace function pg_temp.as_session(p_uid uuid, p_aal text, p_signed_in_ago interval) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', json_build_array(json_build_object('method', 'password',
      'timestamp', extract(epoch from now() - p_signed_in_ago)::bigint)))::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
do $$
declare
  ann uuid := tests.create_user('ann@mfa.example.org');
  dee uuid := tests.create_user('dee@mfa.example.org');
  bob uuid := tests.create_user('bob@mfa.example.org');
  org uuid;
begin
  perform tests.as_user(ann);
  org := public.create_organization('MFA Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, dee, 'admin'), (org, bob, 'member');

  -- Off by default: everyone in as before.
  perform pg_temp.as_session(dee, 'aal1', interval '1 minute');
  perform tests.ok(public.is_member(org) and public.has_role(org, '{admin}'), 'off: an admin signed in with a password is in');

  -- Turning it on needs the person doing it to have signed in with a code.
  perform pg_temp.as_session(ann, 'aal1', interval '1 minute');
  perform tests.throws(format('select public.set_org_require_mfa(%L, true)', org), 'not without a code yourself', 'Set up two-step sign-in');
  perform pg_temp.as_session(ann, 'aal2', interval '1 minute');
  perform public.set_org_require_mfa(org, true);
  perform tests.ok((public.org_security_settings(org) ->> 'require_mfa_admins')::boolean, 'on');
  perform tests.ok(public.is_member(org), 'the owner, signed in with a code, is in');

  -- An admin with only a password: kept out of this organization, and told why.
  perform pg_temp.as_session(dee, 'aal1', interval '1 minute');
  perform tests.ok(not public.is_member(org) and not public.has_role(org, '{admin}'), 'an admin with a password only is out');
  perform tests.ok(public.app_role(org, 'board') is null, 'no app either');
  perform tests.ok((public.my_mfa_status() -> 'blocked_orgs' -> 0 ->> 'reason') = 'setup', 'told to set it up');
  perform pg_temp.as_session(dee, 'aal2', interval '1 minute');
  perform tests.ok(public.is_member(org) and public.has_role(org, '{admin}'), 'with a code, in');
  -- Members aren't affected by the owners-and-admins rule.
  perform pg_temp.as_session(bob, 'aal1', interval '1 minute');
  perform tests.ok(public.is_member(org), 'a member with a password is in');
  -- Others still see the admin's role as it is (the Members page).
  perform pg_temp.as_session(ann, 'aal2', interval '1 minute');
  perform tests.ok(public.app_role(org, 'board', dee) is not null, 'describing someone else is unchanged');

  -- Dangerous actions need a recent sign-in.
  perform pg_temp.as_session(ann, 'aal2', interval '2 hours');
  perform tests.throws(format('select public.transfer_ownership(%L, %L)', org, dee), 'an old sign-in can''t hand over ownership', 'sign in again');
  perform tests.throws(format('select public.delete_organization(%L, %L)', org, 'MFA Org'), 'nor delete the organization', 'sign in again');
  perform tests.throws('select public.assert_recent_sign_in(15)', 'nor delete the account', 'sign in again');
  perform pg_temp.as_session(ann, 'aal2', interval '2 minutes');
  perform public.assert_recent_sign_in(15);
  perform tests.ok(true, 'a fresh sign-in is fine');

  -- Functions: visitors who aren't signed in can call only the allow-list.
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.tuning_problems('public') where kind = 'callable without signing in'),
    'no other function is open to visitors');
  perform tests.ok(has_function_privilege('anon', 'public.get_invitation(text)', 'EXECUTE'), 'the invitation page still works');
end $$;
rollback;

-- The audit log records security changes.
begin;
do $$
declare
  ann uuid := tests.create_user('ann@audit.example.org');
  bob uuid := tests.create_user('bob@audit.example.org');
  org uuid;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Audit Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member');
  perform tests.as_user(ann);
  perform public.set_app_role(org, bob, 'ledger', 'admin');
  perform public.set_org_role_settings(org, true);
  perform tests.as_super();
  perform tests.ok(exists (select 1 from hub.audit_log where org_id = org and table_name = 'app_role_overrides' and actor = ann),
    'a role change in an app is in the audit log, with who did it');
  perform tests.ok(exists (select 1 from hub.audit_log where org_id = org and table_name = 'org_role_settings'),
    'and a security setting change');
end $$;
rollback;
