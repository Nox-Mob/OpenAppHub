-- Organization time zone and currency; ownership transfer to active members,
-- confirmed by typing their name.
begin;
do $$
declare
  owner uuid := tests.create_user('owner@example.org', '{"full_name":"Olive Owner"}');
  bob uuid := tests.create_user('bob@example.org', '{"full_name":"Bob Tremblay"}');
  nameless uuid := tests.create_user('nameless@example.org');
  pending uuid := tests.create_user('pending@example.org', '{"full_name":"Pat Pending"}', false);
  admin uuid := tests.create_user('admin@example.org', '{"full_name":"Ada Admin"}');
  org uuid;
begin
  perform tests.as_super();
  update public.profiles set display_name = null where id = nameless;
  perform tests.as_user(owner);
  org := public.create_organization('Settings Org');
  perform tests.as_super();
  insert into public.memberships (org_id, user_id, role) values
    (org, bob, 'member'), (org, nameless, 'viewer'), (org, pending, 'member'), (org, admin, 'admin');

  -- Defaults, then preferences (owner/admin only, validated).
  perform tests.ok((select time_zone || ' ' || currency from public.organizations where id = org) = 'UTC USD', 'defaults');
  perform tests.as_user(admin);
  perform public.set_organization_preferences(org, 'America/Toronto', 'cad');
  perform tests.ok((select time_zone || ' ' || currency from public.organizations where id = org) = 'America/Toronto CAD', 'admin sets time zone and currency');
  perform tests.throws(format('select public.set_organization_preferences(%L, %L, %L)', org, 'Mars/Olympus', 'USD'), 'unknown time zone refused', 'time zone');
  perform tests.throws(format('select public.set_organization_preferences(%L, %L, %L)', org, 'UTC', 'DOLLARS'), 'bad currency refused', 'currency');
  perform tests.as_user(bob);
  perform tests.throws(format('select public.set_organization_preferences(%L, %L, %L)', org, 'UTC', 'USD'), 'members cannot change preferences', 'owner or an admin');

  -- Candidates: active members only, with what to type.
  perform tests.as_user(owner);
  perform tests.ok(tests.count(format('select * from public.ownership_transfer_candidates(%L)', org)) = 3, 'unconfirmed member is not a candidate');
  perform tests.as_super();
  perform tests.ok(public._member_confirm_text(bob) = 'Bob Tremblay', 'confirm text is the name');
  perform tests.ok(public._member_confirm_text(nameless) = 'nameless@example.org', 'falls back to the email');
  perform tests.as_user(owner);

  -- Transfer refuses inactive members and wrong confirmations.
  perform tests.throws(format('select public.transfer_ownership(%L, %L)', org, pending), 'unconfirmed account refused', 'active account');
  perform tests.throws(format('select public.transfer_ownership(%L, %L, %L)', org, bob, 'Bob'), 'partial name refused', 'exactly as shown');
  perform tests.throws(format('select public.transfer_ownership(%L, %L, %L)', org, bob, 'Ada Admin'), 'someone else''s name refused', 'exactly as shown');
  perform tests.as_user(admin);
  perform tests.throws(format('select public.transfer_ownership(%L, %L, %L)', org, bob, 'Bob Tremblay'), 'admin cannot transfer', 'only the owner');

  -- Right name (case and spaces don't matter) transfers.
  perform tests.as_user(owner);
  perform public.transfer_ownership(org, bob, '  bob tremblay ', tests.reauth(owner, 'transfer_ownership'));
  perform tests.as_super();
  perform tests.ok((select role from public.memberships where org_id = org and user_id = bob) = 'owner', 'bob is owner');
  perform tests.ok((select role from public.memberships where org_id = org and user_id = owner) = 'admin', 'old owner is admin');
end
$$;
rollback;
\echo ok
