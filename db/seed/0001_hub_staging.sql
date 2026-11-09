-- Staging only (applied by staging.yml with --seed; never on production).
-- Marks this database as staging so the hub's demo tools work for platform
-- operators. Refuses to run where real (non-demo) organizations exist.
do $$
begin
  if exists (
    select 1 from public.organizations o
    where not exists (select 1 from hub.demo_orgs d where d.org_id = o.id)
  ) and coalesce((select environment from hub.instance where id), '') <> 'staging' then
    raise exception 'Refusing to seed: this database has real organizations.';
  end if;
  update hub.instance set environment = 'staging' where id;
end
$$;
