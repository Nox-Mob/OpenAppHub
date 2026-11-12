-- The suite demo, second version. STAGING only (never production).
--
-- Three accounts, all with the password OpenAppHubDemo2026:
--   demo@demo.openapphub.org      (Alex Morgan)    owner of "Riverside Community Association",
--                                  a neighbourhood association, in all three apps
--   national@demo.openapphub.org  (Casey Ramirez)  owner of "Northstar Veterans League", a
--                                  veterans national with four posts, in all three apps; Post 7
--                                  runs its own board in OpenBoardApp, Post 12's request waits
--   test@demo.openapphub.org      (Test Account)   no organization: a new customer
--
-- hub.reset_suite_demo() rebuilds them every 12 hours (the demo-reset workflow), dated from the
-- day it runs, so due dates and "this month" always look current. Each app fills its part, in
-- order: Charter (members and dues), then Ledger (books built from Charter's payments), then
-- Board (reports quoting both). An app that isn't installed is skipped.
do $$
begin
  if coalesce((select environment from hub.instance where id), '') <> 'staging' then
    raise exception 'Refusing to seed: this database is not marked staging.';
  end if;
end
$$;

create or replace function hub.reset_suite_demo()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c_org constant uuid := 'de000000-0000-4000-8000-0000000000a1';
  c_natl_org constant uuid := 'de000000-0000-4000-8000-0000000000b1';
  c_demo constant uuid := 'de000000-0000-4000-8000-000000000001';
  c_test constant uuid := 'de000000-0000-4000-8000-000000000002';
  c_natl constant uuid := 'de000000-0000-4000-8000-000000000003';
  c_password constant text := 'OpenAppHubDemo2026';
  v_app text;
  v_apps text[] := '{}';
  v_post_org uuid;
begin
  if coalesce((select environment from hub.instance where id), '') <> 'staging' then
    raise exception 'The suite demo exists on staging only.';
  end if;

  perform hub._demo_account(c_demo, 'demo@demo.openapphub.org', 'Alex Morgan', c_password);
  perform hub._demo_account(c_natl, 'national@demo.openapphub.org', 'Casey Ramirez', c_password);
  perform hub._demo_account(c_test, 'test@demo.openapphub.org', 'Test Account', c_password);

  -- Remove everything the accounts made: the organizations they own (chapters' organizations go
  -- with their national), their places in other organizations, invitations, the old demos.
  delete from public.organizations o
  where o.id in (c_org, c_natl_org)
     or o.id in (select m.org_id from public.memberships m where m.user_id in (c_demo, c_test, c_natl) and m.role = 'owner')
     or o.id in ('d0e00000-0000-0000-0000-000000000002', 'd0e00000-0000-0000-0000-000000000004',
                 'd0000000-0000-0000-0000-000000000001', 'd1000000-0000-4000-8000-000000000001',
                 'd60400ef-9dbb-414a-9a3e-e0cbf2fc15ab');
  delete from public.memberships where user_id in (c_demo, c_test, c_natl);
  delete from public.invitations where invited_by in (c_demo, c_test, c_natl);
  delete from auth.users where lower(email) in ('ledger.demo@demo.openapphub.org', 'board.demo@demo.openapphub.org',
    'demo-national@opencharter.test', 'demo-chapter@opencharter.test', 'demo-member@opencharter.test');
  delete from public.email_outbox where to_user_id in (c_demo, c_test, c_natl);
  delete from billing.trial_grants where user_id in (c_demo, c_test, c_natl);
  delete from hub.legal_acceptances where user_id = c_test;
  delete from hub.user_preferences where user_id in (c_demo, c_test, c_natl);
  insert into hub.legal_acceptances (user_id, document, accepted_at)
  values (c_demo, 'terms', now()), (c_demo, 'privacy', now()), (c_natl, 'terms', now()), (c_natl, 'privacy', now())
  on conflict (user_id, document) do update set accepted_at = excluded.accepted_at;

  -- The two organizations, each with a long trial (hub.demo_orgs).
  insert into public.organizations (id, name, slug, created_by, time_zone, currency) values
    (c_org, 'Riverside Community Association', 'riverside-community-association', c_demo, 'America/Chicago', 'USD'),
    (c_natl_org, 'Northstar Veterans League', 'northstar-veterans-league', c_natl, 'America/Chicago', 'USD');
  insert into public.memberships (org_id, user_id, role) values (c_org, c_demo, 'owner'), (c_natl_org, c_natl, 'owner');
  insert into hub.demo_orgs (org_id, created_by) values (c_org, c_demo), (c_natl_org, c_natl);
  insert into hub.org_settings (org_id, billing_email, billing_name) values
    (c_org, 'demo@demo.openapphub.org', 'Riverside Community Association'),
    (c_natl_org, 'national@demo.openapphub.org', 'Northstar Veterans League')
  on conflict (org_id) do nothing;

  -- Each app's part, if installed: Charter, then Ledger (from Charter's payments), then Board.
  foreach v_app in array array['charter', 'ledger', 'board'] loop
    if to_regprocedure(v_app || '.demo_fill(uuid,uuid)') is not null then
      execute format('select %I.demo_fill($1, $2)', v_app) using c_org, c_demo;
      v_apps := v_apps || v_app;
    end if;
    if to_regprocedure(v_app || '.demo_fill_national(uuid,uuid)') is not null then
      execute format('select %I.demo_fill_national($1, $2)', v_app) using c_natl_org, c_natl;
    end if;
  end loop;

  -- Post 7's own organization (made by Charter's approval): its board in OpenBoardApp.
  select o.id into v_post_org from public.organizations o
  where o.parent_org_id = c_natl_org and o.name = 'Post 7 Riverbend';
  if v_post_org is not null and to_regprocedure('board.demo_fill_post(uuid,uuid)') is not null then
    perform board.demo_fill_post(v_post_org, c_natl);
  end if;

  -- The demo accounts' email never leaves (demo addresses are never sent), but don't keep it.
  delete from public.email_outbox where to_user_id in (c_demo, c_test, c_natl);

  return jsonb_build_object('organizations', jsonb_build_array(c_org, c_natl_org), 'chapter_board', v_post_org,
    'apps', v_apps, 'reset_at', now());
end;
$$;

revoke all on function hub.reset_suite_demo() from public, anon, authenticated;

select hub.reset_suite_demo();
