-- The task digest (core 0007): per-person settings, what it says, and when it's queued.
begin;
-- Stand-ins for the apps' integration views (the real ones live in each app's schema).
create schema if not exists board;
create schema if not exists ledger;
create table board.fake_items (org_id uuid, assignee_id uuid, title text, due_date date, status text, link text);
create view board.api_action_items as select * from board.fake_items;
create table board.fake_meetings (id uuid default gen_random_uuid(), org_id uuid, title text, meeting_date date,
  start_time text, status text);
create view board.api_meetings as select * from board.fake_meetings;
create table ledger.fake_tasks (org_id uuid, title text, due_on date, link text);
create view ledger.api_tasks as select * from ledger.fake_tasks;
create table ledger.member_roles (org_id uuid, user_id uuid, role text);

do $$
declare
  ann uuid := tests.create_user('ann@example.org', '{"full_name":"Ann Admin"}');
  bob uuid := tests.create_user('bob@example.org', '{"full_name":"Bob Member"}');
  cat uuid := tests.create_user('cat@example.org', '{"full_name":"Cat Treasurer"}');
  out uuid := tests.create_user('out@example.org', '{"full_name":"Olga Outside"}');
  lake uuid; pine uuid; d jsonb; n int;
begin
  perform tests.as_user(ann);
  lake := public.create_organization('Lakeview');
  pine := public.create_organization('Pinecrest');
  perform tests.as_super();
  update public.organizations set time_zone = 'America/Chicago' where id in (lake, pine);
  insert into public.memberships (org_id, user_id, role) values (lake, bob, 'member'), (lake, cat, 'member');
  insert into ledger.member_roles values (lake, cat, 'treasurer');
  insert into board.fake_items values
    (lake, bob, 'Send the budget', current_date - 1, 'open', '/board/tasks'),
    (lake, bob, 'Done already', current_date, 'done', '/board/tasks'),
    (lake, ann, 'Ann''s item', null, 'in_progress', '/board/tasks?x=1');
  insert into board.fake_meetings (org_id, title, meeting_date, start_time, status) values
    (lake, 'Budget meeting', current_date + 3, '6:30 PM', 'scheduled'),
    (lake, 'Far away', current_date + 30, null, 'scheduled'),
    (lake, 'Cancelled', current_date + 1, null, 'cancelled');
  insert into ledger.fake_tasks values (lake, 'Record rent', current_date + 2, '/ledger/recurring');

  -- Settings: defaults, saving, validation.
  perform tests.as_user(ann);
  perform tests.ok((select digest = 'weekly' and digest_day = 1 and digest_hour = 7 and digest_include = '{tasks,meetings}'
                    from public.get_digest_preferences()), 'defaults');
  perform tests.ok((select digest_time_zone from public.get_digest_preferences()) = 'America/Chicago',
    'time zone defaults to the first organization''s');
  perform public.set_digest_preferences('daily', 3, 18, 'Europe/London', array[lake], array['tasks']);
  perform tests.ok((select digest = 'daily' and digest_day = 3 and digest_hour = 18 and digest_time_zone = 'Europe/London'
                    and digest_org_ids = array[lake] and digest_include = '{tasks}' from public.get_digest_preferences()), 'saved');
  perform tests.ok((select digest from public.get_email_preferences()) = 'daily', 'the older email settings see the same choice');
  perform public.set_digest_preferences('weekly', 1, 7, null, '{}', array['tasks', 'meetings']);
  perform tests.ok((select digest_org_ids is null from public.get_digest_preferences()), 'an empty list means all organizations');
  perform tests.throws($q$select public.set_digest_preferences('hourly', 1, 7, null, null, array['tasks'])$q$, 'bad frequency', 'daily or weekly');
  perform tests.throws($q$select public.set_digest_preferences('weekly', 7, 7, null, null, array['tasks'])$q$, 'bad day', 'day of the week');
  perform tests.throws($q$select public.set_digest_preferences('weekly', 1, 24, null, null, array['tasks'])$q$, 'bad hour', 'choose a time');
  perform tests.throws($q$select public.set_digest_preferences('weekly', 1, 7, 'Mars/Base', null, array['tasks'])$q$, 'bad zone', 'time zone');
  perform tests.throws($q$select public.set_digest_preferences('weekly', 1, 7, null, null, '{}')$q$, 'nothing included', 'includes');
  perform tests.throws($q$select public.set_digest_preferences('weekly', 1, 7, null, null, array['gossip'])$q$, 'unknown part', 'includes');
  perform tests.as_user(out);
  perform tests.throws(format('select public.set_digest_preferences(%L, 1, 7, null, array[%L]::uuid[], array[%L])', 'weekly', lake, 'tasks'),
    'only your own organizations', 'your own organizations');
  perform tests.throws(format('select public.digest_for(%L)', ann), 'browsers cannot read anyone''s digest', 'permission denied');
  perform tests.throws('select public.queue_digests()', 'browsers cannot queue digests', 'permission denied');

  -- What each person's digest says.
  perform tests.as_service();
  d := public.digest_for(bob, 'weekly');
  perform tests.ok(jsonb_array_length(d->'orgs') = 1, 'Bob: one organization');
  perform tests.ok(jsonb_array_length(d->'orgs'->0->'tasks') = 1, 'Bob: only his open Board item (not Ledger, not done ones)');
  perform tests.ok((d->'orgs'->0->'tasks'->0->>'overdue')::boolean, 'overdue marked');
  perform tests.ok(d->'orgs'->0->'tasks'->0->>'link' = ('/board/tasks?org=' || lake), 'link opens the right organization');
  perform tests.ok(jsonb_array_length(d->'orgs'->0->'meetings') = 1, 'only scheduled meetings in the next week');
  perform tests.ok(jsonb_array_length(public.digest_for(bob, 'daily')->'orgs'->0->'meetings') = 0, 'daily looks two days ahead');
  d := public.digest_for(cat, 'weekly');
  perform tests.ok(d->'orgs'->0->'tasks' @> '[{"app":"ledger","title":"Record rent"}]', 'treasurers see Ledger tasks');
  d := public.digest_for(ann, 'weekly');
  perform tests.ok(d->'orgs'->0->>'org_name' = 'Lakeview' and jsonb_array_length(d->'orgs') = 1,
    'organizations with nothing to report are left out');
  perform tests.ok(d->'orgs'->0->'tasks' @> '[{"app":"ledger"},{"app":"board","title":"Ann''s item"}]', 'owners see Ledger tasks');
  perform tests.ok(d->'orgs'->0->'tasks' @> jsonb_build_array(jsonb_build_object('link', '/board/tasks?x=1&org=' || lake)), 'link keeps its query');

  -- Choices narrow it.
  perform tests.as_super();
  insert into public.email_preferences (user_id, digest_include) values (bob, '{meetings}')
  on conflict (user_id) do update set digest_include = excluded.digest_include;
  perform tests.as_service();
  d := public.digest_for(bob, 'weekly');
  perform tests.ok(jsonb_array_length(d->'orgs'->0->'tasks') = 0 and jsonb_array_length(d->'orgs'->0->'meetings') = 1,
    'meetings only');
  perform tests.as_super();
  update public.email_preferences set digest_include = '{tasks,meetings}', digest_org_ids = array[pine] where user_id = ann;
  insert into public.email_preferences (user_id, digest_org_ids) values (ann, array[pine])
  on conflict (user_id) do update set digest_org_ids = excluded.digest_org_ids;
  perform tests.as_service();
  perform tests.ok(jsonb_array_length(public.digest_for(ann)->'orgs') = 0, 'only the chosen organizations');

  -- Queueing: everyone is due at hour 0 in UTC every day.
  perform tests.as_super();
  delete from public.email_preferences;
  update public.organizations set time_zone = 'UTC';
  insert into public.email_preferences (user_id, digest, digest_hour) values
    (ann, 'daily', 0), (bob, 'daily', 0), (cat, 'off', 0), (out, 'daily', 0);
  perform tests.as_service();
  n := public.queue_digests();
  perform tests.ok(n = 2, format('queued for Ann and Bob only (got %s)', n));
  perform tests.ok((select count(*) from public.email_outbox where template = 'digest' and to_user_id = bob
                    and category = 'digest' and app = 'hub') = 1, 'Bob''s digest is in the outbox');
  perform tests.ok(not exists (select 1 from public.email_outbox where template = 'digest' and to_user_id in (cat, out)),
    'off and nothing-to-report are skipped');
  perform tests.ok(public.queue_digests() = 0, 'once per day');
  -- Weekly on another day, or later in the day, isn't due.
  perform tests.as_super();
  delete from public.email_outbox where template = 'digest';
  update public.email_preferences set digest_last_sent_at = null, digest = 'weekly',
    digest_day = (extract(dow from now() at time zone 'UTC')::int + 1) % 7 where user_id = ann;
  update public.email_preferences set digest_last_sent_at = null, digest_hour = 23 where user_id = bob;
  perform tests.as_service();
  perform tests.ok(public.queue_digests() = (case when extract(hour from now() at time zone 'UTC') >= 23 then 1 else 0 end),
    'not the chosen day or hour yet');
  perform tests.ok(exists (select 1 from public.email_jobs where name = 'core.digest' and fn = 'public.queue_digests'),
    'registered as an email job');
end $$;
rollback;
\echo ok
