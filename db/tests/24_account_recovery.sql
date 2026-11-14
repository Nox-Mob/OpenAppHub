-- A way back in (core 0019): backup codes and a recovery email remove two-step sign-in so the
-- person can set it up again. Every step is recorded and emailed.
begin;
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
  ann uuid := tests.create_user('ann@recover.example.org');
  cat uuid := tests.create_user('cat@recover.example.org');
  codes text[];
  tok text;
  link text;
begin
  -- Backup codes need an authenticator and a session signed in with it.
  perform pg_temp.sess(ann, 'aal1');
  perform tests.throws('select public.create_recovery_codes()', 'no codes without two-step sign-in', 'Set up two-step');
  perform tests.as_super();
  insert into auth.mfa_factors (user_id, status) values (ann, 'verified');
  perform pg_temp.sess(ann, 'aal1');
  perform tests.throws('select public.create_recovery_codes()', 'no codes from a password-only session', 'Set up two-step');
  perform pg_temp.sess(ann, 'aal2');
  codes := public.create_recovery_codes();
  perform tests.ok(array_length(codes, 1) = 10, 'ten codes');
  perform tests.ok((select count(distinct c) from unnest(codes) c) = 10, 'all different');
  perform tests.ok(codes[1] ~ '^[A-Z2-9]{5}-[A-Z2-9]{5}$', 'easy to read: XXXXX-XXXXX, no 0/O or 1/I');
  perform tests.ok((public.account_security_status() ->> 'codes_left')::int = 10, 'ten left');
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.mfa_recovery_codes where code_hash = any (codes)), 'only fingerprints are stored');

  -- Using one: from a password-only session (they lost the phone).
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(not public.use_recovery_code('AAAAA-AAAAA'), 'a wrong code fails');
  perform tests.ok(public.use_recovery_code(lower(replace(codes[3], '-', ' '))), 'a right code works, typed loosely');
  perform tests.ok(not public.use_recovery_code(codes[3]), 'once');
  -- The server removes the authenticator first; finishing before that is refused.
  perform tests.throws('select public.finish_two_step_recovery()', 'not while the authenticator is still there', 'still on');
  perform tests.as_super();
  delete from auth.mfa_factors where user_id = ann;
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(public.finish_two_step_recovery() = 'backup_code', 'finished');
  perform tests.throws('select public.finish_two_step_recovery()', 'only once per recovery', 'Start again');
  perform tests.ok((public.account_security_status() ->> 'codes_total')::int = 0, 'the old codes are gone');
  perform tests.ok(exists (select 1 from public.account_security_events where user_id = ann and kind = 'two_step_removed'),
    'it''s in the security activity');
  perform tests.as_super();
  perform tests.ok(exists (select 1 from public.email_outbox where to_user_id = ann and template = 'account.security_notice'
    and data ->> 'event' = 'two_step_removed'), 'and emailed');

  -- Codes made for an authenticator that was later removed don't come back with a new one.
  perform pg_temp.sess(ann, 'aal2');
  -- (no authenticator now: make codes as the database would have for the old one)
  perform tests.as_super();
  insert into public.mfa_recovery_codes (user_id, code_hash, created_at)
  values (ann, public._fingerprint(ann::text || ':' || 'OLDCODEAAA'), now() - interval '1 day');
  insert into auth.mfa_factors (user_id, status) values (ann, 'verified');
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(not public.use_recovery_code('OLDCO-DEAAA'), 'an old authenticator''s code doesn''t work');
  perform tests.ok((public.account_security_status() ->> 'codes_total')::int = 0, 'and isn''t counted');

  -- Too many wrong tries lock recovery for an hour.
  perform pg_temp.sess(ann, 'aal1');
  -- (three wrong tries above, seven here)
  for i in 1..7 loop perform public.use_recovery_code('BBBBB-BBBBB'); end loop;
  perform tests.throws('select public.use_recovery_code(''CCCCC-CCCCC'')', 'locked after ten wrong tries', 'Too many tries');
  perform tests.as_super();
  delete from public.account_security_events where user_id = ann and kind = 'recovery_failed';

  -- The recovery email: setting it needs the one-time pass, and can't be the sign-in address.
  perform pg_temp.sess(ann, 'aal1');
  perform tests.throws('select public.set_recovery_email(''ann.backup@example.org'', null)', 'needs the pass', 'confirm it''s you');
  perform pg_temp.sess(ann, 'aal2', '[["password", 5], ["totp", 5]]');
  tok := public.begin_reauth('recovery_settings');
  perform tests.throws(format('select public.set_recovery_email(%L, %L)', 'ANN@recover.example.org', tok), 'not the sign-in address', 'different address');
  tok := public.begin_reauth('recovery_settings');
  perform tests.throws(format('select public.set_recovery_email(%L, %L)', 'a@b.c, x@y.z', tok), 'one address only', 'one email address');
  tok := public.begin_reauth('recovery_settings');
  perform public.set_recovery_email('Ann.Backup@example.org', tok);
  perform tests.ok(public.account_security_status() ->> 'recovery_email' = 'ann.backup@example.org', 'saved');
  perform tests.ok(not (public.account_security_status() ->> 'recovery_email_verified')::boolean, 'not confirmed yet');
  -- A link can't go to an address that isn't confirmed.
  perform pg_temp.sess(ann, 'aal1');
  perform tests.throws('select public.send_recovery_link()', 'only to a confirmed address', 'no confirmed recovery email');
  -- Confirming it: the link in the email, by the same person.
  perform tests.as_super();
  select data ->> 'token' into link from public.email_outbox where template = 'account.recovery_verify' and to_email = 'ann.backup@example.org';
  perform tests.ok(exists (select 1 from public.email_outbox where to_user_id = ann and to_email is null
    and data ->> 'event' = 'recovery_email_set'), 'the sign-in address is told');
  perform pg_temp.sess(cat, 'aal1');
  perform tests.ok(not public.verify_recovery_email(link), 'someone else can''t confirm it');
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(public.verify_recovery_email(link), 'confirmed');
  perform tests.ok(not public.verify_recovery_email(link), 'the link works once');

  -- The recovery link: to the recovery address, and the sign-in address is told.
  perform public.send_recovery_link();
  perform tests.as_super();
  select data ->> 'token' into link from public.email_outbox where template = 'account.recovery_link' and to_email = 'ann.backup@example.org';
  perform tests.ok(link ~ '^[0-9a-f]{64}$', 'the link is emailed to the recovery address');
  perform tests.ok(exists (select 1 from public.email_outbox where to_user_id = ann and to_email is null
    and data ->> 'event' = 'recovery_link_sent'), 'and the sign-in address is told');
  perform pg_temp.sess(cat, 'aal1');
  perform tests.ok(not public.use_recovery_link(link), 'someone else can''t use it');
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(public.use_recovery_link(link), 'it works');
  perform tests.ok(not public.use_recovery_link(link), 'once');
  perform public.send_recovery_link();
  perform public.send_recovery_link();
  perform tests.throws('select public.send_recovery_link()', 'three links an hour', 'Too many links');

  -- Each person sees only their own security activity.
  perform pg_temp.sess(cat, 'aal1');
  perform tests.ok(not exists (select 1 from public.account_security_events where user_id = ann), 'others can''t read it');
  perform tests.ok(public.account_security_status() ->> 'recovery_email' is null, 'nor the recovery email');
  perform pg_temp.sess(ann, 'aal1');
  perform tests.ok(exists (select 1 from public.account_security_events where kind = 'recovery_email_verified'), 'they can read their own');

  -- Removing the recovery email.
  perform pg_temp.sess(ann, 'aal2', '[["password", 5], ["totp", 5]]');
  perform public.set_recovery_email(null, public.begin_reauth('recovery_settings'));
  perform tests.ok(public.account_security_status() ->> 'recovery_email' is null, 'removed');

  -- Visitors can't touch any of it.
  perform tests.as_super();
  perform tests.ok(not has_function_privilege('anon', 'public.use_recovery_code(text)', 'EXECUTE')
    and not has_function_privilege('anon', 'public.send_recovery_link()', 'EXECUTE'), 'visitors can''t');
  perform tests.ok(not has_table_privilege('authenticated', 'public.mfa_recovery_codes', 'SELECT')
    and not has_table_privilege('authenticated', 'public.account_recovery', 'SELECT'), 'nobody reads the tables directly');
end $$;
rollback;
