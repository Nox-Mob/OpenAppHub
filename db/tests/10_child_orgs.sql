-- Child organizations (core 0006) and their billing (hub 0004).
begin;
do $$
declare
  natl_owner uuid := tests.create_user('natl@example.org', '{"full_name":"Nora National"}');
  chap_admin uuid := tests.create_user('chap@example.org', '{"full_name":"Chad Chapter"}');
  outsider uuid := tests.create_user('out@example.org', '{"full_name":"Olga Outside"}');
  natl uuid; chap uuid; again uuid; unit uuid := gen_random_uuid();
begin
  perform tests.as_user(natl_owner);
  natl := public.create_organization('Delta National');
  perform tests.as_super();
  update public.instance_settings set billing_enabled = true;

  -- Browsers can't create child organizations.
  perform tests.as_user(chap_admin);
  perform tests.throws(format('select public._create_child_organization(%L, %L, %L, %L, %L)', natl, 'X', chap_admin, 'charter', unit),
    'clients cannot create child organizations', 'permission denied');

  perform tests.as_service();
  chap := public._create_child_organization(natl, 'Delta Chapter 12', chap_admin, 'charter', unit, array[natl_owner]);
  again := public._create_child_organization(natl, 'Delta Chapter 12', chap_admin, 'charter', unit, array[natl_owner]);
  perform tests.ok(chap = again, 'the same source gives the same organization');

  perform tests.as_super();
  perform tests.ok((select parent_org_id from public.organizations where id = chap) = natl, 'parent recorded');
  perform tests.ok((select role from public.memberships where org_id = chap and user_id = chap_admin) = 'owner', 'requester owns it');
  perform tests.ok((select role from public.memberships where org_id = chap and user_id = natl_owner) = 'admin', 'parent owner is an admin');
  perform tests.ok(not exists (select 1 from billing.subscriptions where org_id = chap), 'no trial of its own');

  -- One level only.
  perform tests.as_service();
  perform tests.throws(format('select public._create_child_organization(%L, %L, %L, %L, %L)', chap, 'Sub', chap_admin, 'charter', gen_random_uuid()),
    'a child cannot have children', 'can''t have chapters');

  -- Billing follows the parent.
  perform tests.as_user(chap_admin);
  perform tests.ok((select status from public.get_org_billing(chap)) = 'trialing', 'billing shows the parent''s trial');
  perform tests.ok(public.has_app_access(chap, 'board'), 'access follows the parent''s trial');
  perform tests.ok((select name from public.billing_parent_org(chap)) = 'Delta National', 'parent name for the billing page');
  perform tests.ok((select name from public.organizations where id = natl) = 'Delta National', 'a chapter member can read the parent''s name');
  perform tests.ok(tests.count(format('select * from public.memberships where org_id = %L', natl)) = 0, 'but not the parent''s members');
  perform tests.as_super();
  update billing.subscriptions set status = 'expired', trial_ends_at = now() - interval '1 day' where org_id = natl;
  perform tests.as_user(chap_admin);
  perform tests.ok(not public.has_app_access(chap, 'board'), 'read-only when the parent''s plan lapses');
  perform tests.ok(not public.can_write(chap, 'board'), 'no writes then');
  perform tests.as_super();
  update billing.subscriptions set status = 'active', plan_id = 'starter', apps = '{board}' where org_id = natl;
  perform tests.as_user(chap_admin);
  perform tests.ok(public.has_app_access(chap, 'board') and not public.has_app_access(chap, 'ledger'), 'the parent''s apps');

  -- Members of a chapter don't count against a plan's editor limit.
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (chap, outsider, 'member');
  perform tests.ok(exists (select 1 from public.memberships where org_id = chap and user_id = outsider), 'added without a limit');

  -- Outsiders see nothing.
  delete from public.memberships where org_id = chap and user_id = outsider;
  perform tests.as_user(outsider);
  perform tests.ok(tests.count(format('select * from public.billing_parent_org(%L)', chap)) = 0, 'outsiders get no parent');
  perform tests.ok(tests.count(format('select * from public.organizations where id = %L', natl)) = 0, 'outsiders cannot read the parent');
end $$;
rollback;
\echo ok
