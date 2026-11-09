-- Accounts created before the core migrations get a profile (0002 backfill).
begin;
do $$
begin
  perform tests.ok(
    (select display_name from public.profiles where id = '00000000-0000-0000-0000-0000000000e1') = 'Early Bird',
    'pre-existing account got a profile from its full_name'
  );
end
$$;
rollback;
\echo ok
