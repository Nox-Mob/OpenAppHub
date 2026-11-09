-- Invitations: single use, expiry, revoked, email match, app-only, get_invitation.
begin;
do $$
declare
  alice uuid := tests.create_user('alice@example.org');
  bob uuid := tests.create_user('bob@example.org');
  carol uuid := tests.create_user('carol@example.org');
  unconfirmed uuid := tests.create_user('newbie@example.org', '{}', false);
  stranger uuid := tests.create_user('stranger@example.org');
  org uuid;
  inv record;
  acc record;
  info record;
begin
  perform tests.as_user(alice);
  org := public.create_organization('Alpha');

  -- Validation.
  perform tests.throws(format('select * from public.create_invitation(%L, %L, null, null)', org, 'x@example.org'), 'role or app required', 'must name an app');
  perform tests.throws(format('select * from public.create_invitation(%L, %L, %L)', org, 'x@example.org', 'owner'), 'cannot invite an owner', 'owner');
  perform tests.throws(format('select * from public.create_invitation(%L, %L, %L)', org, 'not-an-email', 'member'), 'email checked', 'valid email');

  -- Create: token returned once, only its hash stored, 14-day default.
  select * into inv from public.create_invitation(org, '  Bob@Example.org ', 'member');
  perform tests.ok(length(inv.token) = 64, 'token is 64 hex chars');
  perform tests.ok((select email from public.invitations where id = inv.invitation_id) = 'bob@example.org', 'email normalised');
  perform tests.ok((select token_hash from public.invitations where id = inv.invitation_id) <> inv.token, 'token not stored');
  perform tests.ok(abs(extract(epoch from (select expires_at from public.invitations where id = inv.invitation_id) - (now() + interval '14 days'))) < 5, 'expires in 14 days');

  -- get_invitation (anon): org name, role, app, masked email, status. Nothing else.
  perform tests.as_anon();
  select * into info from public.get_invitation(inv.token);
  perform tests.ok(info.org_name = 'Alpha' and info.role = 'member' and info.app is null, 'anon sees org and role');
  perform tests.ok(info.email = 'b***@example.org', 'email is masked');
  perform tests.ok(info.status = 'pending', 'pending');
  perform tests.ok(tests.count($q$select * from public.get_invitation('nope')$q$) = 0, 'unknown token reveals nothing');
  perform tests.ok(
    (select string_agg(p.name, ',' order by p.ord) from unnest(
          (select proargnames from pg_proc where oid = 'public.get_invitation(text)'::regprocedure)
        ) with ordinality as p(name, ord)) = 'p_token,org_name,role,app,email,status',
    'get_invitation returns exactly org_name, role, app, email, status');
  perform tests.throws($q$select * from public.invitations$q$, 'anon cannot read invitations table');
  perform tests.throws($q$select * from public.accept_invitation('x')$q$, 'anon cannot accept');

  -- Non-admins cannot create, list or read invitations.
  perform tests.as_user(stranger);
  perform tests.throws(format('select * from public.create_invitation(%L, %L, %L)', org, 's@example.org', 'admin'), 'non-member cannot invite', 'owner or an admin');
  perform tests.throws(format('select * from public.list_invitations(%L)', org), 'non-member cannot list', 'owner or an admin');
  perform tests.ok(tests.count('select * from public.invitations') = 0, 'non-member reads no invitations');

  -- Email must match.
  perform tests.throws(format('select * from public.accept_invitation(%L)', inv.token), 'wrong email rejected', 'different email');

  -- Accept as bob: membership created with the role.
  perform tests.as_user(bob);
  select * into acc from public.accept_invitation(inv.token);
  perform tests.ok(acc.org_id = org and acc.role = 'member' and acc.id = inv.invitation_id, 'returns the invitation');
  perform tests.ok(public.has_role(org, '{member}'), 'bob is now a member');

  -- Single use.
  perform tests.throws(format('select * from public.accept_invitation(%L)', inv.token), 'single use', 'already been used');
  perform tests.as_anon();
  perform tests.ok((select status from public.get_invitation(inv.token)) = 'used', 'status used');

  -- Revoked.
  perform tests.as_user(alice);
  select * into inv from public.create_invitation(org, 'carol@example.org', 'viewer');
  perform tests.ok(tests.count(format('select * from public.list_invitations(%L) where status = %L', org, 'pending')) = 1, 'list shows pending');
  perform public.revoke_invitation(inv.invitation_id);
  perform tests.as_user(carol);
  perform tests.throws(format('select * from public.accept_invitation(%L)', inv.token), 'revoked rejected', 'cancelled');
  perform tests.ok(not public.is_member(org), 'no membership from revoked invitation');
  perform tests.throws(format('select public.revoke_invitation(%L)', inv.invitation_id), 'non-admin cannot revoke', 'not found');

  -- Expired.
  perform tests.as_user(alice);
  select * into inv from public.create_invitation(org, 'carol@example.org', 'viewer', null, '{}', 1);
  perform tests.as_super();
  update public.invitations set expires_at = now() - interval '1 minute' where id = inv.invitation_id;
  perform tests.as_user(carol);
  perform tests.throws(format('select * from public.accept_invitation(%L)', inv.token), 'expired rejected', 'expired');
  perform tests.as_anon();
  perform tests.ok((select status from public.get_invitation(inv.token)) = 'expired', 'status expired');

  -- Unconfirmed email can't accept an emailed invitation.
  perform tests.as_user(alice);
  select * into inv from public.create_invitation(org, 'newbie@example.org', 'member');
  perform tests.as_user(unconfirmed);
  perform tests.throws(format('select * from public.accept_invitation(%L)', inv.token), 'unconfirmed email rejected', 'confirm your email');

  -- App-only invitation: no membership, payload returned for the app's follow-up.
  perform tests.as_user(alice);
  select * into inv from public.create_invitation(org, 'carol@example.org', null, 'charter', '{"member_profile_id":"m1"}');
  perform tests.as_user(carol);
  select * into acc from public.accept_invitation(inv.token);
  perform tests.ok(acc.app = 'charter' and acc.role is null and acc.app_payload ->> 'member_profile_id' = 'm1', 'app payload returned');
  perform tests.ok(not public.is_member(org), 'app-only invitation creates no membership');
  perform tests.as_super();
  perform tests.ok((select accepted_by from public.invitations where id = inv.invitation_id) = carol, 'accepted_by recorded');

  -- Link invitation without an email: anyone signed in can accept once.
  perform tests.as_user(alice);
  select * into inv from public.create_invitation(org, null, 'viewer');
  perform tests.as_user(stranger);
  perform public.accept_invitation(inv.token);
  perform tests.ok(public.has_role(org, '{viewer}'), 'link invitation accepted');

  -- An existing member keeps their role.
  perform tests.as_user(alice);
  select * into inv from public.create_invitation(org, 'bob@example.org', 'viewer');
  perform tests.as_user(bob);
  perform public.accept_invitation(inv.token);
  perform tests.ok(public.has_role(org, '{member}'), 'existing role kept');

  -- Members (non-admin) can't read the invitations table.
  perform tests.ok(tests.count('select * from public.invitations') = 0, 'member reads no invitations');
end
$$;
rollback;
\echo ok
