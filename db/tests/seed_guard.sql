-- Used by run.sh: the staging seed must refuse a database with a real
-- (non-demo) organization. Everything is rolled back either way.
begin;
insert into public.organizations (name) values ('A real organization');
update hub.instance set environment = null;
\i db/seed/0001_hub_staging.sql
rollback;
