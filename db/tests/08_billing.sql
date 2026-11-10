-- Suite billing (0002_billing): trials, access, plans, member limit, portal
-- members, Stripe writes through the service-role functions.
begin;
do $$
declare
  alice uuid := tests.create_user('alice@example.org', '{"full_name":"Alice"}');
  bob uuid := tests.create_user('bob@example.org');
  carol uuid := tests.create_user('carol@example.org');
  portal uuid := tests.create_user('portal@example.org');
  stranger uuid := tests.create_user('stranger@example.org');
  org uuid;
  second uuid;
  i int;
  extra uuid;
  rows int;
begin
  grant usage on schema tests to service_role;
  perform tests.ok((select billing_enabled from public.instance_settings where id), 'billing is on after 0002_billing');

  -- Trial: a new organization gets 30 days of every app.
  perform tests.as_user(alice);
  org := public.create_organization('Riverside');
  perform tests.ok((select status = 'trialing' and apps @> '{charter,board,ledger}'
                    and trial_ends_at between now() + interval '29 days' and now() + interval '31 days'
                    from public.get_org_billing(org)), 'trial: 30 days, every app');
  perform tests.ok(public.can_write(org, 'board') and public.can_write(org, 'ledger'), 'trial active: can write');

  -- One trial per person: a second organization starts expired (read-only).
  second := public.create_organization('Second Org');
  perform tests.ok((select status from public.get_org_billing(second)) = 'expired', 'second org: no second trial');
  perform tests.ok(not public.can_write(second, 'board'), 'second org: read-only');
  perform tests.ok(public.is_member(second), 'second org: still readable');

  -- Trial expired: read-only.
  perform tests.as_super();
  update billing.subscriptions set trial_ends_at = now() - interval '1 minute' where org_id = org;
  perform tests.as_user(alice);
  perform tests.ok(not public.can_write(org, 'charter'), 'trial expired: read-only');
  perform tests.ok(not public.has_app_access(org, 'board'), 'trial expired: no app access');

  -- Starter for board: board writable, others read-only.
  perform tests.as_super();
  set local role service_role;
  perform tests.ok(public.billing_apply_subscription(org, 'cus_A', 'sub_A', 'starter', 'active', '{board,ledger}', now() + interval '30 days', false) = org,
                   'service role applies a subscription');
  reset role;
  perform tests.as_user(alice);
  perform tests.ok((select apps from public.get_org_billing(org)) = '{board}', 'starter keeps one app');
  perform tests.ok(public.can_write(org, 'board'), 'starter board: board writable');
  perform tests.ok(not public.can_write(org, 'ledger') and not public.can_write(org, 'charter'), 'starter board: others read-only');

  -- past_due keeps access; canceled removes it.
  perform tests.as_super();
  set local role service_role;
  perform tests.ok(public.billing_set_status('sub_A', 'past_due') = org, 'status change by subscription id');
  reset role;
  perform tests.as_user(alice);
  perform tests.ok(public.can_write(org, 'board'), 'past due: still writable');
  perform tests.as_super();
  set local role service_role;
  perform public.billing_set_status('sub_A', 'canceled');
  reset role;
  perform tests.as_user(alice);
  perform tests.ok(not public.can_write(org, 'board'), 'canceled: read-only');

  -- Suite: every app, whatever was asked for. Found by customer id when no org is given.
  perform tests.as_super();
  set local role service_role;
  perform tests.ok(public.billing_apply_subscription(null, 'cus_A', 'sub_B', 'suite', 'active', '{}', now() + interval '1 year', true) = org,
                   'org found from the customer id');
  perform tests.ok(public.billing_apply_subscription(null, 'cus_nobody', 'sub_nobody', 'suite', 'active', '{}', null, false) is null,
                   'unknown customer: nothing applied');
  perform tests.throws($q$select public.billing_apply_subscription(null, 'cus_A', 'sub_B', 'gold', 'active', '{}', null, false)$q$, 'unknown plan refused', 'Unknown plan');
  reset role;
  perform tests.as_user(alice);
  perform tests.ok((select apps = '{charter,board,ledger}' and cancel_at_period_end and status = 'active'
                    from public.get_org_billing(org)), 'suite: every app, cancel flag kept');

  -- Stripe event idempotency.
  perform tests.as_super();
  set local role service_role;
  perform tests.ok(public.billing_record_event('evt_1', 'checkout.session.completed'), 'first event recorded');
  perform tests.ok(not public.billing_record_event('evt_1', 'checkout.session.completed'), 'duplicate event skipped');
  perform public.billing_forget_event('evt_1');
  perform tests.ok(public.billing_record_event('evt_1', 'checkout.session.completed'), 'forgotten event can be retried');
  perform public.billing_set_customer(second, 'cus_second');
  perform tests.ok(public.billing_customer_for_org(second) = 'cus_second', 'customer saved and read back');
  reset role;

  -- Only the service role writes billing.
  perform tests.as_user(alice);
  perform tests.throws(format('select public.billing_apply_subscription(%L, null, null, %L, %L, %L, null, false)', org, 'plus', 'active', '{}'),
                       'members cannot apply subscriptions', 'permission denied');
  perform tests.throws($q$select public.billing_record_event('evt_x', 'x')$q$, 'members cannot record events', 'permission denied');
  perform tests.throws($q$select * from billing.subscriptions$q$, 'billing schema not reachable', 'permission denied');
  perform tests.as_anon();
  perform tests.throws(format('select * from public.get_org_billing(%L)', org), 'anon cannot read billing', 'permission denied');

  -- Editor limit (0003): Starter allows 5 editors (owner, admin, member); viewers never count.
  perform tests.as_super();
  update billing.subscriptions set plan_id = 'starter', status = 'active', apps = '{board}' where org_id = org;
  for i in 1..4 loop
    extra := tests.create_user(format('m%s@example.org', i));
    insert into public.memberships (org_id, user_id, role) values (org, extra, 'member');
  end loop;
  perform tests.ok((select count(*) from public.memberships where org_id = org) = 5, 'five editors on starter');
  perform tests.throws(format('insert into public.memberships (org_id, user_id, role) values (%L, %L, %L)', org, bob, 'member'),
                       '6th editor refused on starter', 'allows 5 editors');
  for i in 1..6 loop
    extra := tests.create_user(format('v%s@example.org', i));
    insert into public.memberships (org_id, user_id, role) values (org, extra, 'viewer');
  end loop;
  perform tests.ok((select count(*) from public.memberships where org_id = org and role = 'viewer') = 6, 'viewers never count');
  perform tests.throws(format('update public.memberships set role = %L where org_id = %L and user_id = %L', 'member', org, extra),
                       'raising a viewer past the limit is refused', 'allows 5 editors');
  update public.memberships set role = 'admin' where org_id = org and role = 'member'
    and user_id = (select user_id from public.memberships where org_id = org and role = 'member' limit 1);
  perform tests.ok(true, 'changing an editor''s role is never refused');
  update billing.subscriptions set plan_id = 'suite' where org_id = org;
  update public.memberships set role = 'member' where org_id = org and user_id = extra;
  perform tests.ok((select role::text from public.memberships where org_id = org and user_id = extra) = 'member', 'suite: room for more editors');
  delete from public.memberships where org_id = org and role = 'viewer';
  update billing.subscriptions set plan_id = 'plus' where org_id = org;
  for i in 1..15 loop
    extra := tests.create_user(format('p%s@example.org', i));
    insert into public.memberships (org_id, user_id, role) values (org, extra, 'member');
  end loop;
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member');
  perform tests.ok((select count(*) from public.memberships where org_id = org) = 22, 'plus: no editor limit');
  perform tests.as_user(alice);
  perform tests.ok(public.billing_member_count(org) = 22, 'owner sees the editor count');
  perform tests.as_user(bob);
  perform tests.throws(format('select public.billing_member_count(%L)', org), 'members cannot see the count', 'owner or an admin');
  perform tests.ok((select status from public.get_org_billing(org)) = 'active', 'members can read billing');

  -- Portal members (Charter) can read billing but don't count as members.
  perform tests.as_super();
  create schema if not exists charter;
  create table charter.portal_members (org_id uuid, user_id uuid);
  create function charter.is_portal_member(p_org uuid, p_user uuid) returns boolean
    language sql stable security definer set search_path = '' as
    $f$ select exists (select 1 from charter.portal_members pm where pm.org_id = p_org and pm.user_id = coalesce(p_user, auth.uid())) $f$;
  grant usage on schema charter to authenticated;
  grant execute on function charter.is_portal_member(uuid, uuid) to authenticated;
  insert into charter.portal_members values (org, portal);
  perform tests.as_user(portal);
  perform tests.ok((select status from public.get_org_billing(org)) = 'active', 'portal member reads billing');
  perform tests.as_user(stranger);
  perform tests.throws(format('select * from public.get_org_billing(%L)', org), 'strangers cannot read billing', 'not a member');
  perform tests.as_super();
  perform tests.ok((select count(*) from public.memberships where org_id = org) = 22, 'portal members are not memberships');

  -- Trial limit: 10 editors while trialing.
  perform tests.as_user(carol);
  second := public.create_organization('Carol Org');
  perform tests.as_super();
  for i in 1..9 loop
    extra := tests.create_user(format('t%s@example.org', i));
    insert into public.memberships (org_id, user_id, role) values (second, extra, 'member');
  end loop;
  perform tests.throws(format('insert into public.memberships (org_id, user_id, role) values (%L, %L, %L)', second, stranger, 'member'),
                       'trial: 11th editor refused', 'allows 10 editors');

  -- Billing off (self-hosted): no limit and full access.
  update public.instance_settings set billing_enabled = false where id;
  insert into public.memberships (org_id, user_id, role) values (second, stranger, 'member');
  update billing.subscriptions set status = 'expired' where org_id = second;
  perform tests.as_user(carol);
  perform tests.ok(public.can_write(second, 'ledger'), 'billing off: always writable');
  perform tests.as_super();
  update public.instance_settings set billing_enabled = true where id;

  -- Plans for the billing page.
  perform tests.as_user(carol);
  perform tests.ok(tests.count('select * from public.billing_plans()') = 3, 'three placeholder plans');
  perform tests.ok((select max_members from public.billing_plans() where id = 'plus') is null, 'plus is unlimited');

  -- Deleting an organization removes its subscription.
  perform tests.as_user(alice);
  perform public.delete_organization(org, 'Riverside');
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from billing.subscriptions where org_id = org), 'subscription deleted with the org');
  perform tests.ok(exists (select 1 from billing.trial_grants where user_id = alice), 'trial grant kept: no new trial by deleting');
end
$$;
rollback;

\echo ok
