-- Core 0022: at most 20 new organizations a day per person (signed-in API calls only).
begin;
do $$
declare
  bo uuid := tests.create_user('bo@orglimit.example.org');
  i int;
begin
  perform tests.as_user(bo);
  for i in 1..20 loop
    perform public.create_organization(format('Org %s', i));
  end loop;
  perform tests.throws($q$select public.create_organization('Org 21')$q$,
    'the 21st organization in a day is refused', 'a lot of organizations');
  -- Server tasks and seeds (not a signed-in caller) aren't limited.
  perform tests.as_super();
  insert into public.organizations (name, slug, created_by) values ('Seeded', 'seeded-orglimit', bo);
  perform tests.ok(true, 'a seed can still create one');
end $$;
rollback;
