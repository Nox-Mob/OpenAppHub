-- Authentication hardening (core 0018, 0019): two-step sign-in levels for an organization, and
-- confirming it's you right before the most dangerous actions.
begin;
-- A session: who, how strongly signed in, and how they proved it (method, seconds ago).
create or replace function pg_temp.sess(p_uid uuid, p_aal text, p_amr jsonb default '[]'::jsonb) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated', 'aal', p_aal,
    'amr', (select coalesce(jsonb_agg(jsonb_build_object('method', a ->> 0,
              'timestamp', extract(epoch from now())::bigint - (a ->> 1)::int)), '[]'::jsonb)
            from jsonb_array_elements(p_amr) a))::text, true);
  perform set_config('request.jwt.claim.sub', p_uid::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
do $$
declare
  ann uuid := tests.create_user('ann@mfa.example.org');
  dee uuid := tests.create_user('dee@mfa.example.org');
  bob uuid := tests.create_user('bob@mfa.example.org');
  org uuid;
  tok text;
  code text;
begin
  perform tests.as_user(ann);
  org := public.create_organization('MFA Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, dee, 'admin'), (org, bob, 'member');
  insert into auth.mfa_factors (user_id, status) values (ann, 'verified');

  -- Off by default: people without an authenticator are in with a password.
  perform pg_temp.sess(dee, 'aal1');
  perform tests.ok(public.is_member(org) and public.has_role(org, '{admin}'), 'off: an admin with a password is in');
  -- Someone with an authenticator needs its code, whatever the setting.
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(not public.is_member(org), 'with an authenticator, a password alone opens nothing');
  perform tests.ok((public.my_mfa_status() -> 'blocked_orgs' -> 0 ->> 'reason') = 'code', 'and they''re asked for the code');

  -- Choosing a level needs the person doing it to have signed in with a code.
  perform pg_temp.sess(dee, 'aal1');
  perform tests.throws(format('select public.set_org_mfa_level(%L, %L)', org, 'admins'), 'not without a code yourself', 'Set up two-step sign-in');
  perform pg_temp.sess(ann, 'aal2');
  perform tests.throws(format('select public.set_org_mfa_level(%L, %L)', org, 'some'), 'only the three levels', 'Choose off');
  perform tests.ok((public.org_security_settings(org) ->> 'admins_without')::int = 1, 'one admin still needs to set it up');
  perform tests.ok((public.org_security_settings(org) ->> 'members_without')::int = 2, 'two people in all');
  perform public.set_org_mfa_level(org, 'admins');
  perform tests.ok(public.org_security_settings(org) ->> 'mfa_required' = 'admins', 'owner and admins');

  -- Owner and admins: an admin with only a password is kept out, and told why. Members aren't.
  perform pg_temp.sess(dee, 'aal1');
  perform tests.ok(not public.is_member(org) and not public.has_role(org, '{admin}'), 'an admin with a password only is out');
  perform tests.ok(public.app_role(org, 'board') is null, 'no app either');
  perform tests.ok((public.my_mfa_status() -> 'blocked_orgs' -> 0 ->> 'reason') = 'setup', 'told to set it up');
  perform pg_temp.sess(bob, 'aal1');
  perform tests.ok(public.is_member(org), 'a member with a password is in');

  -- Everyone: members too.
  perform pg_temp.sess(dee, 'aal2');
  perform public.set_org_mfa_level(org, 'everyone');
  perform pg_temp.sess(bob, 'aal1');
  perform tests.ok(not public.is_member(org), 'everyone: a member with a password only is out');
  perform tests.ok((public.my_mfa_status() -> 'blocked_orgs' -> 0 ->> 'level') = 'everyone', 'told it''s required of everyone');
  perform pg_temp.sess(bob, 'aal2');
  perform tests.ok(public.is_member(org), 'with a code, in');
  perform pg_temp.sess(ann, 'aal2');
  perform tests.ok(public.app_role(org, 'board', bob) is not null, 'describing someone else is unchanged');
  -- Members can't change it.
  perform pg_temp.sess(bob, 'aal2');
  perform tests.throws(format('select public.set_org_mfa_level(%L, %L)', org, 'off'), 'members can''t change it', 'Only the owner and admins');
  perform pg_temp.sess(ann, 'aal2');
  perform public.set_org_mfa_level(org, 'off');

  -- Confirm it's you: no pass, no deleting or handing over.
  perform tests.throws(format('select public.delete_organization(%L, %L)', org, 'MFA Org'), 'no pass, no delete', 'confirm it''s you');
  perform tests.throws(format('select public.transfer_ownership(%L, %L)', org, dee), 'no pass, no transfer', 'confirm it''s you');
  perform tests.ok(to_regprocedure('public.assert_recent_sign_in(integer)') is null, 'the 15-minute rule is gone');
  -- A password typed long ago doesn't make a pass; a fresh one without the authenticator code
  -- doesn't either, for someone who has one.
  perform pg_temp.sess(ann, 'aal2', '[["password", 900], ["totp", 900]]');
  perform tests.throws('select public.begin_reauth(''delete_organization'')', 'an old sign-in is not enough', 'Type your password');
  perform pg_temp.sess(ann, 'aal1', '[["password", 5]]');
  perform tests.throws('select public.begin_reauth(''delete_organization'')', 'the authenticator code too', 'authenticator app too');
  perform pg_temp.sess(ann, 'aal2', '[["password", 5], ["totp", 5]]');
  tok := public.begin_reauth('transfer_ownership');
  perform tests.ok(length(tok) = 64, 'a pass');
  -- It works for its own action only, for the same person, once.
  perform tests.throws(format('select public.delete_organization(%L, %L, %L)', org, 'MFA Org', tok), 'not for another action', 'confirm it''s you');
  tok := public.begin_reauth('transfer_ownership');
  perform pg_temp.sess(dee, 'aal1');
  perform tests.throws(format('select public.use_reauth(%L, %L)', 'delete_account', tok), 'not for someone else', 'confirm it''s you');
  perform tests.throws(format('select public.use_reauth(%L, %L)', 'transfer_ownership', tok), 'use_reauth is only for account deletion', 'Unknown action');
  perform pg_temp.sess(ann, 'aal2');
  perform public.transfer_ownership(org, dee, null, tok);
  perform tests.ok(public.has_role(org, '{admin}'), 'handed over');

  -- An emailed code, for people without a password: five tries, then a new code.
  perform pg_temp.sess(bob, 'aal1');
  perform public.send_reauth_code('delete_account');
  perform tests.as_super();
  select data ->> 'code' into code from public.email_outbox where template = 'account.reauth_code' and to_user_id = bob order by created_at desc limit 1;
  perform tests.ok(code ~ '^[0-9]{6}$', 'the code is emailed');
  perform pg_temp.sess(bob, 'aal1');
  perform tests.ok(public.begin_reauth('delete_account', '000000x') is null, 'a wrong code makes no pass');
  perform tests.throws(format('select public.begin_reauth(%L, %L)', 'delete_organization', code), 'the code is for one action', 'expired');
  tok := public.begin_reauth('delete_account', code);
  perform tests.ok(tok is not null, 'the right code makes a pass');
  perform public.use_reauth('delete_account', tok);
  perform tests.throws(format('select public.use_reauth(%L, %L)', 'delete_account', tok), 'a pass works once', 'confirm it''s you');
  perform tests.throws(format('select public.begin_reauth(%L, %L)', 'delete_account', code), 'a code works once', 'expired');
  perform public.send_reauth_code('delete_account');
  for i in 1..5 loop perform public.begin_reauth('delete_account', '999999x'); end loop;
  perform tests.as_super();
  select data ->> 'code' into code from public.email_outbox where template = 'account.reauth_code' and to_user_id = bob order by created_at desc limit 1;
  perform pg_temp.sess(bob, 'aal1');
  perform tests.throws(format('select public.begin_reauth(%L, %L)', 'delete_account', code), 'five wrong tries use up the code', 'expired');
  for i in 1..3 loop perform public.send_reauth_code('delete_account'); end loop;
  perform tests.throws('select public.send_reauth_code(''delete_account'')', 'at most five codes an hour', 'Too many');

  -- Once a security email is sent, its code is gone from the outbox.
  perform tests.as_super();
  update public.email_outbox set status = 'sent' where template = 'account.reauth_code' and to_user_id = bob;
  perform tests.ok(not exists (select 1 from public.email_outbox where template = 'account.reauth_code' and data ? 'code' and status = 'sent'),
    'codes are removed after sending');

  -- Functions: visitors who aren't signed in can call only the allow-list.
  perform tests.ok(not exists (select 1 from public.tuning_problems('public') where kind = 'callable without signing in'),
    'no other function is open to visitors');
  perform tests.ok(has_function_privilege('anon', 'public.get_invitation(text)', 'EXECUTE'), 'the invitation page still works');
  perform tests.ok(not has_function_privilege('anon', 'public.begin_reauth(text, text)', 'EXECUTE'), 'visitors can''t make passes');
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
