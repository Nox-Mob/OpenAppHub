-- H-02: billing notifications (core 0013). They go to the owner, and by email to the
-- organization's billing contact (hub.org_settings.billing_email) when one is set; admins may
-- turn them on for themselves (owner decision 2026-11-13).
--
-- * billing.payment_failed: the subscription became past due or unpaid.
-- * billing.plan_changed: the plan changed, it was set to end, or it ended.
-- * billing.trial_ending: three days and one day before a trial ends (a daily job).

select public.register_notification_kind('billing.trial_ending', 'hub', 'Your trial is ending',
  'A few days, and again one day, before the free trial ends.', 'The owner and the billing contact',
  '{owner,admin}', 'billing', true, true, 10);
select public.register_notification_kind('billing.payment_failed', 'hub', 'A payment didn''t go through',
  'Stripe couldn''t take a payment for the plan.', 'The owner and the billing contact',
  '{owner,admin}', 'billing', true, true, 11);
select public.register_notification_kind('billing.plan_changed', 'hub', 'The plan changed',
  'The plan or its apps changed, it was set to end, or it ended.', 'The owner and the billing contact',
  '{owner,admin}', 'billing', true, true, 12);

create or replace function billing._notify_org(p_org uuid, p_kind text, p_title text, p_body text, p_dedupe text)
returns int
language sql
volatile
security definer
set search_path = ''
as $$
  select public.notify(p_org, p_kind, p_title, p_body, '/billing', 'hub',
    array[public._org_owner(p_org)],
    coalesce((select array[s.billing_email] from hub.org_settings s where s.org_id = p_org and s.billing_email is not null), '{}'),
    p_dedupe, auth.uid());
$$;
revoke all on function billing._notify_org(uuid, text, text, text, text) from public, anon, authenticated;

create or replace function billing._notify_subscription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_old_plan text;
begin
  if new.status in ('past_due', 'unpaid') and (tg_op = 'INSERT' or old.status not in ('past_due', 'unpaid')) then
    perform billing._notify_org(new.org_id, 'billing.payment_failed', 'A payment didn''t go through',
      'Update the card on the Billing page to keep your plan. The apps stay readable until it''s sorted.',
      format('billing:failed:%s:%s', new.org_id, coalesce(new.current_period_end::date::text, now()::date::text)));
  end if;
  if tg_op = 'UPDATE' then
    select name into v_plan from billing.plans where id = new.plan_id;
    select name into v_old_plan from billing.plans where id = old.plan_id;
    if new.status in ('canceled', 'expired') and old.status not in ('canceled', 'expired') then
      perform billing._notify_org(new.org_id, 'billing.plan_changed', 'Your plan ended',
        'The apps are read-only now. You can choose a plan on the Billing page at any time.',
        format('billing:ended:%s:%s', new.org_id, txid_current()));
    elsif new.cancel_at_period_end and not old.cancel_at_period_end then
      perform billing._notify_org(new.org_id, 'billing.plan_changed', 'Your plan is set to end',
        format('It ends on %s. You can keep it on the Billing page.', coalesce(to_char(new.current_period_end, 'FMMonth FMDD, YYYY'), 'the end of this period')),
        format('billing:ending:%s:%s', new.org_id, txid_current()));
    elsif new.plan_id is distinct from old.plan_id and old.plan_id is not null
          or new.apps is distinct from old.apps and new.status in ('active', 'trialing') and old.apps <> '{}' then
      perform billing._notify_org(new.org_id, 'billing.plan_changed',
        case when new.plan_id is distinct from old.plan_id
          then format('Your plan is now %s', coalesce(v_plan, new.plan_id))
          else 'Your plan''s apps changed' end,
        case when new.plan_id is distinct from old.plan_id
          then format('It was %s.', coalesce(v_old_plan, old.plan_id))
          else format('Apps: %s.', coalesce(nullif(array_to_string(new.apps, ', '), ''), 'none')) end,
        format('billing:plan:%s:%s', new.org_id, txid_current()));
    end if;
  end if;
  return null;
end;
$$;
revoke all on function billing._notify_subscription() from public, anon, authenticated;
drop trigger if exists notify_subscription on billing.subscriptions;
create trigger notify_subscription after insert or update on billing.subscriptions
  for each row execute function billing._notify_subscription();

-- Daily: trials ending in the next three days (once), and again in the last day.
create or replace function billing.notify_trials_ending()
returns int
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  r record;
  v_n int := 0;
  v_last boolean;
begin
  for r in
    select s.org_id, s.trial_ends_at from billing.subscriptions s
    where s.status = 'trialing' and s.trial_ends_at > now() and s.trial_ends_at <= now() + interval '3 days'
  loop
    v_last := r.trial_ends_at <= now() + interval '1 day';
    v_n := v_n + billing._notify_org(r.org_id, 'billing.trial_ending',
      case when v_last then 'Your trial ends tomorrow' else 'Your trial ends soon' end,
      format('The free trial ends on %s. Choose a plan on the Billing page to keep everything working; without one, the apps become read-only.',
        to_char(r.trial_ends_at, 'FMMonth FMDD')),
      format('billing:trial:%s:%s:%s', r.org_id, r.trial_ends_at::date, case when v_last then 1 else 3 end));
  end loop;
  return v_n;
end;
$$;
revoke all on function billing.notify_trials_ending() from public, anon, authenticated;
insert into public.email_jobs (name, fn, every)
values ('hub.notify_trials_ending', 'billing.notify_trials_ending', interval '6 hours')
on conflict (name) do nothing;
