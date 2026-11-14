-- Security review round 2 (2026-11-14): this repo's schemas through core 0018's tuning, which now
-- also takes the run right off every function for visitors who aren't signed in (only the
-- invitation page and the waitlist are for them). Signed-in and server access stay as they were.
select public._tune_schema('hub');
select public._tune_schema('billing');

-- A09 Logging (security review round 2): the audit log also records changes to who can do what
-- (roles in each app, No access, named roles), to security settings (two-step sign-in for owners
-- and admins, app admins changing roles) and to actions from email. Each row says who changed
-- it and what it was before and after (OpenAppHub → Settings → History).
do $$
declare
  t text;
begin
  foreach t in array array['app_role_overrides', 'org_named_roles', 'org_role_settings', 'email_action_settings'] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists hub_audit on public.%I', t);
      execute format('create trigger hub_audit after insert or update or delete on public.%I
                      for each row execute function hub.audit_core_row()', t);
    end if;
  end loop;
end $$;
