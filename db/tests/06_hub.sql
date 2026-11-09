-- Hub schema: waitlist, legal acceptances, audit log, demo tools.
begin;
do $$
declare
  alice uuid := tests.create_user('alice@example.org', '{"full_name":"Alice","terms_accepted_at":"2026-11-09T10:00:00Z","privacy_accepted_at":"2026-11-09T10:00:00Z"}');
  bob uuid := tests.create_user('bob@example.org');
  carol uuid := tests.create_user('carol@example.org');
  op uuid := tests.create_user('op@example.org');
  org uuid;
  demo uuid;
  inv record;
begin
  -- Legal acceptance recorded from sign-up metadata.
  perform tests.ok((select count(*) from hub.legal_acceptances where user_id = alice) = 2, 'terms and privacy recorded');
  perform tests.ok((select version from hub.legal_acceptances where user_id = alice and document = 'terms') = '2026-11-09', 'version from date');
  perform tests.ok((select count(*) from hub.legal_acceptances where user_id = bob) = 0, 'no metadata, nothing recorded');

  -- Waitlist: anyone can join once; nobody can read it through the API.
  perform tests.as_anon();
  perform public.hub_join_waitlist('  New.Person@Example.org ', 'landing');
  perform public.hub_join_waitlist('new.person@example.org');
  perform tests.throws($q$select public.hub_join_waitlist('not-an-email')$q$, 'invalid email refused', 'valid email');
  perform tests.throws($q$select * from hub.waitlist$q$, 'anon cannot read the waitlist');
  perform tests.as_user(bob);
  perform tests.throws($q$select * from hub.waitlist$q$, 'members cannot read the waitlist');
  perform tests.throws($q$select * from hub.audit_log$q$, 'hub schema is not reachable');
  perform tests.as_super();
  perform tests.ok((select count(*) from hub.waitlist) = 1, 'one waitlist row, normalised');

  -- Audit log: org, membership and invitation changes, without token hashes.
  perform tests.as_user(alice);
  org := public.create_organization('Audited Org');
  select * into inv from public.create_invitation(org, 'bob@example.org', 'member');
  perform public.rename_organization(org, 'Audited Org 2');
  perform tests.as_super();
  perform tests.ok((select count(*) from hub.audit_log where org_id = org and table_name = 'organizations' and action = 'insert') = 1, 'org insert logged');
  perform tests.ok((select count(*) from hub.audit_log where org_id = org and table_name = 'memberships') = 1, 'owner membership logged');
  perform tests.ok((select count(*) from hub.audit_log where org_id = org and table_name = 'organizations' and action = 'update') = 1, 'rename logged');
  perform tests.ok((select actor from hub.audit_log where org_id = org and table_name = 'organizations' and action = 'insert') = alice, 'actor recorded');
  perform tests.ok(not exists (select 1 from hub.audit_log where table_name = 'invitations' and (new_data ? 'token_hash' or old_data ? 'token_hash')), 'no token hashes in the log');

  -- Only owner/admin can read it.
  perform tests.as_user(alice);
  perform tests.ok(tests.count(format('select * from public.hub_org_audit(%L)', org)) >= 4, 'owner reads the log');
  perform tests.ok((select actor_name from public.hub_org_audit(org) order by id limit 1) = 'Alice', 'actor names shown');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, carol, 'member');
  perform tests.as_user(carol);
  perform tests.throws(format('select * from public.hub_org_audit(%L)', org), 'members cannot read the log', 'owner or an admin');

  -- The record survives deleting the org.
  perform tests.as_user(alice);
  perform public.delete_organization(org, 'Audited Org 2');
  perform tests.as_super();
  perform tests.ok((select count(*) from hub.audit_log where org_id = org and table_name = 'organizations' and action = 'delete') = 1, 'deletion logged and kept');

  -- Demo tools: operators only, staging only.
  perform tests.as_user(op);
  perform tests.ok(not public.hub_demo_tools_enabled(), 'not an operator');
  perform tests.throws($q$select public.hub_create_demo_org('Demo')$q$, 'non-operator refused', 'platform operators');
  perform tests.as_super();
  insert into hub.platform_operators (user_id) values (op);
  perform tests.as_user(op);
  perform tests.ok(not public.hub_demo_tools_enabled(), 'operator, but not staging (production)');
  perform tests.throws($q$select public.hub_create_demo_org('Demo')$q$, 'refused outside staging', 'on staging');
  perform tests.as_super();
  update hub.instance set environment = 'staging';
  perform tests.as_user(op);
  demo := public.hub_create_demo_org('Demo Association');
  perform tests.ok(public.has_role(demo, '{owner}'), 'operator owns the demo org');
  perform tests.ok(tests.count('select * from public.hub_list_demo_orgs()') = 1, 'listed');
  perform tests.as_user(alice);
  org := public.create_organization('Real Org');
  perform tests.as_user(op);
  perform tests.throws(format('select public.hub_delete_demo_org(%L)', org), 'cannot delete a real org', 'isn''t a demo');
  perform public.hub_delete_demo_org(demo);
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.organizations where id = demo), 'demo org deleted');
  perform tests.ok(exists (select 1 from public.organizations where id = org), 'real org untouched');
end
$$;
rollback;

\echo ok
