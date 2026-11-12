-- Workflows each organization builds (core 0009): validation, who may edit, running, sharing.
begin;
-- A stand-in app: an event with an ordered "rank" field, a date scan, and an action it carries out.
create schema if not exists testapp;
create table testapp.things (org_id uuid, title text, due date);
create or replace function testapp.scan_due(p_org uuid, p_params jsonb)
returns table (dedupe text, ctx jsonb) language sql stable as $$
  select 'thing:' || t.title, jsonb_build_object('thing', jsonb_build_object('title', t.title), 'summary', t.title)
  from testapp.things t
  where t.org_id = p_org and t.due - current_date between 0 and coalesce((p_params->>'days')::int, 0);
$$;
create or replace function testapp.fields(p_org uuid) returns jsonb language sql stable as $$
  select '[{"key": "member.fields.rank", "label": "Rank", "type": "ordered", "options": ["PVT","PFC","SPC","SGT","SFC","MSG"]}]'::jsonb;
$$;
select public.register_automation_trigger('testapp.form_received', 'charter', 'Form received', 'A form arrives.', 'event', null,
  '{}', '[{"key": "member.name", "label": "Name", "type": "text"}, {"key": "amount", "label": "Amount", "type": "number"}]',
  'testapp.fields', '{}', 10);
select public.register_automation_trigger('testapp.thing_due', 'board', 'Thing due', 'N days before.', 'scan', 'testapp.scan_due',
  '{"days": {"type": "int", "label": "Days", "min": 0, "max": 60}}', '[{"key": "thing.title", "label": "Title", "type": "text"}]',
  null, '{meeting}', 20);
select public.register_automation_action('testapp.make_docs', 'ledger', 'Make documents', 'Reports into the meeting.',
  '{"as_of": {"type": "choice", "label": "As of", "options": ["last_closed_month", "today", "date"]},
    "date": {"type": "date", "label": "Date", "optional": true}}', '{meeting}', 10);

do $$
declare
  ann uuid := tests.create_user('ann@wf.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@wf.org', '{"full_name":"Bob Member"}');
  cy uuid := tests.create_user('cy@wf.org', '{"full_name":"Cy Chapter"}');
  natl uuid; chap uuid; wf uuid; shared_wf uuid; adopted uuid; n int; r record; v jsonb;
  route jsonb := '{
    "trigger": {"type": "testapp.form_received", "params": {}},
    "branches": [
      {"match": "all", "conditions": [{"field": "member.fields.rank", "op": "lte", "value": "PFC", "order": 1}],
       "actions": [{"type": "email", "to": {"type": "role", "roles": ["owner"]}, "subject": "Award for {{member.name}}", "message": "Rank {{member.fields.rank}}: please review."}]},
      {"match": "all", "conditions": [{"field": "member.fields.rank", "op": "between", "value": "SPC", "order": 2, "value2": "SFC", "order2": 4}],
       "actions": [{"type": "task", "to": {"type": "role", "roles": ["member"]}, "title": "Review award for {{member.name}}", "due_in_days": 7}]}
    ],
    "otherwise": [{"type": "task", "to": {"type": "role", "roles": ["owner"]}, "title": "Senior award: {{member.name}}"}]
  }';
