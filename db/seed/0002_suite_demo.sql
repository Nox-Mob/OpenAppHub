-- The suite demo, STAGING only (applied by staging.yml / Migrate with --seed; never production).
--
-- One demo account and one test account, the same in the hub and every app:
--   demo@demo.openapphub.org  (Alex Morgan)   password OpenAppHubDemo2026
--     owner of "Riverside Community Association", with about three months of history in
--     OpenCharterApp, OpenBoardApp and OpenLedgerApp;
--   test@demo.openapphub.org  (Test Account)  password OpenAppHubDemo2026
--     an active account with no organization and no data, for trying things as a new customer.
--
-- hub.reset_suite_demo() puts both back exactly like this: it removes everything either account
-- made, recreates the organization and asks each app to fill in its part (<app>.demo_fill, from
-- the app's own staging seed; an app that isn't installed is skipped). The demo-reset workflow
-- runs it every 12 hours, so the demo is always ready for screenshots and demonstrations.
do $$
begin
  if coalesce((select environment from hub.instance where id), '') <> 'staging' then
    raise exception 'Refusing to seed: this database is not marked staging.';
  end if;
end
$$;

create or replace function hub._demo_account(p_id uuid, p_email text, p_name text, p_password text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from auth.users where lower(email) = p_email and id <> p_id) then
    raise exception '% belongs to another account', p_email;
  end if;
  if not exists (select 1 from auth.users where id = p_id) then
    insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at, confirmation_token,
      recovery_token, email_change_token_new, email_change, email_change_token_current,
      reauthentication_token, phone_change, phone_change_token)
    values ('00000000-0000-0000-0000-000000000000', p_id, 'authenticated', 'authenticated', p_email,
      extensions.crypt(p_password, extensions.gen_salt('bf')), now(),
      '{"provider":"email","providers":["email"]}', jsonb_build_object('full_name', p_name),
      now(), now(), '', '', '', '', '', '', '', '');
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (p_id::text, p_id, jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
      'email', now(), now(), now());
  end if;
  -- Undo anything a visitor changed: password, name, email, two-step sign-in, sessions.
  update auth.users set
    email = p_email,
    encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
    email_confirmed_at = coalesce(email_confirmed_at, now()),
    email_change = '', email_change_token_new = '', email_change_token_current = '',
    raw_user_meta_data = jsonb_build_object('full_name', p_name),
    banned_until = null,
    updated_at = now()
  where id = p_id;
  if to_regclass('auth.mfa_factors') is not null then
    execute 'delete from auth.mfa_factors where user_id = $1' using p_id;
  end if;
  update public.profiles set display_name = p_name where id = p_id;
end;
$$;

create or replace function hub.reset_suite_demo()
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  c_org constant uuid := 'de000000-0000-4000-8000-0000000000a1';
  c_demo constant uuid := 'de000000-0000-4000-8000-000000000001';
  c_test constant uuid := 'de000000-0000-4000-8000-000000000002';
  c_password constant text := 'OpenAppHubDemo2026';
  v_app text;
  v_apps text[] := '{}';
begin
  if coalesce((select environment from hub.instance where id), '') <> 'staging' then
    raise exception 'The suite demo exists on staging only.';
  end if;

  perform hub._demo_account(c_demo, 'demo@demo.openapphub.org', 'Alex Morgan', c_password);
  perform hub._demo_account(c_test, 'test@demo.openapphub.org', 'Test Account', c_password);

  -- Remove what the two accounts made: every organization they own (the demo organization
  -- included, with all of its records in every app), their places in other organizations, and
  -- invitations they sent. Also the older per-app demos this replaces.
  delete from public.organizations o
  where o.id = c_org
     or o.id in (select m.org_id from public.memberships m where m.user_id in (c_demo, c_test) and m.role = 'owner')
     or o.id in ('d0e00000-0000-0000-0000-000000000002', 'd0e00000-0000-0000-0000-000000000004',
                 'd0000000-0000-0000-0000-000000000001', 'd1000000-0000-4000-8000-000000000001',
                 'd60400ef-9dbb-414a-9a3e-e0cbf2fc15ab');
  delete from public.memberships where user_id in (c_demo, c_test);
  delete from public.invitations where invited_by in (c_demo, c_test);
  delete from auth.users where lower(email) in ('ledger.demo@demo.openapphub.org', 'board.demo@demo.openapphub.org',
    'demo-national@opencharter.test', 'demo-chapter@opencharter.test', 'demo-member@opencharter.test');
  -- The test account starts like a brand-new customer: no trial used, nothing accepted yet.
  delete from billing.trial_grants where user_id in (c_demo, c_test);
  delete from hub.legal_acceptances where user_id = c_test;
  delete from hub.user_preferences where user_id in (c_demo, c_test);
  -- The demo account has accepted the terms, so demonstrations start in the app.
  insert into hub.legal_acceptances (user_id, document, accepted_at)
  values (c_demo, 'terms', now()), (c_demo, 'privacy', now())
  on conflict (user_id, document) do update set accepted_at = excluded.accepted_at;

  -- The organization, its owner, and a long trial (demo organizations, hub.demo_orgs).
  insert into public.organizations (id, name, slug, created_by, time_zone, currency)
  values (c_org, 'Riverside Community Association', 'riverside-community-association', c_demo,
    'America/Chicago', 'USD');
  insert into public.memberships (org_id, user_id, role) values (c_org, c_demo, 'owner');
  insert into hub.demo_orgs (org_id, created_by) values (c_org, c_demo);
  insert into hub.org_settings (org_id, billing_email, billing_name)
  values (c_org, 'demo@demo.openapphub.org', 'Riverside Community Association')
  on conflict (org_id) do nothing;

  -- Each app's part, if that app is installed on this database.
  foreach v_app in array array['charter', 'board', 'ledger'] loop
    if to_regprocedure(v_app || '.demo_fill(uuid,uuid)') is not null then
      execute format('select %I.demo_fill($1, $2)', v_app) using c_org, c_demo;
      v_apps := v_apps || v_app;
    end if;
  end loop;

  return jsonb_build_object('organization', c_org, 'apps', v_apps, 'reset_at', now());
end;
$$;

revoke all on function hub._demo_account(uuid, text, text, text) from public, anon, authenticated;
revoke all on function hub.reset_suite_demo() from public, anon, authenticated;

select hub.reset_suite_demo();
