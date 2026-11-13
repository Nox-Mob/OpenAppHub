-- Notifications (core 0013, hub 0007, H-02): who gets what, each person's choices, the list.
begin;
do $$
declare
  ann uuid := tests.create_user('ann@notify.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@notify.org', '{"full_name":"Bob Member"}');
  dee uuid := tests.create_user('dee@notify.org', '{"full_name":"Dee Admin"}');
  org uuid;
  wf uuid;
  run bigint;
  n int;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Notify Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, dee, 'admin');

  -- Someone joins: the owner is told, in the list and by email.
  -- (as accepting an invitation does: Bob is the one acting)
  perform set_config('request.jwt.claims', json_build_object('sub', bob, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', bob::text, true);
  insert into public.memberships (org_id, user_id, role) select org, bob, 'member';
  perform tests.as_super();
  perform tests.ok((select count(*) from public.notifications where user_id = ann and kind = 'people.joined') = 2, 'the owner hears of each person joining');
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Bob Member joined'), 'by name');
  perform tests.ok(not exists (select 1 from public.notifications where user_id in (bob, dee)), 'nobody else by default');
  perform tests.ok(exists (select 1 from public.email_outbox where template = 'notification' and to_user_id = ann
                           and data ->> 'title' = 'Bob Member joined' and category = 'org_activity'), 'and by email');

  -- Their role in an app changes; joining and a role in the same change is one notification.
  perform tests.as_user(ann);
  perform public.set_app_role(org, bob, 'board', 'admin');
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.notifications where user_id = ann and kind = 'people.role_changed'), 'the owner made the change: nothing to tell them');
  perform tests.as_super();
  -- (the test is one transaction; a later change is a new one, so forget that Bob just joined)
  perform set_config('openapphub.joined_' || replace(bob::text, '-', '') || replace(org::text, '-', ''), '', true);
  update public.memberships set role = 'viewer' where org_id = org and user_id = bob;
  perform tests.ok((select count(*) from public.notifications where user_id = ann and kind = 'people.role_changed') = 1, 'a role change is told');
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Bob Member''s role changed'), 'with the name');

  -- A person joining with roles set in the same change: only "joined".
  declare
    cy uuid := tests.create_user('cy@notify.org', '{"full_name":"Cy"}');
  begin
    insert into public.memberships (org_id, user_id, role) values (org, cy, 'member');
    insert into public.app_role_overrides (org_id, user_id, app, role) values (org, cy, 'charter', 'member');
    perform tests.ok((select count(*) from public.notifications where user_id = ann and title like 'Cy%') = 1, 'joining with roles is one notification');
    -- A later change to an app role (an update of that row) is told; the same role again isn't.
    perform set_config('openapphub.joined_' || replace(cy::text, '-', '') || replace(org::text, '-', ''), '', true);
    update public.app_role_overrides set role = 'admin' where org_id = org and user_id = cy and app = 'charter';
    perform tests.ok((select count(*) from public.notifications where user_id = ann and title = 'Cy''s role changed') = 1, 'an app role changed is told');
    update public.app_role_overrides set set_at = now() where org_id = org and user_id = cy and app = 'charter';
    perform tests.ok((select count(*) from public.notifications where user_id = ann and title = 'Cy''s role changed') = 1, 'nothing when the role stays the same');
    -- Leaving takes their app roles with them: only "left".
    delete from public.memberships where org_id = org and user_id = cy;
  end;
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and kind = 'people.left' and title = 'Cy left'), 'leaving is told');
  perform tests.ok((select count(*) from public.notifications where user_id = ann and title like 'Cy%') = 3, 'and nothing about the roles that went with them');

  -- Settings: the owner turns email off for people joining; an admin opts in to them.
  perform tests.as_user(ann);
  perform public.set_notification_preference('people.joined', true, false);
  perform tests.ok((select not email and in_app and customized from public.notification_settings() where kind = 'people.joined'), 'the choice is kept');
  perform tests.as_user(dee);
  perform tests.ok((select may_turn_on and not by_default and not in_app from public.notification_settings() where kind = 'people.joined'), 'an admin may turn it on; it''s off until then');
  perform public.set_notification_preference('people.joined', true, true);
  perform tests.as_user(bob);
  perform tests.ok(not exists (select 1 from public.notification_settings() where kind = 'people.joined'), 'a member doesn''t see it');
  perform tests.ok((select in_app and email and by_default from public.notification_settings() where kind = 'tasks.assigned'), 'but sees their tasks, on by default');
  perform tests.throws($q$select public.set_notification_preference('people.joined', true, true)$q$, 'and may not turn it on', 'available');
  perform tests.throws($q$select public.set_notification_preference('nope.kind', true, true)$q$, 'unknown kinds are refused', 'Unknown');
  perform tests.as_super();
  delete from public.email_outbox where template = 'notification';
  declare
    ed uuid := tests.create_user('ed@notify.org', '{"full_name":"Ed"}');
  begin
    insert into public.memberships (org_id, user_id, role) values (org, ed, 'member');
  end;
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Ed joined'), 'the owner still sees it in the list');
  perform tests.ok(not exists (select 1 from public.email_outbox where template = 'notification' and to_user_id = ann), 'but gets no email');
  perform tests.ok(exists (select 1 from public.notifications where user_id = dee and title = 'Ed joined'), 'the admin who opted in gets it');
  perform tests.ok(exists (select 1 from public.email_outbox where template = 'notification' and to_user_id = dee), 'by email too');
  perform tests.ok(not exists (select 1 from public.notifications where user_id = bob and title = 'Ed joined'), 'a member who isn''t allowed doesn''t');
  perform tests.as_user(ann);
  perform public.reset_notification_preference('people.joined');
  perform tests.ok((select email and not customized from public.notification_settings() where kind = 'people.joined'), 'back to the defaults');

  -- The list: own rows only; read and unread.
  perform tests.as_user(ann);
  n := public.unread_notification_count();
  perform tests.ok(n >= 4, 'unread are counted');
  perform tests.ok((select count(*) from public.my_notifications(2)) = 2, 'the list is limited');
  perform tests.ok((select org_name from public.my_notifications(1)) = 'Notify Org', 'with the organization');
  perform tests.ok(public.mark_notifications_read(array[(select id from public.my_notifications(1))]) = 1, 'one marked read');
  perform tests.ok(public.unread_notification_count() = n - 1, 'one fewer unread');
  perform tests.ok(public.mark_notifications_read() = n - 1, 'all marked read');
  perform tests.as_user(bob);
  perform tests.ok(tests.count('select * from public.notifications where user_id <> auth.uid()') = 0, 'nobody sees anyone else''s');
  perform tests.ok(public.mark_notifications_read() = 0, 'and can''t mark them');
  perform tests.throws(format('select public.notify(%L, %L, %L, %L, null, null, array[%L]::uuid[])', org, 'people.joined', 'x', '', bob),
    'people can''t raise notifications themselves', 'permission denied');

  -- Tasks a workflow gives someone go to that person.
  perform tests.as_super();
  insert into public.automation_tasks (org_id, assignee_id, title, note) values (org, bob, 'Call the new members', 'Before Friday');
  perform tests.ok(exists (select 1 from public.notifications where user_id = bob and kind = 'tasks.assigned' and title = 'A task is waiting for you: Call the new members'), 'a task is told to its person, saying what it is');
  perform tests.ok(exists (select 1 from public.email_outbox where template = 'notification' and to_user_id = bob
                           and data ->> 'title' = 'A task is waiting for you: Call the new members' and data -> 'actions' = '[]'::jsonb),
    'by email too, without links until the organization allows them (C-08)');

  -- A workflow that couldn't finish: the owner hears once.
  insert into public.automation_workflows (org_id, name, enabled, definition)
  values (org, 'Thank payers', false, '{"version":2,"trigger":{"type":"test.none","params":{}},"steps":[]}') returning id into wf;
  insert into public.automation_runs (workflow_id, org_id, dedupe_key, trigger_type, status) values (wf, org, 'k1', 'test.none', 'done') returning id into run;
  update public.automation_runs set status = 'failed', error = 'No email address' where id = run;
  update public.automation_runs set error = 'Still no email address' where id = run;
  perform tests.ok((select count(*) from public.notifications where user_id = ann and kind = 'workflows.failed') = 1, 'a failed run is told once');
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = '"Thank payers" couldn''t finish' and body = 'No email address'), 'with what went wrong');

  -- H-02 billing: payment failed, plan changes, trials ending. Owner, and the billing contact by email.
  insert into hub.org_settings (org_id, billing_email) values (org, 'treasurer@notify.org')
  on conflict (org_id) do update set billing_email = excluded.billing_email;
  delete from public.email_outbox where template = 'notification';
  update billing.subscriptions set status = 'past_due', plan_id = 'suite', current_period_end = now() + interval '20 days' where org_id = org;
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and kind = 'billing.payment_failed'), 'payment failed: the owner');
  perform tests.ok(exists (select 1 from public.email_outbox where template = 'notification' and to_email = 'treasurer@notify.org'
                           and category = 'billing' and data ->> 'title' = 'A payment didn''t go through'), 'and the billing contact, by email');
  perform tests.ok(not exists (select 1 from public.notifications where user_id = dee and kind like 'billing.%'), 'not an admin who didn''t ask');
  update billing.subscriptions set updated_at = now() where org_id = org;
  perform tests.ok((select count(*) from public.notifications where user_id = ann and kind = 'billing.payment_failed') = 1, 'told once');
  update billing.subscriptions set status = 'active', plan_id = 'plus' where org_id = org;
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Your plan is now Plus' and body = 'It was Suite.'), 'plan changed');
  update billing.subscriptions set cancel_at_period_end = true where org_id = org;
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Your plan is set to end'), 'set to end');
  update billing.subscriptions set status = 'canceled' where org_id = org;
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Your plan ended'), 'ended');

  update billing.subscriptions set status = 'trialing', trial_ends_at = now() + interval '2 days 12 hours' where org_id = org;
  perform tests.ok(billing.notify_trials_ending() >= 2, 'trial ending: owner and billing contact');
  perform billing.notify_trials_ending();
  perform tests.ok((select count(*) from public.notifications where user_id = ann and kind = 'billing.trial_ending') = 1, 'once for the three-day notice');
  update billing.subscriptions set trial_ends_at = now() + interval '20 hours' where org_id = org;
  perform billing.notify_trials_ending();
  perform tests.ok(exists (select 1 from public.notifications where user_id = ann and title = 'Your trial ends tomorrow'), 'again the last day');
  perform tests.ok(exists (select 1 from public.email_jobs where name = 'hub.notify_trials_ending'), 'the job is scheduled');

  -- The billing contact who also has an account in the organization isn't emailed twice.
  update hub.org_settings set billing_email = 'ann@notify.org' where org_id = org;
  delete from public.email_outbox where template = 'notification';
  update billing.subscriptions set status = 'unpaid' where org_id = org;
  perform tests.ok((select count(*) from public.email_outbox where template = 'notification' and data ->> 'title' = 'A payment didn''t go through') = 1,
    'the owner who is the billing contact gets one email');

  -- Old notifications are pruned.
  update public.notifications set created_at = now() - interval '13 months' where user_id = bob;
  perform tests.ok(public.prune_notifications() >= 1, 'a year is kept');
end $$;
rollback;
