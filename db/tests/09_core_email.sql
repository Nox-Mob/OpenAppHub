-- Email outbox, preferences, jobs and the instance owner (S-16).
begin;
do $$
declare
  owner uuid := tests.create_user('owner@example.org', '{"full_name":"Olive Owner"}');
  bob uuid := tests.create_user('bob@example.org', '{"full_name":"Bob Tremblay"}');
  org uuid;
  later_org uuid;
  e1 uuid;
  e2 uuid;
  r record;
begin
  perform tests.as_user(owner);
  org := public.create_organization('Email Org');
  perform tests.as_user(bob);
  later_org := public.create_organization('Later Org');
  perform tests.as_super();
  -- Any organizations from earlier runs come first; make these two the oldest, in order.
  update public.organizations set created_at = '2000-01-01' where id = org;
  update public.organizations set created_at = '2000-01-02' where id = later_org;
  perform tests.as_user(bob);

  -- Browsers can't queue, claim or read the outbox.
  perform tests.throws($q$select public.enqueue_email('board', 'test', null, null, 'x@example.org')$q$,
    'clients cannot queue email', 'permission denied');
  perform tests.throws('select * from public.claim_emails(10)', 'clients cannot claim email', 'permission denied');
  perform tests.throws('select * from public.email_outbox', 'clients cannot read the outbox', 'permission denied');
  perform tests.throws('select * from public.instance_email_settings', 'clients cannot read SMTP settings', 'permission denied');

  -- Instance owner: the owner of the first organization only.
  perform tests.ok(not public.is_instance_owner(), 'owner of a later org is not the instance owner');
  perform tests.as_user(owner);
  perform tests.ok(public.is_instance_owner(), 'owner of the first org is the instance owner');

  -- Preferences: defaults, then your own changes only.
  perform tests.ok((select reminders and digest = 'weekly' from public.get_email_preferences()), 'defaults');
  perform public.set_email_preferences(false, 'daily');
  perform tests.ok((select not reminders and digest = 'daily' from public.get_email_preferences()), 'saved');
  perform tests.throws($q$select public.set_email_preferences(true, 'hourly')$q$, 'bad digest refused', 'daily or weekly');
  perform tests.as_anon();
  perform tests.throws($q$select public.set_email_preferences(true, 'off')$q$, 'anon cannot save preferences');

  -- Queue (as the sender), with de-duplication.
  perform tests.as_service();
  e1 := public.enqueue_email('board', 'board.meeting_reminder', org, bob, null, '{"title":"Budget"}', 'reminders', 'm1:7d');
  perform tests.ok(e1 is not null, 'queued');
  perform tests.ok(public.enqueue_email('board', 'board.meeting_reminder', org, bob, null, '{}', 'reminders', 'm1:7d') is null,
    'the same reminder is queued once');
  e2 := public.enqueue_email('hub', 'test', null, null, '  Someone@Example.org ');
  perform public.enqueue_email('board', 'board.meeting_reminder', org, owner, null, '{}', 'reminders', 'm1:owner');
  perform public.enqueue_email('board', 'later', org, bob, null, '{}', 'essential', null, now() + interval '1 day');

  -- Claim: due rows only; the owner switched reminders off, so theirs is suppressed.
  perform tests.ok(tests.count($q$select * from public.claim_emails(10, array['ledger'])$q$) = 0, 'an app claims only its own email');
  perform tests.ok(tests.count('select * from public.claim_emails(10)') = 2, 'two due emails claimed');
  perform tests.ok((select count(*) from public.email_outbox where status = 'suppressed') = 1, 'opted-out reminder suppressed');
  perform tests.ok((select to_email from public.email_outbox where id = e2) = 'someone@example.org', 'address normalized');
  perform tests.ok(tests.count('select * from public.claim_emails(10)') = 0, 'claimed rows are not claimed twice');

  -- Recipient details come from the account.
  update public.email_outbox set status = 'queued' where id = e1;
  select * into r from public.claim_emails(10);
  perform tests.ok(r.to_email = 'bob@example.org' and r.to_name = 'Bob Tremblay' and r.org_name = 'Email Org', 'recipient and org filled in');

  -- Finish: sent, retry with back-off, failure after 5 tries.
  perform public.finish_email(e1, 'sent', 'msg_1');
  perform tests.ok((select status = 'sent' and provider_id = 'msg_1' and sent_at is not null from public.email_outbox where id = e1), 'sent');
  perform public.finish_email(e2, 'retry', null, 'timeout');
  perform tests.ok((select status = 'queued' and send_after > now() from public.email_outbox where id = e2), 'retry later');
  update public.email_outbox set attempts = 5 where id = e2;
  perform public.finish_email(e2, 'retry', null, 'timeout');
  perform tests.ok((select status from public.email_outbox where id = e2) = 'failed', 'fails after 5 tries');
  perform tests.throws(format('select public.finish_email(%L, %L)', e2, 'maybe'), 'unknown outcome refused', 'Unknown outcome');

  -- Stuck rows are claimed again after 10 minutes.
  update public.email_outbox set status = 'sending', claimed_at = now() - interval '11 minutes' where id = e2;
  perform tests.ok(tests.count('select * from public.claim_emails(10)') = 1, 'stuck email reclaimed');

  -- Unsubscribe.
  perform public.email_unsubscribe(bob, 'digest');
  perform tests.ok((select digest from public.email_preferences where user_id = bob) = 'off', 'unsubscribed from the digest');
  perform tests.throws(format('select public.email_unsubscribe(%L, %L)', bob, 'essential'), 'essential email cannot be switched off', 'can''t be switched off');

  -- Jobs: due ones run; a failing job is recorded and doesn't stop the others.
  perform tests.as_super();
  create function tests.job_ok() returns int language sql as 'select 3';
  create function tests.job_bad() returns int language plpgsql as 'begin raise exception ''boom''; end';
  insert into public.email_jobs (name, fn) values ('a.bad', 'tests.job_bad'), ('b.ok', 'tests.job_ok'), ('c.missing', 'tests.nope');
  perform tests.as_service();
  perform tests.ok(public.run_email_jobs() = 3, 'job results counted');
  perform tests.ok((select last_error from public.email_jobs where name = 'a.bad') like '%boom%', 'failure recorded');
  perform tests.ok((select last_error from public.email_jobs where name = 'c.missing') like '%missing%', 'missing function recorded');
  perform tests.ok(public.run_email_jobs() = 0, 'jobs are not run again before they are due');

  -- The organization's email log: owners and admins only.
  perform tests.as_user(owner);
  perform tests.ok(tests.count(format('select * from public.org_email_log(%L)', org)) = 3, 'owner sees the log');
  perform tests.as_user(bob);
  perform tests.throws(format('select * from public.org_email_log(%L)', org), 'others cannot see the log', 'owner or an admin');
end $$;
rollback;
\echo ok