begin
  perform tests.as_user(ann);
  natl := public.create_organization('WF National');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (natl, bob, 'member');

  -- Validation, in plain words.
  perform tests.as_user(ann);
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, '{}')$q$, natl), 'needs a trigger', 'what starts');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true,
    '{"trigger": {"type": "testapp.form_received"}, "branches": [], "otherwise": []}')$q$, natl), 'needs an action', 'at least one thing');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true,
    '{"trigger": {"type": "testapp.form_received"}, "branches": [{"conditions": [{"field": "nope", "op": "eq", "value": 1}], "actions": []}]}')$q$, natl),
    'unknown field', 'knows');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true,
    '{"trigger": {"type": "testapp.form_received"}, "otherwise": [{"type": "email", "to": {"type": "nobody"}, "subject": "s", "message": "m"}]}')$q$, natl),
    'bad recipient', 'choose who');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true,
    '{"trigger": {"type": "testapp.form_received"}, "otherwise": [{"type": "testapp.make_docs", "as_of": "today"}]}')$q$, natl),
    'app action needs its context', 'works only with');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true,
    '{"trigger": {"type": "testapp.thing_due", "params": {"days": 5}}, "otherwise": [{"type": "testapp.make_docs", "as_of": "someday"}]}')$q$, natl),
    'bad choice', 'must be one of');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true,
    '{"trigger": {"type": "testapp.thing_due", "params": {}}, "otherwise": [{"type": "testapp.make_docs", "as_of": "today"}]}')$q$, natl),
    'trigger settings required', 'fill in every setting');

  -- Who may edit.
  perform tests.as_user(bob);
  perform tests.throws(format('select public.save_workflow(%L, null, %L, %L, true, %L)', natl, 'Route', '', route), 'members cannot edit', 'only owners, admins');
  perform tests.throws(format('select public.grant_automation_editor(%L, %L, true)', natl, bob), 'members cannot grant', 'only owners and admins');
  perform tests.as_user(ann);
  perform public.grant_automation_editor(natl, bob, true);
  perform tests.as_user(bob);
  wf := public.save_workflow(natl, null, 'Award routing', 'By rank', true, route);
  perform tests.ok((public.workflow_overview(natl)->>'can_edit')::boolean, 'an editor can edit');
  perform tests.ok(jsonb_array_length(public.workflow_overview(natl)->'workflows') = 1, 'the workflow is listed');
  perform tests.ok(public.workflow_overview(natl)->'triggers' @> '[{"type": "testapp.form_received", "extra_fields": [{"key": "member.fields.rank"}]}]',
    'triggers list their fields, including the organization''s own');

  -- Events: only stored when a workflow could use them; routed by rank.
  perform tests.as_service();
  perform public.emit_automation_event(natl, 'testapp.unused', '{}');
  perform tests.ok(not exists (select 1 from public.automation_events where type = 'testapp.unused'), 'events nobody listens to are dropped');
  perform public.emit_automation_event(natl, 'testapp.form_received',
    '{"member": {"name": "Pat", "fields": {"rank": {"value": "PFC", "order": 1}}}, "subject_user_id": null}');
  perform public.emit_automation_event(natl, 'testapp.form_received',
    '{"member": {"name": "Sam", "fields": {"rank": {"value": "SGT", "order": 3}}}}');
  perform public.emit_automation_event(natl, 'testapp.form_received',
    '{"member": {"name": "Max", "fields": {"rank": {"value": "MSG", "order": 5}}}}');
  n := public.run_workflows();
  perform tests.ok(n = 3, format('three runs (got %s)', n));
  perform tests.ok(public.run_workflows() = 0, 'nothing runs twice');
  perform tests.as_super();
  perform tests.ok((select data->>'subject' from public.email_outbox where template = 'automation.message' and to_user_id = ann) = 'Award for Pat',
    'PFC goes to the first branch, with placeholders filled');
  perform tests.ok((select data->>'message' from public.email_outbox where template = 'automation.message' and to_user_id = ann) = 'Rank PFC: please review.',
    'ordered values print as their value');
  perform tests.ok(exists (select 1 from public.automation_tasks where assignee_id = bob and title = 'Review award for Sam' and due_on = current_date + 7),
    'SGT (between SPC and SFC) goes to the second branch');
  perform tests.ok(exists (select 1 from public.automation_tasks where assignee_id = ann and title = 'Senior award: Max'),
    'MSG goes to otherwise');
  perform tests.ok((select count(*) from public.automation_runs where workflow_id = wf and status = 'done') = 3, 'runs recorded as done');
  perform tests.ok((select branch from public.automation_runs where workflow_id = wf and ctx #>> '{member,name}' = 'Max') = 'Otherwise', 'the branch is recorded');

  -- Tasks: on the task summary, and finished by their assignee.
  perform tests.as_service();
  v := public.digest_for(bob, 'weekly');
  perform tests.ok(v->'orgs'->0->'tasks' @> '[{"app": "hub", "title": "Review award for Sam"}]', 'workflow tasks are in the task summary');
  perform tests.as_user(bob);
  perform public.complete_automation_task((select id from public.automation_tasks where assignee_id = bob));
  perform tests.ok(not exists (select 1 from public.automation_tasks where assignee_id = bob and status = 'open'), 'finished');
  perform tests.throws(format('select public.complete_automation_task(%L)', (select id from public.automation_tasks where assignee_id = ann limit 1)),
    'not someone else''s', 'not yours');

  -- A date-based trigger with an app action: queued for the app, then finished.
  perform tests.as_user(ann);
  perform public.save_workflow(natl, null, 'Docs before meetings', '', true,
    '{"trigger": {"type": "testapp.thing_due", "params": {"days": 5}},
      "always": [{"type": "testapp.make_docs", "as_of": "last_closed_month"}]}');
  perform tests.as_super();
  insert into testapp.things values (natl, 'Soon', current_date + 3), (natl, 'Later', current_date + 20);
  perform tests.as_service();
  perform public.run_workflows();
  perform tests.ok((select count(*) from public.automation_jobs where kind = 'testapp.make_docs') = 1, 'one job, for the thing within 5 days');
  perform tests.ok((select payload->>'as_of' = 'last_closed_month' and payload #>> '{ctx,thing,title}' = 'Soon'
                    from public.automation_jobs where kind = 'testapp.make_docs'), 'the job carries its settings and the trigger''s data');
  select * into r from public.claim_automation_jobs('ledger', 5);
  perform tests.ok(r.status = 'running', 'the app claims it');
  perform public.finish_automation_job(r.id, true, '{"summary": "3 reports added"}', null);
  perform tests.ok((select log @> '[{"action": "testapp.make_docs", "ok": true, "detail": "3 reports added"}]' from public.automation_runs where id = r.run_id),
    'the run''s log says what the app did');

  -- Schedules: once a day once the hour has come.
  perform tests.as_user(ann);
  perform public.save_workflow(natl, null, 'Daily note', '', true,
    '{"trigger": {"type": "core.schedule", "params": {"frequency": "daily", "hour": 0}},
      "always": [{"type": "task", "to": {"type": "role", "roles": ["owner"]}, "title": "Check the inbox on {{today}}"}]}');
  perform tests.as_service();
  perform public.run_workflows();
  perform public.run_workflows();
  perform tests.as_super();
  perform tests.ok((select count(*) from public.automation_tasks where title like 'Check the inbox on %') = 1, 'a daily schedule runs once a day');

  -- Chapters: organizations don't touch; a chapter uses what its national shares.
  perform tests.as_service();
  chap := public._create_child_organization(natl, 'WF Chapter 1', cy, 'charter', gen_random_uuid(), array[ann]);
  perform tests.as_user(ann);
  shared_wf := public.save_workflow(natl, null, 'Shared routing', '', true, route, true);
  perform tests.as_user(cy);
  perform tests.ok(jsonb_array_length(public.workflow_overview(chap)->'shared_by_parent') = 1, 'the chapter sees what its national shares');
  perform tests.throws(format('select public.save_workflow(%L, null, %L, %L, true, %L, true)', chap, 'X', '', route),
    'a chapter cannot share onward', 'only a national');
  adopted := public.adopt_workflow(chap, shared_wf);
  perform tests.throws(format('select public.adopt_workflow(%L, %L)', chap, wf), 'only shared ones', 'isn''t shared');
  perform tests.as_service();
  perform public.emit_automation_event(chap, 'testapp.form_received', '{"member": {"name": "Chapter Pat", "fields": {"rank": {"value": "PVT", "order": 0}}}}');
  perform public.run_workflows();
  perform tests.as_super();
  perform tests.ok(exists (select 1 from public.automation_runs where workflow_id = adopted and org_id = chap), 'the chapter''s event runs the shared workflow, as the chapter');
  perform tests.ok(not exists (select 1 from public.automation_runs where workflow_id in (wf, shared_wf) and ctx #>> '{member,name}' = 'Chapter Pat'),
    'the national''s own workflows never see the chapter''s data');
  perform tests.ok(exists (select 1 from public.email_outbox where template = 'automation.message' and org_id = chap and to_user_id = cy),
    'the chapter''s owner gets it, not the national''s');
  -- The national says chapters may not build their own.
  perform tests.as_user(ann);
  perform public.set_chapters_may_build(natl, false);
  perform tests.as_user(cy);
  perform tests.throws(format('select public.save_workflow(%L, null, %L, %L, true, %L)', chap, 'Own', '', route), 'chapter blocked', 'doesn''t let chapters');
  perform tests.ok(not (public.workflow_overview(chap)->>'may_build')::boolean, 'the builder knows');
  perform tests.ok(public.adopt_workflow(chap, shared_wf) = adopted, 'shared ones can still be used');

  -- Outsiders see nothing; deleting removes runs.
  perform tests.as_user(bob);
  perform tests.throws(format('select public.workflow_overview(%L)', chap), 'outsiders', 'not a member');
  perform tests.as_user(ann);
  perform public.delete_workflow(wf);
  perform tests.ok(not exists (select 1 from public.automation_runs where workflow_id = wf), 'its runs go with it');
end $$;
rollback;
\echo ok
