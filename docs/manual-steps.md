# Manual steps for the owner

These are the things the code can't do: settings in dashboards, accounts, decisions and legal text.
Everything else from the security reviews is done in the code. The reviews themselves are in
[`security-review.md`](security-review.md).

The steps are in order of importance. Tick each one off when it's done.

## 1. Protect your own accounts (do this first)

- [ ] Turn on two-step sign-in for **your own** accounts at GitHub, Supabase, Cloudflare, Stripe,
      Resend and your domain registrar.

Anyone who gets into one of these could change the whole suite. This matters more than anything else
on this page.

## 2. Approve staging into production

- [ ] Review and merge `staging` into `main` in each repository when you're ready.

Production (`openapphub.org`) is several security rounds behind staging. Until the merge, production
doesn't have rounds 2 to 7, the security headers (HSTS, COOP, Permissions-Policy, no caching of
private pages) or Web Analytics. Web Analytics only runs on production builds, so it starts with this
merge.

After the merge, the production database needs the same migrations as staging. Run each repository's
**Migrate** workflow against production yourself (a dry run first). We never run migrations on
production.

The daily **Live demo checks** in OpenCharterApp fail today for the same reason: they test the code on
`main` against the staging database, which is newer. They pass again after the merge.

## 3. GitHub

In each of the five repositories:

- [ ] **Branch protection.** **Settings** > **Rules** > **Rulesets** > **New branch ruleset**. One
      ruleset for `main` and `staging` with **Restrict deletions**, **Block force pushes**, **Require a
      pull request before merging** and **Require status checks to pass** (choose the CI checks).
- [ ] **Dependabot alerts** and **Dependabot security updates**: **Settings** > **Code security**.
- [ ] **Dependency graph**: same page. It also gives you a list of every package (an SBOM) under
      **Insights** > **Dependency graph** > **Export SBOM**.
- [ ] **Secret scanning** and **Push protection**: same page. Needed for OpenCharterApp, OpenBoardApp
      and OpenLedgerApp.
- [ ] **Old "regenerate database types" pull requests.** The bot opens one each time the database
      changes, and older ones are left open (7 in OpenCharterApp, 6 in OpenBoardApp, 7 in
      OpenLedgerApp). Merge the newest one in each repository into `staging` and close the rest.

## 4. Supabase (production project)

Under **Authentication**:

- [ ] **Leaked password protection:** on (under **Passwords**).
- [ ] **Minimum password length:** 12. Our screens already ask for at least 8; 12 is safer.
- [ ] **Confirm email:** on. Leave it on: with it off, sign-up tells anyone whether an email address
      already has an account.
- [ ] **URL configuration:** allow only `openapphub.org` and the app domains as redirect addresses.
- [ ] **Sessions:** sign people out after a time with no use (for example 7 days).
- [ ] **CAPTCHA:** turn on Cloudflare Turnstile under **Attack Protection** before sign-ups open to
      the public.

Under **Database**:

- [ ] **Enforce SSL:** on.
- [ ] **Point-in-time recovery:** on, if your plan allows. It lets you roll the database back to any
      minute, the best protection against mistakes.

## 5. Cloudflare

- [ ] Turn on the **WAF managed rules** (a firewall that blocks common attacks) for `openapphub.org`.
- [ ] Set up **notifications** for Worker errors, sent to an operations email address.

Already done: TLS 1.2 minimum, always HTTPS, and Web Analytics switched to production builds only.

## 6. Email

- [ ] Create **security@openapphub.org** for security reports. Tell us when it exists and we'll put it
      in `security.txt` and the docs (they use support@openapphub.org today).

## 7. Decisions we need from you

- [ ] **Card payments in OpenCharterApp on hosted.** Members paying dues by card (each organization's
      own Stripe) needs the service role and `GATEWAY_ENCRYPTION_KEY` on the Charter Worker, which
      hosted Charter doesn't have, by design. Either give the Worker those two secrets (quick, but it
      then holds the service role like the hub), or let us move those steps into database functions
      (more work, keeps "only the hub holds the service role"). We recommend the second, before
      Stripe goes live.
- [ ] **Stripe production.** Live prices and the customer portal wait on the legal entity and EIN.
      When you have them, set up live mode in Stripe and add the live keys as Worker secrets
      ([`SECRETS.md`](SECRETS.md)).

## 8. Legal text

- [ ] **Privacy Policy.** The page is a placeholder. It needs the final text before launch. It should
      mention Cloudflare Web Analytics (no cookies, counts visits), Supabase, Stripe and Resend.

## 9. Secrets only you can make

Never paste these into a chat or commit them. Add them under **Settings** > **Secrets and variables**

> **Actions** in the repository named.

- [ ] **Production smoke test** (OpenAppHub): `SMOKE_EMAIL` and `SMOKE_PASSWORD` for a check account
      that belongs to one organization. The test only reads. See
      `.github/workflows/production-smoke.yml`.
- [ ] **Self-hosted servers** (for anyone who self-hosts): each app needs `SUPABASE_SERVICE_ROLE_KEY`
      on its server for invitations, account recovery and email. This is in each app's self-hosting
      guide; nothing to do for hosted.

## Done

Move items here, with the date, when they're finished.

- 2026-11-14: Two-step sign-in (TOTP) enabled on the production and staging Supabase projects.
