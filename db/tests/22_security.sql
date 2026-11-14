-- Security review (core 0017): stored links are paths in the suite, outbox addresses are plain,
-- registry function names are plain, and one read policy still shows the same organizations.
begin;
do $$
declare
  ann uuid := tests.create_user('ann@sec.example.org');
  org uuid;
  bad text;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Security Org');
  perform tests.as_super();
  -- Links.
  foreach bad in array array['//evil.example/x', 'https://evil.example', 'javascript:alert(1)', '/\evil.example', 'evil'] loop
    perform tests.throws(format($q$insert into public.notifications (org_id, user_id, kind, title, link) values (%L, %L, 'tasks.assigned', 'x', %L)$q$, org, ann, bad),
      format('notification link %s refused', bad), 'notifications_link_is_path');
  end loop;
  insert into public.notifications (org_id, user_id, kind, title, link) values (org, ann, 'tasks.assigned', 'ok', '/billing');
  perform tests.ok(true, 'a path in the suite is fine');
  -- Addresses.
  foreach bad in array array[E'a@b.org\r\nRCPT TO:<x@y.org>', 'Ann <ann@b.org>', 'a@b.org, c@d.org', 'no-at-sign', 'a b@c.org'] loop
    perform tests.throws(format($q$insert into public.email_outbox (app, template, to_email) values ('hub', 'test', %L)$q$, bad),
      'an address that isn''t one plain address is refused', 'check constraint "email_outbox_to_email');
  end loop;
  insert into public.email_outbox (app, template, to_email) values ('hub', 'test', 'ann@sec.example.org');
  -- Registry function names.
  perform tests.throws($q$insert into public.email_jobs (name, fn, every) values ('x', 'public.f(); drop table x; --', interval '1 day')$q$,
    'a function name with SQL in it is refused', 'email_jobs_fn_name');
  -- One read policy: still exactly your organizations.
  perform tests.as_user(ann);
  perform tests.ok((select count(*) from public.organizations where id = org) = 1, 'the member reads their organization');
  perform tests.ok(not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'organizations'
                               and cmd = 'SELECT' and policyname <> 'organizations: members and chapter parents read'), 'one read policy');
end $$;
rollback;

-- Invitations: at most 100 an hour per organization.
begin;
do $$
declare
  ann uuid := tests.create_user('ann@invites.example.org');
  org uuid;
  i int;
begin
  perform tests.as_user(ann);
  org := public.create_organization('Invites Org');
  perform tests.as_super();
  insert into public.invitations (org_id, email, role, token_hash, expires_at, invited_by)
  select org, format('p%s@invites.example.org', g), 'member', md5(g::text || random()::text), now() + interval '7 days', ann
  from generate_series(1, 100) g;
  perform tests.throws(format($q$insert into public.invitations (org_id, email, role, token_hash, expires_at) values (%L, 'one.more@invites.example.org', 'member', 'h101', now() + interval '7 days')$q$, org),
    'the 101st invitation in an hour is refused', 'a lot of invitations');
end $$;
rollback;
