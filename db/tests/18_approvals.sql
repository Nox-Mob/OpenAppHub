-- Approvals and actions from email (core 0014, C-08).
begin;
select public.register_automation_trigger('apz.started', 'charter', 'Something started', '', 'event', null,
  '{}', '[{"key": "who", "label": "Who", "type": "text"}]', null, '{}', 10);

do $$
declare
  ann uuid := tests.create_user('ann@apz.org', '{"full_name":"Ann Owner"}');
  bob uuid := tests.create_user('bob@apz.org', '{"full_name":"Bob Member"}');
  cy uuid := tests.create_user('cy@apz.org', '{"full_name":"Cy Admin"}');
  org uuid; wf uuid; run public.automation_runs; req uuid; v jsonb; tok text; tok2 text; task uuid;
  def jsonb;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Approvals Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (org, bob, 'member'), (org, cy, 'admin');

  -- Actions from email: every kind off until an owner or admin allows it.
  perform tests.as_user(bob);
  perform tests.ok((select bool_and(not allowed) from public.email_action_settings(org)), 'everything starts off');
  perform tests.ok(not (select bool_or(can_change) from public.email_action_settings(org)), 'a member can''t change it');
  perform tests.throws(format('select public.set_email_action_allowed(%L, %L, true)', org, 'workflow_tasks'), 'members may not allow it', 'owners and admins');

  -- A task while it's off: the email says what's waiting, with no links.
  perform tests.as_super();
  insert into public.automation_tasks (org_id, assignee_id, title) values (org, bob, 'Call Pat') returning id into task;
  perform tests.ok((select data -> 'actions' from public.email_outbox where to_user_id = bob and data ->> 'title' = 'A task is waiting for you: Call Pat') = '[]',
    'no links while not allowed');

  -- Allowed: the email has a "Mark it done" link, for Bob only.
  perform tests.as_user(cy);
  perform public.set_email_action_allowed(org, 'workflow_tasks', true);
  perform tests.as_super();
  insert into public.automation_tasks (org_id, assignee_id, title) values (org, bob, 'Call Lee') returning id into task;
  select data #>> '{actions,0,token}' into tok from public.email_outbox where to_user_id = bob and data ->> 'title' = 'A task is waiting for you: Call Lee';
  perform tests.ok(tok is not null and length(tok) = 64, 'a link in the email');
  perform tests.ok((select data #>> '{actions,0,label}' from public.email_outbox where to_user_id = bob and data ->> 'title' = 'A task is waiting for you: Call Lee') = 'Mark it done', 'labelled');
  perform tests.ok(not exists (select 1 from public.action_links where token_hash = tok), 'only its hash is kept');

  perform tests.as_user(ann);
  perform tests.ok((public.action_link(tok)) ->> 'state' = 'other_person', 'someone else signed in can''t use it, or see what it''s for');
  perform tests.ok(((public.action_link(tok)) ->> 'label') is null, 'and learns nothing');
  perform tests.as_user(bob);
  v := public.action_link(tok);
  perform tests.ok(v ->> 'state' = 'ready' and v ->> 'label' = 'Mark it done' and v ->> 'org_name' = 'Approvals Org', 'the confirm page knows what it does');
  perform tests.ok(v #>> '{rpc,fn}' = 'complete_automation_task' and v #>> '{rpc,args,p_id}' = task::text, 'by the app''s own function');
  perform tests.ok((public.action_link('nope')) ->> 'state' = 'unknown', 'a wrong link');
  -- The page calls the function as Bob, then uses the link up.
  perform public.complete_automation_task(task);
  perform tests.ok(public.consume_action_link(tok), 'used up');
  perform tests.ok((public.action_link(tok)) ->> 'state' = 'used', 'once only');
  -- Switched off again: links already sent stop working.
  perform tests.as_super();
  insert into public.automation_tasks (org_id, assignee_id, title) values (org, bob, 'Call Max');
  select data #>> '{actions,0,token}' into tok2 from public.email_outbox where to_user_id = bob and data ->> 'title' = 'A task is waiting for you: Call Max';
  perform tests.as_user(ann);
  perform public.set_email_action_allowed(org, 'workflow_tasks', false);
  perform tests.as_user(bob);
  perform tests.ok((public.action_link(tok2)) ->> 'state' = 'not_allowed', 'not after it''s switched off');
  perform tests.as_super();
  update public.action_links set expires_at = now() - interval '1 minute' where user_id = bob;
  perform tests.as_user(ann);
  perform public.set_email_action_allowed(org, 'workflow_tasks', true);
  perform tests.as_user(bob);
  perform tests.ok((public.action_link(tok2)) ->> 'state' = 'expired', 'nor after 7 days');
  perform tests.as_anon();
  perform tests.throws(format('select public.action_link(%L)', tok2), 'signed in only');

  -- Checking an approval step before saving.
  perform tests.as_user(ann);
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "apz.started"}, "steps": [{"id": "a", "type": "approval", "params": {"to": {"type": "role", "roles": ["owner"]}}}]}'),
    'it says what''s to be approved', 'what is to be approved');
  perform tests.throws(format($q$select public.save_workflow(%L, null, 'X', '', true, %L)$q$, org,
    '{"version": 2, "trigger": {"type": "apz.started"}, "steps": [{"id": "a", "type": "approval", "params": {"what": "X", "to": {"type": "role", "roles": ["owner"]}, "mode": "most"}}]}'),
    'first or all', 'first answer decides');

  -- Everyone must approve: Ann and Cy; then a step uses the outcome.
  perform public.set_email_action_allowed(org, 'workflow_approvals', true);
  def := '{"version": 2, "trigger": {"type": "apz.started", "params": {}}, "steps": [
     {"id": "ok", "type": "approval", "params": {"to": {"type": "role", "roles": ["owner", "admin"]},
        "what": "An award submission from {{trigger.who}}", "details": "Rank PFC", "mode": "all", "timeout_days": 3}},
     {"id": "say", "type": "compose", "params": {"value": "{{steps.ok.outcome}} by {{steps.ok.decided_by}}: {{steps.ok.comment}}"}}]}';
  wf := public.save_workflow(org, null, 'Award approval', '', true, def);
  perform tests.as_super();
  perform public.emit_automation_event(org, 'apz.started', '{"who": "Pat"}');
  perform public.run_workflows();
  select * into run from public.automation_runs where workflow_id = wf;
  perform tests.ok(run.status = 'waiting', 'the run waits for the answers');
  select id into req from public.approval_requests where run_id = run.id;
  perform tests.ok((select what from public.approval_requests where id = req) = 'An award submission from Pat', 'what is to be approved');
  perform tests.ok((select count(*) from public.approval_approvers where request_id = req) = 2, 'asked the owner and the admin');
  perform tests.ok(exists (select 1 from public.notifications where user_id = cy and title = 'An award submission from Pat is pending your approval'),
    'they''re told what is pending');
  perform tests.ok((select jsonb_array_length(data -> 'actions') from public.email_outbox where to_user_id = cy
                    and data ->> 'title' = 'An award submission from Pat is pending your approval') = 2, 'with Approve and Decline');
  perform tests.ok((select data ->> 'body' from public.email_outbox where to_user_id = cy
                    and data ->> 'title' = 'An award submission from Pat is pending your approval') like '%Everyone asked must approve it.%', 'and how it''s decided');

  perform tests.as_user(bob);
  perform tests.throws(format('select public.decide_approval(%L, %L)', req, 'approved'), 'only those asked', 'isn''t yours');
  perform tests.ok(not exists (select 1 from public.my_approvals()), 'nothing waiting for Bob');
  perform tests.as_user(ann);
  perform tests.ok((select what from public.my_approvals(org)) = 'An award submission from Pat', 'waiting for Ann');
  perform tests.ok(public.decide_approval(req, 'approved', 'Looks right') = 'pending', 'one of two approved: still waiting');
  perform tests.throws(format('select public.decide_approval(%L, %L)', req, 'declined'), 'one answer each', 'already answered');
  perform tests.ok((public.approval(req)) ->> 'can_answer' = 'false', 'Ann can''t answer again');
  -- Cy approves through the email's link: the confirm page calls decide_approval as Cy.
  perform tests.as_super();
  select data #>> '{actions,0,token}' into tok from public.email_outbox where to_user_id = cy
    and data ->> 'title' = 'An award submission from Pat is pending your approval';
  perform tests.as_user(cy);
  v := public.action_link(tok);
  perform tests.ok(v ->> 'label' = 'Approve' and v ->> 'comment_arg' = 'p_comment' and v ->> 'what' like 'An award submission%', 'the Approve link');
  perform tests.ok(public.decide_approval((v #>> '{rpc,args,p_id}')::uuid, v #>> '{rpc,args,p_decision}', 'Approved') = 'approved', 'everyone approved');
  perform public.consume_action_link(tok);
  perform tests.as_super();
  select * into run from public.automation_runs where id = run.id;
  perform tests.ok(run.status = 'done', 'the run carried on by itself');
  perform tests.ok(run.state #>> '{outputs,say,value}' = 'approved by Ann Owner, Cy Admin: Looks right / Approved', 'later steps use the outcome, who and their comments');
  perform tests.ok((select count(*) from public.action_links where kind = 'workflow_approvals' and used_at is null) = 0, 'every remaining link is used up');

  -- The first answer decides; a decline.
  perform tests.as_user(ann);
  def := jsonb_set(def, '{steps,0,params,mode}', '"first"');
  perform public.save_workflow(org, wf, 'Award approval', '', true, def);
  perform tests.as_super();
  perform public.emit_automation_event(org, 'apz.started', '{"who": "Lee"}');
  perform public.run_workflows();
  select r.id into req from public.approval_requests r where r.what = 'An award submission from Lee';
  perform tests.as_user(cy);
  perform tests.ok(public.decide_approval(req, 'declined', 'Not eligible') = 'declined', 'one decline decides');
  perform tests.as_super();
  perform tests.ok((select state #>> '{outputs,say,value}' from public.automation_runs where id = (select run_id from public.approval_requests where id = req))
    = 'declined by Cy Admin: Not eligible', 'declined, by whom');

  -- Nobody answers in time.
  perform public.emit_automation_event(org, 'apz.started', '{"who": "Max"}');
  perform public.run_workflows();
  select r.id into req from public.approval_requests r where r.what = 'An award submission from Max';
  perform tests.ok((select due_at from public.approval_requests where id = req) between now() + interval '71 hours' and now() + interval '73 hours', 'three days to answer');
  update public.approval_requests set due_at = now() - interval '1 minute' where id = req;
  update public.automation_runs set resume_at = now() - interval '1 minute' where id = (select run_id from public.approval_requests where id = req);
  perform public.run_workflows();
  perform tests.ok((select status from public.approval_requests where id = req) = 'timed_out', 'timed out');
  perform tests.ok((select state #>> '{outputs,say,value}' from public.automation_runs where id = (select run_id from public.approval_requests where id = req))
    like 'timed_out by%', 'and the workflow carries on with that');
  perform tests.as_user(ann);
  perform tests.throws(format('select public.decide_approval(%L, %L)', req, 'approved'), 'too late to answer', 'already decided');

  -- A test run asks nobody and carries on as if approved.
  v := public.test_workflow(org, def, '{"who": "Test"}');
  perform tests.ok(v ->> 'status' = 'succeeded' and v::text like '%Would ask 2 people to approve%', 'a test run only describes it');
  perform tests.as_super();
  perform tests.ok(not exists (select 1 from public.approval_requests where what = 'An award submission from Test'), 'and asks nobody');
end $$;
rollback;
