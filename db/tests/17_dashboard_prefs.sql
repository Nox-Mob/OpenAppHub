-- H-03: each person's dashboard panels and default organization (hub 0008).
begin;
do $$
declare
  ann uuid := tests.create_user('ann@dash.org', '{"full_name":"Ann"}');
  bob uuid := tests.create_user('bob@dash.org', '{"full_name":"Bob"}');
  a uuid;
  b uuid;
begin
  perform tests.as_user(ann);
  a := public.create_organization('Alpha Dash');
  perform tests.ok((select hidden = '{}' and default_org_id is null from public.hub_get_dashboard_prefs()), 'everything shows; no default');
  perform public.hub_set_dashboard_panels('{money,decisions,money,nonsense}');
  perform tests.ok((select hidden from public.hub_get_dashboard_prefs()) = '{decisions,money}', 'hidden panels kept, once, known ones only');
  perform public.hub_set_default_org(a);
  perform tests.ok((select default_org_id from public.hub_get_dashboard_prefs()) = a, 'default organization kept');
  perform tests.as_user(bob);
  b := public.create_organization('Bravo Dash');
  perform tests.throws(format('select public.hub_set_default_org(%L)', a), 'only your own organizations', 'not in that');
  perform tests.ok((select hidden = '{}' from public.hub_get_dashboard_prefs()), 'each person their own');
  -- Leaving the default organization: it's no longer the default.
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values (b, ann, 'member');
  perform tests.as_user(ann);
  perform public.hub_set_default_org(b);
  perform tests.as_super();
  delete from public.memberships where org_id = b and user_id = ann;
  perform tests.as_user(ann);
  perform tests.ok((select default_org_id is null from public.hub_get_dashboard_prefs()), 'not a default once you''ve left');
  perform public.hub_set_default_org(null);
  perform tests.as_anon();
  perform tests.throws('select public.hub_set_dashboard_panels(''{}'')', 'signed in only');
end $$;
rollback;
