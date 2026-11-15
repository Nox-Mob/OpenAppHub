-- Core 0023: when recovery locks (10 wrong backup codes or links in an hour), the person is
-- emailed once and it's recorded in their security activity.
begin;
do $$
declare
  cy uuid := tests.create_user('cy@alerts.example.org');
begin
  perform tests.as_super();
  insert into public.account_security_events (user_id, kind)
  select cy, 'recovery_failed' from generate_series(1, 9);
  perform tests.ok((select count(*) from public.email_outbox where to_user_id = cy
    and template = 'account.security_notice' and data ->> 'event' = 'recovery_locked') = 0,
    'nine wrong tries send nothing yet');
  insert into public.account_security_events (user_id, kind) values (cy, 'recovery_failed');
  perform tests.ok((select count(*) from public.email_outbox where to_user_id = cy
    and template = 'account.security_notice' and data ->> 'event' = 'recovery_locked') = 1,
    'the tenth wrong try emails the person');
  perform tests.ok((select count(*) from public.account_security_events where user_id = cy and kind = 'recovery_locked') = 1,
    'and records it');
  insert into public.account_security_events (user_id, kind) values (cy, 'recovery_failed');
  perform tests.ok((select count(*) from public.email_outbox where to_user_id = cy
    and data ->> 'event' = 'recovery_locked') = 1, 'more tries in the same hour send no more email');
end $$;
rollback;
