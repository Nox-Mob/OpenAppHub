-- Stripe events out of order (hub 0009): an older event never undoes a newer one.
begin;
do $$
declare
  alice uuid := tests.create_user('order@example.org');
  org uuid;
begin
  perform tests.as_user(alice);
  org := public.create_organization('Order Org');
  perform tests.as_super();
  perform public.billing_apply_subscription(org, 'cus_O', 'sub_O', 'suite', 'active', '{}', now() + interval '30 days', false, now());
  -- Cancelled (newer), then a late "active" from before arrives: still cancelled.
  perform public.billing_apply_subscription(org, 'cus_O', 'sub_O', 'suite', 'canceled', '{}', null, false, now() + interval '1 minute');
  perform public.billing_apply_subscription(org, 'cus_O', 'sub_O', 'suite', 'active', '{}', null, false, now() - interval '1 minute');
  perform tests.ok((select status from billing.subscriptions where org_id = org) = 'canceled', 'a late, older update changes nothing');
  perform public.billing_set_status('sub_O', 'past_due', now() - interval '2 minutes');
  perform tests.ok((select status from billing.subscriptions where org_id = org) = 'canceled', 'nor an older status change');
  -- A newer one applies; without a time it applies too (as before).
  perform public.billing_set_status('sub_O', 'active', now() + interval '2 minutes');
  perform tests.ok((select status from billing.subscriptions where org_id = org) = 'active', 'a newer status applies');
  perform public.billing_set_status('sub_O', 'past_due');
  perform tests.ok((select status from billing.subscriptions where org_id = org) = 'past_due', 'no time: applies');
  -- Subscribing again (a new subscription) isn't held back by the old one's times.
  perform public.billing_apply_subscription(org, 'cus_O', 'sub_NEW', 'starter', 'active', '{board}', null, false, now() + interval '1 minute');
  perform tests.ok((select stripe_subscription_id from billing.subscriptions where org_id = org) = 'sub_NEW', 'a new subscription applies');
end $$;
rollback;
