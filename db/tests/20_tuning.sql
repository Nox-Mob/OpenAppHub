-- Pre-production tuning (core 0016, hub 0009): nothing left to tune, and the waitlist cap.
begin;
do $$
declare
  s text;
  n int;
begin
  foreach s in array array['public', 'hub', 'billing'] loop
    select count(*) into n from public.tuning_problems(s);
    if n > 0 then
      raise exception 'FAILED: % has % things to tune: %', s, n,
        (select string_agg(kind || ' (' || object || ')', '; ') from public.tuning_problems(s));
    end if;
  end loop;
  -- The waitlist: 30 new sign-ups in 10 minutes, then a polite refusal; someone already on it is fine.
  for n in 1..30 loop
    perform public.hub_join_waitlist(format('person%s@cap.example.org', n));
  end loop;
  perform public.hub_join_waitlist('person1@cap.example.org');
  perform tests.throws($q$select public.hub_join_waitlist('one.more@cap.example.org')$q$, 'capped', 'try again in a few minutes');
end $$;
rollback;
