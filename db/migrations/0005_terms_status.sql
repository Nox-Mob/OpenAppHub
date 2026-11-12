-- H-07: one terms step. The hub records acceptance of the suite's Terms of Service and Privacy
-- Policy at sign-up (hub.legal_acceptances). Hosted apps ask this instead of showing their own
-- terms screen again: true when the signed-in person accepted both.
create or replace function public.hub_accepted_terms()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select auth.uid() is not null
     and exists (select 1 from hub.legal_acceptances where user_id = auth.uid() and document = 'terms')
     and exists (select 1 from hub.legal_acceptances where user_id = auth.uid() and document = 'privacy');
$$;
revoke all on function public.hub_accepted_terms() from public, anon;
grant execute on function public.hub_accepted_terms() to authenticated, service_role;
