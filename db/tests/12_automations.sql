-- The automation engine (core 0008): catalog, per-organization settings, validation, history.
begin;
do $$
declare
  ann uuid := tests.create_user('ann@auto.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@auto.org', '{"full_name":"Bob Member"}');
  out uuid := tests.create_user('out@auto.org', '{"full_name":"Olga Outside"}');
  org uuid; r record;
begin
  perform tests.as_service();
  perform public.register_automation_kind('test.reminders', 'board', 'Meeting reminders', 'Emails before meetings.',
    'reminders', true, '{"days_before":[7,1],"overdue":true}',
    '{"days_before":{"type":"int_list","label":"Days before","min":0,"max":60,"max_items":3},
      "overdue":{"type":"bool","label":"When overdue"},
      "hours":{"type":"int","label":"Hours","min":1,"max":24}}');
  -- Registering again updates it.
  perform public.register_automation_kind('test.reminders', 'board', 'Meeting reminders', 'Emails before each meeting.',
    'reminders', true, '{"days_before":[7,1],"overdue":true}',
    '{"days_before":{"type":"int_list","label":"Days before","min":0,"max":60,"max_items":3},
      "overdue":{"type":"bool","label":"When overdue"},
      "hours":{"type":"int","label":"Hours","min":1,"max":24}}');
  perform tests.ok((select description = 'Emails before each meeting.' from public.automation_kinds where key = 'test.reminders'),
    'registering again updates the kind');

  perform tests.as_user(ann);
  org := public.create_organization('Auto Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member');

  -- Defaults until someone changes them.
  perform tests.as_user(bob);
  select * into r from public.list_automations(org) where kind = 'test.reminders';
  perform tests.ok(r.enabled and r.is_default and r.params = '{"days_before":[7,1],"overdue":true}', 'members see the defaults');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', false, '{}')$q$, org),
    'members cannot change automations', 'only owners and admins');
  perform tests.as_user(out);
  perform tests.throws(format('select * from public.list_automations(%L)', org), 'outsiders cannot list them', 'not a member');
  perform tests.ok(tests.count('select * from public.automations') = 0, 'outsiders read no choices');

  -- Owners change them; the choices are checked and cleaned.
  perform tests.as_user(ann);
  perform public.set_automation(org, 'test.reminders', true, '{"days_before":[3,14,3]}');
  select * into r from public.list_automations(org) where kind = 'test.reminders';
  perform tests.ok(not r.is_default and r.params = '{"days_before":[14,3],"overdue":true}',
    format('choices over the defaults, sorted without repeats (got %s)', r.params));
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"days_before":[61]}')$q$, org),
    'out of range refused', 'from 0 to 60');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"days_before":[1,2,3,4]}')$q$, org),
    'too many refused', '1 to 3 whole numbers');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"days_before":[]}')$q$, org),
    'empty list refused', '1 to 3');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"days_before":[1.5]}')$q$, org),
    'fractions refused', 'whole numbers');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"overdue":"yes"}')$q$, org),
    'bool checked', 'on or off');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"hours":0}')$q$, org),
    'int range checked', 'from 1 to 24');
  perform tests.throws(format($q$select public.set_automation(%L, 'test.reminders', true, '{"sneaky":1}')$q$, org),
    'unknown settings refused', 'unknown setting');
  perform tests.throws(format($q$select public.set_automation(%L, 'nope.nothing', true, '{}')$q$, org),
    'unknown kinds refused', 'unknown automation');
  perform public.set_automation(org, 'test.reminders', false, '{}');

  -- What a job sees.
  perform tests.as_service();
  select * into r from public.automation_settings(org, 'test.reminders');
  perform tests.ok(not r.enabled and r.params = '{"days_before":[7,1],"overdue":true}', 'jobs see the settings in force');
  perform public.log_automation(org, 'test.reminders', 0, 'nothing');
  perform public.log_automation(org, 'test.reminders', 3, '3 reminders emailed');
  perform tests.as_user(bob);
  select * into r from public.list_automations(org) where kind = 'test.reminders';
  perform tests.ok(r.last_summary = '3 reminders emailed' and r.last_run_at is not null, 'the latest run shows; empty runs aren''t logged');
  perform tests.ok(tests.count(format('select * from public.automation_log where org_id = %L', org)) = 1, 'members read the history');
  perform tests.throws(format($q$select public.log_automation(%L, 'test.reminders', 1, 'fake')$q$, org),
    'browsers cannot write history', 'permission denied');
  perform tests.throws($q$select public.register_automation_kind('test.x', 'board', 'X', 'X', 'reminders', true, '{}', '{}')$q$,
    'browsers cannot register kinds', 'permission denied');

  -- Reset.
  perform tests.as_user(ann);
  perform public.reset_automation(org, 'test.reminders');
  perform tests.ok((select is_default and enabled from public.list_automations(org) where kind = 'test.reminders'), 'back to the defaults');
  perform tests.as_super();
  perform tests.ok(exists (select 1 from public.email_jobs where name = 'core.automation_log_prune'), 'history is pruned daily');
end $$;
rollback;
\echo ok
