-- Core 0021: invitations with an email address and recovery email changes are limited.
begin;
do $$
declare
  ann uuid := tests.create_user('ann@limits.example.org');
  org uuid;
begin
  -- Core 0017 limits each organization; this limits each person across all of theirs.
  perform tests.as_user(ann);
  org := public.create_organization('Limits Org');
  perform tests.as_super();
  insert into public.invitations (org_id, email, role, token_hash, expires_at, invited_by, created_at)
  select org, format('p%s@limits.example.org', g), 'member', md5(g::text || random()::text),
    now() + interval '7 days', ann, now() - interval '2 hours'
  from generate_series(1, 200) g;
  perform tests.as_user(ann);
  org := public.create_organization('Second Org');
  perform tests.throws(format('select public.create_invitation(%L, %L, %L)', org, 'p201@limits.example.org', 'member'),
    'the 201st emailed invitation in a day is refused, even from a new organization', 'Too many invitations today');
  -- A link-only invitation sends nothing, so it isn't limited.
  perform tests.ok((select count(*) from public.create_invitation(org, null, 'member')) = 1,
    'a link-only invitation still works');

  -- Recovery email: five changes a day.
  perform tests.as_super();
  insert into public.account_security_events (user_id, kind, created_at)
  select ann, 'recovery_email_set', now() - interval '1 hour' from generate_series(1, 5);
  perform tests.throws(format(
    $q$insert into public.account_recovery (user_id, email, updated_at) values (%L, 'new@limits.example.org', now())$q$, ann),
    'a sixth recovery email change in a day is refused', 'Too many recovery email changes');
end $$;
rollback;
