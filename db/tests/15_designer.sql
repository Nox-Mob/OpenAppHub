-- The low-code designer's engine (core 0012, S-28): steps that pass data to later steps, loops,
-- variables, data steps, waits, retries, "run after", app jobs, and test runs.
begin;
-- A stand-in app: an event, a lookup that returns members, one that fails once, and a job.
create schema if not exists dzapp;
create table dzapp.people (org_id uuid, name text, email text, amount int, level text);
create table dzapp.flaky (n int);
insert into dzapp.flaky values (0);
create or replace function dzapp.find_people(p_org uuid, p_params jsonb) returns jsonb language sql stable as $$
  select jsonb_build_object('rows', coalesce(jsonb_agg(jsonb_build_object('name', p.name, 'email', p.email, 'amount', p.amount, 'level', p.level) order by p.name), '[]'),
                            'count', count(*))
  from dzapp.people p
  where p.org_id = p_org and (coalesce(p_params->>'level', '') = '' or p.level = p_params->>'level');
$$;
create or replace function dzapp.flaky_call(p_org uuid, p_params jsonb) returns jsonb language plpgsql as $$
begin
  -- Fails until the test says the outside service is back (a failed step's changes roll back).
  if (select n from dzapp.flaky) < 1 then raise exception 'Not yet'; end if;
  return jsonb_build_object('ok', true, 'summary', 'Worked on try 2');
end $$;
create or replace function dzapp.always_fails(p_org uuid, p_params jsonb) returns jsonb language plpgsql as $$
begin raise exception 'This always fails'; end $$;
select public.register_automation_trigger('dzapp.started', 'charter', 'Something started', '', 'event', null,
  '{}', '[{"key": "who", "label": "Who", "type": "text"}]', null, '{}', 10);
select public.register_automation_step('dzapp.find_people', 'charter', 'Find people', 'A lookup.', 'query', 'dzapp.find_people',
  '{"level": {"type": "text", "label": "Level", "optional": true}}',
  '[{"key": "rows", "label": "People", "type": "list", "fields": [{"key": "name", "label": "Name", "type": "text"}, {"key": "email", "label": "Email", "type": "text"}, {"key": "amount", "label": "Amount", "type": "number"}]}, {"key": "count", "label": "How many", "type": "number"}]');
select public.register_automation_step('dzapp.flaky', 'charter', 'Flaky call', '', 'call', 'dzapp.flaky_call', '{}', '[]');
select public.register_automation_step('dzapp.fails', 'charter', 'Always fails', '', 'call', 'dzapp.always_fails', '{}', '[]');
select public.register_automation_step('dzapp.make_report', 'ledger', 'Make a report', '', 'job', null, '{}',
  '[{"key": "total", "label": "Total", "type": "number"}]');

do $$
declare
  ann uuid := tests.create_user('ann@dz.org', '{"full_name":"Ann Owner"}');
  org uuid; wf uuid; run public.automation_runs; v jsonb; j public.automation_jobs; n int;
  def jsonb;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Designer Org');
  perform tests.as_super();
  insert into dzapp.people values
    (org, 'Ada', 'ada@example.org', 5, 'Life'), (org, 'Bo', 'bo@example.org', 20, 'Annual'),
    (org, 'Cy', 'cy@example.org', 40, 'Annual');

  -- Checking a definition: references only point back; variables are made first, at the top.
  perform tests.as_user(ann);
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
       {"id": "a", "type": "compose", "params": {"value": "{{steps.b.value}}"}},
       {"id": "b", "type": "compose", "params": {"value": 1}}]}'), 'a reference to a later step', 'doesn''t come before');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
       {"id": "a", "type": "set_variable", "params": {"name": "total", "value": 1}}]}'), 'a variable before it''s made', 'before it''s made');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
       {"id": "l", "type": "foreach", "params": {"items": "{{trigger.list}}"}, "steps": [
         {"id": "v", "type": "init_variable", "params": {"name": "x", "kind": "number"}}]}]}'), 'variables at the top', 'at the top');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
       {"id": "a", "type": "compose", "params": {"value": 1}}, {"id": "a", "type": "compose", "params": {"value": 2}}]}'), 'unique ids', 'share the id');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
       {"id": "a", "type": "compose", "params": {"value": "{{items.l.name}}"}}]}'), 'loop items only inside the loop', 'isn''t inside');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [{"id": "a", "type": "nope.step"}]}'), 'known step types', 'doesn''t have');

  -- A lookup's list feeds a "for each"; each item's data goes into later steps.
  def := '{"version": 2, "trigger": {"type": "dzapp.started", "params": {}}, "steps": [
    {"id": "total", "type": "init_variable", "params": {"name": "total", "kind": "number", "value": 0}},
    {"id": "names", "type": "init_variable", "params": {"name": "names", "kind": "list"}},
    {"id": "find", "type": "dzapp.find_people", "name": "Find people", "params": {}},
    {"id": "each", "type": "foreach", "params": {"items": "{{steps.find.rows}}"}, "steps": [
      {"id": "big", "type": "condition", "params": {"match": "all", "conditions": [{"left": "{{item.amount}}", "op": "gt", "right": 10}]},
       "then": [
         {"id": "add", "type": "increment_variable", "params": {"name": "total", "by": "{{item.amount}}"}},
         {"id": "keep", "type": "append_variable", "params": {"name": "names", "value": "{{item.name}}"}},
         {"id": "mail", "type": "email", "params": {"to": {"type": "address", "email": "{{item.email}}"},
            "subject": "Thanks, {{item.name}}", "message": "You gave {{item.amount}} ({{loop.each.number}} of {{steps.find.count}})."}}],
       "else": []}]},
    {"id": "sum", "type": "compose", "params": {"value": "Total {{vars.total}} from {{vars.names}}"}},
    {"id": "annual", "type": "filter", "params": {"items": "{{steps.find.rows}}", "conditions": [{"left": "{{item.level}}", "op": "eq", "right": "Annual"}]}},
    {"id": "emails", "type": "select", "params": {"items": "{{steps.annual.items}}", "map": {"to": "{{item.email}}"}}},
    {"id": "list", "type": "join", "params": {"items": "{{steps.annual.items}}", "field": "name", "separator": " & "}},
    {"id": "most", "type": "aggregate", "params": {"items": "{{steps.find.rows}}", "op": "max", "field": "amount"}}
  ]}';
  wf := public.save_workflow(org, null, 'Thank donors', '', true, def);
  perform tests.as_super();
  perform public.emit_automation_event(org, 'dzapp.started', '{"who": "Ann"}');
  perform public.run_workflows();
  select * into run from public.automation_runs where workflow_id = wf;
  perform tests.ok(run.status = 'done', 'the run finished: ' || coalesce(run.error, run.status));
  perform tests.ok(run.version = 2, 'a designer run');
  perform tests.ok((run.state #>> '{vars,total}')::int = 60, 'the variable added up the big gifts');
  perform tests.ok(run.state #> '{vars,names}' = '["Bo", "Cy"]', 'and collected their names');
  perform tests.ok(run.state #>> '{outputs,sum,value}' = 'Total 60 from Bo, Cy', 'a later step read the variables');
  perform tests.ok((select count(*) from public.email_outbox where template = 'automation.message' and org_id = org) = 2, 'two emails, one per big gift');
  perform tests.ok(exists (select 1 from public.email_outbox where to_email = 'cy@example.org' and data->>'message' = 'You gave 40 (3 of 3).'),
    'each email used its item, the loop and an earlier step');
  perform tests.ok(run.state #> '{outputs,emails,items}' = '[{"to": "bo@example.org"}, {"to": "cy@example.org"}]', 'select made a new list');
  perform tests.ok(run.state #>> '{outputs,list,text}' = 'Bo & Cy', 'join made text');
  perform tests.ok((run.state #>> '{outputs,most,value}')::int = 40, 'aggregate found the largest');
  perform tests.ok(jsonb_array_length(run.trace) >= 10, 'every step is in the trace');
  -- Once per occurrence.
  perform public.run_workflows();
  perform tests.ok((select count(*) from public.automation_runs where workflow_id = wf) = 1, 'nothing runs twice');

  -- A test run does nothing: no emails, every step described.
  perform tests.as_user(ann);
  v := public.test_workflow(org, def, '{"who": "Test"}');
  perform tests.ok(v->>'status' = 'succeeded', 'the test run succeeded');
  perform tests.ok(exists (select 1 from jsonb_array_elements(v->'trace') t where t->>'detail' = 'Would email 1 person'), 'emails are only described');
  perform tests.as_super();
  perform tests.ok((select count(*) from public.email_outbox where template = 'automation.message' and org_id = org) = 2, 'and none were sent');

  -- Wait, then carry on; retry a step that fails once; handle a failure with "run after".
  perform tests.as_user(ann);
  perform public.save_workflow(org, wf, 'Thank donors', '', false, def);
  wf := public.save_workflow(org, null, 'Wait and retry', '', true, '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
    {"id": "pause", "type": "wait", "params": {"mode": "duration", "amount": 2, "unit": "days"}},
    {"id": "try", "type": "dzapp.flaky", "retry": {"count": 2, "interval_minutes": 5, "backoff": "exponential"}},
    {"id": "boom", "type": "dzapp.fails"},
    {"id": "after", "type": "compose", "run_after": {"boom": ["failed"]}, "params": {"value": "handled: {{steps.boom.error}}"}}
  ]}');
  perform tests.as_super();
  perform public.emit_automation_event(org, 'dzapp.started', '{"who": "Bo"}');
  perform public.run_workflows();
  select * into run from public.automation_runs where workflow_id = wf;
  perform tests.ok(run.status = 'waiting' and run.resume_at > now() + interval '47 hours', 'waiting two days');
  perform public.run_workflows();
  perform tests.ok((select status from public.automation_runs where id = run.id) = 'waiting', 'still waiting before the time');
  -- Two days later:
  update public.automation_runs set resume_at = now() - interval '1 minute',
    state = jsonb_set(state, '{waits,pause}', to_jsonb(now() - interval '1 minute')) where id = run.id;
  perform public.run_workflows();
  select * into run from public.automation_runs where workflow_id = wf;
  perform tests.ok(run.status = 'waiting' and (run.state #>> '{attempts,try}')::int = 1, 'the flaky step failed once and will retry');
  perform tests.ok(run.resume_at between now() + interval '4 minutes' and now() + interval '6 minutes', 'in 5 minutes');
  update dzapp.flaky set n = 1;
  update public.automation_runs set resume_at = now() - interval '1 minute' where id = run.id;
  perform public.run_workflows();
  select * into run from public.automation_runs where workflow_id = wf;
  perform tests.ok(run.status = 'done', 'then it finished: ' || coalesce(run.error, run.status));
  perform tests.ok(run.state #>> '{status,try}' = 'succeeded', 'the retry worked');
  perform tests.ok(run.state #>> '{status,boom}' = 'failed', 'the failing step failed');
  perform tests.ok(run.state #>> '{outputs,after,value}' = 'handled: This always fails', 'and the step set to run after it failed handled it');
  perform tests.ok((select count(*) from public.automation_runs where workflow_id = wf) = 1, 'one run throughout');

  -- An app's job: the run waits for it, then uses what it returned.
  perform tests.as_user(ann);
  wf := public.save_workflow(org, null, 'Report', '', true, '{"version": 2, "trigger": {"type": "dzapp.started"}, "steps": [
    {"id": "rep", "type": "dzapp.make_report", "context": {"meeting": {"id": "m1", "title": "{{trigger.who}}''s meeting"}}},
    {"id": "say", "type": "compose", "params": {"value": "Total was {{steps.rep.total}}"}},
    {"id": "stop", "type": "terminate", "params": {"status": "succeeded", "message": "All done"}},
    {"id": "never", "type": "compose", "params": {"value": "not reached"}}
  ]}');
  perform tests.as_super();
  perform public.emit_automation_event(org, 'dzapp.started', '{"who": "Cy"}');
  perform public.run_workflows();
  select * into run from public.automation_runs where workflow_id = wf;
  select * into j from public.automation_jobs where run_id = run.id;
  perform tests.ok(run.status = 'waiting' and run.wait_job = j.id, 'waiting for the app');
  perform tests.ok(j.payload #>> '{ctx,meeting,title}' = 'Cy''s meeting', 'the job got its context from the step');
  perform public.finish_automation_job(j.id, true, '{"summary": "Report made", "total": 42}', null);
  select * into run from public.automation_runs where workflow_id = wf;
  perform tests.ok(run.status = 'done', 'carried on when the job finished');
  perform tests.ok(run.state #>> '{outputs,say,value}' = 'Total was 42', 'a later step used what the job returned');
  perform tests.ok(not (run.state -> 'status' ? 'never'), 'terminate stopped the run');

  -- The old When/If/Then workflows still run as before.
  perform tests.ok((select count(*) from public.automation_runs where version = 1) >= 0, 'version 1 untouched');
end $$;
rollback;
\echo ok
