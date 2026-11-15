# Security review

This document explains how the OpenAppHub suite is protected, what we checked, what we fixed, and what is still left to do. It covers OpenAppHub (the hub), OpenCharterApp, OpenBoardApp, OpenLedgerApp and the docs site.

We did three rounds of review on 2026-11-14:

- **Round 1** followed the [OWASP Top 10](https://owasp.org/Top10/), the ten most common kinds of web security problems.
- **Round 2** asked a bigger question: "Are we doing everything we can?" It focused on sign-in, who can reach what, and how our code gets built and shipped.
- **Round 3** added "confirm it's you" before dangerous actions, two-step sign-in for everyone, backup codes and a recovery email, encrypted sensitive member fields, and one place (OpenAppHub) for every security setting.

The organization plans to get a **SOC 2** report later. SOC 2 is an audit that checks a company's security controls. Each section below names the SOC 2 areas it relates to (like **CC6**, which covers access), so this document can be used as evidence.

**How to read the status column:**

- **Fixed:** we changed the code in this review, and a test checks it.
- **OK:** we checked it, and it was already right.
- **Owner:** it's a setting in a dashboard (Supabase, Cloudflare, GitHub or Stripe), not code. The owner has to do it. These are all listed in [What the owner needs to do](#what-the-owner-needs-to-do).

---

## The big picture

Here's how the suite keeps information safe, in plain words.

1. **The database checks every request.** Every table has _row-level security_: rules that say who can read or change each row. The database applies these rules itself. So even if someone skipped our screens and talked to the database directly, they still couldn't see another organization's data.
2. **The browser never sends database commands.** The apps send _parameters_ (like "organization 123"), never SQL. That blocks SQL injection, a common attack where someone sneaks database commands into a form.
3. **Powerful functions check who's calling.** Some database functions need more power than a normal user. Each of these checks who is calling before doing anything.
4. **React escapes what it shows.** Text people type, like a member's name, is shown as plain text. It can't run as code on someone else's screen.
5. **Card numbers never reach us.** Payments go through Stripe's own secure page.
6. **Sign-in is strong.** Two-step sign-in is available everywhere. Once it's on, a password alone opens nothing.

---

## Round 1: the OWASP Top 10

### A01: Broken access control

_Can people do things they shouldn't? SOC 2: CC6.1, CC6.3._

| Finding                                                                                                                                                                                                                                                                    | Status                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Every table has row-level security turned on. The 23 tables with no rules at all are meant for the server only (like billing and the email queue), and only server functions that check the caller can reach them.                                                         | OK                                                                                             |
| We checked all of the roughly 300 powerful database functions that signed-in people can call. The ones without a caller check only read yes/no facts that need secret IDs, use a secret token (like invitation links), or are demo tools that refuse to run in production. | OK                                                                                             |
| **Redirect to another website.** Links in notifications and email buttons were checked with "starts with `/`". But `//evil.example` also starts with `/`, and browsers treat it as another website. A fake link could send people to a phishing site.                      | **Fixed.** A shared `safePath()` check, plus a database rule that refuses such links.          |
| The sign-in redirect (`?next=`) only allows our own pages.                                                                                                                                                                                                                 | OK                                                                                             |
| Server actions only accept `POST`, and the sign-in cookie is `SameSite=Lax`. So another website can't trick your browser into doing something (this attack is called CSRF).                                                                                                | OK                                                                                             |
| Five tables had two separate "who can read" rules. Two rules are harder to review than one.                                                                                                                                                                                | **Fixed.** One rule each, with exactly the same result. A test fails if a second one is added. |

### A02: Cryptographic failures

_Is secret information protected? SOC 2: CC6.1, CC6.7._

| Finding                                                                                                                                   | Status                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| Invitation links and email-button links: we only store a scrambled fingerprint (SHA-256 hash) of each one, never the link itself.         | OK                                                                                          |
| Email server passwords and Stripe keys are encrypted (AES-GCM) before they're saved. Unsubscribe links are signed so nobody can fake one. | OK                                                                                          |
| Secrets live in Cloudflare and GitHub's secret storage, never in our code. A test fails if one shows up in a config file.                 | OK                                                                                          |
| **No HSTS header.** Without it, someone's very first visit could happen over plain HTTP and be spied on.                                  | **Fixed.** Every app tells browsers to always use HTTPS, for two years, on every subdomain. |
| Data at rest (stored data and backups) is encrypted by Supabase.                                                                          | OK                                                                                          |

### A03: Injection

_Can someone sneak commands into our app? SOC 2: CC8.1._

| Finding                                                                                                                                                                                                    | Status                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| **SQL injection.** Our database functions put names into SQL safely (`%I` and `%L`). The only raw `%s` is a function name read from settings tables that only our migrations can write.                    | OK. Plus, **Fixed:** those names must now be a plain `schema.function`.                                                          |
| **Filter injection.** One Ledger page put an ID from the web address straight into a database filter. A crafted address could have changed the filter (only within the person's own books).                | **Fixed.** Only a real ID is accepted.                                                                                           |
| **XSS (scripts in pages).** React escapes everything. The only raw HTML is a fixed theme script and the chart styles.                                                                                      | OK. Plus, **Fixed:** chart names and colors are checked before they're written.                                                  |
| **Emails.** Every value in an email is escaped.                                                                                                                                                            | OK                                                                                                                               |
| **Email server commands (self-hosted).** A hidden line break in an email address could add a command or another recipient. Our test even showed the address-reading code picking out the injected address. | **Fixed.** Only one plain address is accepted, in the code and in the database.                                                  |
| **Spreadsheet formulas.** A name like `=HYPERLINK(...)` could run as a formula in Excel. All exports already neutralize these.                                                                             | OK                                                                                                                               |
| **Input checks.** Every server action checks its input, and the database has its own checks.                                                                                                               | OK                                                                                                                               |
| **Content Security Policy** (rules for what a page may load) allows inline scripts, because our framework needs them.                                                                                      | Accepted for now. The fixes above stop untrusted content from reaching the page. Moving to _nonces_ is a later framework change. |

### A04: Insecure design

_Can the features themselves be abused? SOC 2: CC3.2, CC7.1._

| Finding                                                                                                    | Status                                                         |
| ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Invitation spam.** Anyone could start a free trial and send unlimited invitation emails from our domain. | **Fixed.** At most 100 an hour and 500 a day per organization. |
| **Waitlist spam.** Anyone could fill the public waitlist with junk.                                        | **Fixed.** At most 30 new sign-ups every 10 minutes.           |
| Sign-in, sign-up and password reset are rate-limited by Supabase.                                          | OK                                                             |
| Payments: Stripe events are checked, counted once, and applied in the right order.                         | OK (the ordering was fixed in the pre-production review).      |

### A05: Security misconfiguration

_Are the settings right? SOC 2: CC6.6, CC7.1._

| Finding                                                                                                            | Status                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| Basic headers are set: no content sniffing, a strict referrer policy, and no showing our pages inside other sites. | OK                                                                                                                      |
| **No `Permissions-Policy` or `Cross-Origin-Opener-Policy`.**                                                       | **Fixed.** Camera, microphone, location, payment and USB are turned off. Our windows are isolated from pages they open. |
| Board files had no size limit.                                                                                     | **Fixed.** 25 MB per file.                                                                                              |
| **Supabase Auth settings** (password length, leaked-password check, email confirmation, allowed addresses).        | **Owner.**                                                                                                              |

### A06: Vulnerable and outdated components

_Are our software libraries safe? SOC 2: CC7.1._

| Finding                                                                                         | Status                                                                                                                         |
| ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm audit`: no known problems in production libraries. Every repo's CI fails on a serious one. | OK                                                                                                                             |
| **No automatic update alerts.**                                                                 | **Fixed.** Dependabot checks packages and GitHub Actions every week in all five repos. Turning on alerts is an **Owner** step. |

### A07: Identification and authentication failures

_Is signing in strong? SOC 2: CC6.1, CC6.2._

Round 2 did most of the work here. See [Two-step sign-in, enforced](#two-step-sign-in-enforced-everywhere).

### A08: Software and data integrity failures

_Can someone tamper with our code or data? SOC 2: CC8.1._

| Finding                                                                                                                                                   | Status                                     |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Every change goes through a pull request to `staging` with tests, then to `main` only with the owner's approval. Production is only migrated from `main`. | OK (but see branch protection in Round 2). |
| Stripe webhooks are signature-checked, with a 5-minute limit to stop replays.                                                                             | OK                                         |
| Three workflows had broader GitHub permissions than they needed.                                                                                          | **Fixed.** Read-only.                      |

### A09: Logging and monitoring

_Do we notice when something goes wrong? SOC 2: CC7.2, CC7.3._

| Finding                                                                                                                   | Status     |
| ------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Audit logs in the hub and every app. Ledger writes its log at the same moment as the change. Audit logs are never pruned. | OK         |
| Sign-in events are in Supabase's logs; errors are in Cloudflare's.                                                        | OK         |
| **No alerts** for unusual activity.                                                                                       | **Owner.** |

### A10: Server-side request forgery

_Can someone make our server fetch something it shouldn't? SOC 2: CC6.6._

| Finding                                                                                                                      | Status |
| ---------------------------------------------------------------------------------------------------------------------------- | ------ |
| Our servers only call fixed addresses: Supabase, Stripe, Resend and our own apps. They never fetch an address someone typed. | OK     |

---

## Round 2: doing everything we can

### Two-step sign-in, enforced everywhere

**The problem.** OpenLedgerApp let people set up two-step sign-in and asked for the code. But sign-in happens in OpenAppHub, and nothing there (or in OpenBoardApp or OpenCharterApp) asked for the code. So someone with a stolen password still got into everything except the books.

**The fix (core migration `0018_core_auth_hardening.sql`, shared 1.21.0):**

1. **The database enforces it.** If a person has set up an authenticator app, a session signed in with only a password can't see any organization's data. This lives in the central checks every app uses (`is_member`, `has_role`, `app_role`), so it applies everywhere at once.
2. **Every app asks for the code.** A shared `TwoStepGate` screen asks for the 6-digit code whenever it's needed, in all four apps.
3. **Anyone can set it up.** The hub's **Account** page now has **Two-step sign-in**, with a QR code to scan.
4. **Organizations can require it for owners and admins.** **Settings** > **Security** > **Require two-step sign-in for the owner and admins**. To turn it on, you must have signed in with a code yourself, so nobody locks themselves out. People affected see a yellow notice explaining what to do.

Status: **Fixed**, with tests (`db/tests/23_auth.sql`, `shared/ui/TwoStep.test.tsx`).

### A recent sign-in for actions that can't be undone

Deleting an organization, handing over ownership, and deleting an account needed a sign-in from the **last 15 minutes**. Round 3 replaced this with something stronger: [Confirm it's you](#confirm-its-you-right-before-the-action). Status: **Replaced**.

### Only what's needed for visitors who aren't signed in

PostgreSQL lets **everyone** run a new database function unless told otherwise. That meant visitors who weren't signed in could call about ten internal helper functions. Those helpers only did math and couldn't read data, but it's still more than they need.

Now every function is for signed-in people only, except an allow-list: the invitation page, the waitlist, and (on self-hosted installs only) OpenCharterApp's public join page. Each repo runs this cleanup in a migration, and each repo's tests fail if a new function is left open. Status: **Fixed**.

### Security changes are in the audit log

The audit log now also records changes to roles in each app (including **No access**), named roles, the two-step requirement, and email-button settings. These are exactly the changes a SOC 2 auditor asks about. Status: **Fixed**, with a test.

### CI supply chain

| Finding                                                                                                                                 | Status                                                                                                                                  |
| --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| **GitHub Actions pinned by tag.** A tag like `@v5` can be moved to different code by whoever controls it. This has caused real attacks. | **Fixed.** Every action is pinned to an exact commit, with the version in a comment. Dependabot keeps them current.                     |
| **No code scanning.**                                                                                                                   | **Fixed.** CodeQL scans our TypeScript and workflow files on every pull request and every week. It's free because the repos are public. |
| **Secret scanning** is on for OpenAppHub and the docs, but **off** for OpenCharterApp, OpenBoardApp and OpenLedgerApp.                  | **Owner.**                                                                                                                              |
| **No branch protection on any repo.** Anyone with write access could push straight to `main`, skip the tests, or rewrite history.       | **Owner.** This is the most important owner step for SOC 2.                                                                             |

### Telling researchers how to report problems

Every site now has a `/.well-known/security.txt` file. It's a standard file that tells security researchers how to report a problem. There's also a [Security and privacy](https://docs.openapphub.org/hub/help/security/) page in the docs. Status: **Fixed**.

## Round 3: account security, sensitive fields, one place for settings

Round 3 (2026-11-14) followed the owner's requests and kept looking until nothing was left that code could fix. Core migration `0019`, Charter `0019`, Board `0021`, Ledger `0015` and `0016`, shared 1.22.0.

### Confirm it's you, right before the action

Deleting an organization, handing over ownership, deleting an account and changing the recovery email each open a **Confirm it's you** box first. You type your password (people who sign in with Google get a 6-digit code by email instead) and, if you use two-step sign-in, a code from your authenticator app. Then the database makes a **one-time pass**:

- It works **once**, for **that one action**, for **you** only.
- It's made seconds before the action. It also expires after five minutes if it's never used, as a safety net.
- The password is checked by signing in again in the background, with a session that never touches the browser's cookie and is ended straight away.
- Only a scrambled fingerprint (SHA-256) of the pass is stored.

Status: **Fixed**, with tests (`db/tests/23_auth.sql`, `shared/ui/Reauth.test.tsx`).

### Two-step sign-in for everyone

An organization chooses **Not required**, **Required for the owner and admins**, or **Required for everyone**. The owner and admins are always included when it's on. Before saving, it says how many people haven't set it up yet. Status: **Fixed**, with tests.

### A way back in: backup codes and a recovery email

- **Ten backup codes**, made when you set up two-step sign-in. Each works once. Only fingerprints are stored. Making new ones needs a fresh authenticator code. Codes made for an old authenticator stop working when you set up a new one.
- **A recovery email**: a second address, confirmed by a link, that can receive a link to turn two-step sign-in off. Adding or changing it needs **Confirm it's you**.
- Either one turns two-step sign-in off so you can set it up again. You must also know the password. Every step is emailed to your sign-in address (and your recovery address), shown in **Recent security activity** on your account page, and **all your other sessions are signed out**.
- Wrong tries are limited (10 an hour), and so are emails (5 codes and 3 recovery links an hour).
- Turning two-step sign-in off on purpose also asks for a fresh code first.

Status: **Fixed**, with tests (`db/tests/24_account_recovery.sql`).

### Sensitive member fields (encrypted)

An OpenCharterApp admin can mark a member field **Sensitive** (for example a date of birth). Its answers are encrypted before they're saved:

- **How:** AES-256, through PostgreSQL's pgcrypto (OpenPGP format). Every value gets its own random **salt** and its own random session key, and a check that catches tampering. The same answer never encrypts the same way twice.
- **The key** is kept in Supabase Vault, apart from the tables. A backup, a copy of the tables or a leaked export shows only scrambled values.
- **Who can read it:** people who manage members in that organization, and the member themself. Nobody else, whatever the field's other settings.
- **Never** in the member directory, pricing rules or the audit log (which shows "(sensitive)"). Join-page answers are encrypted the moment they're saved.
- **The key can be changed.** `select charter.rotate_field_key();` (Supabase SQL editor) makes a new key and re-encrypts every value in one step; `select charter.forget_old_field_keys();` then deletes old keys, and refuses while any value still needs one. Only the database owner or the service role can run them.
- Turning it on encrypts answers already saved and hides them in earlier audit entries. Turning it off decrypts them.
- A made-up row can't trick the database into decrypting someone else's value: it always reloads the real row first.

Status: **Fixed**, with tests (`opencharterapp/db/tests/9ZJ_sensitive_fields.sql`).

Other columns we checked: the Stripe keys and the email server password were already encrypted (AES-256-GCM, a fresh random value each time). Tokens, codes and links are fingerprints. Member emails, names and notes stay as they are, because encrypting them would break search, sorting and sending email. They're protected by the database's access rules and Supabase's encryption of stored data.

### All security settings in OpenAppHub

Hosted, every security setting lives in OpenAppHub, for every app at once: two-step sign-in, backup codes, the recovery email, recent security activity, deleting your account (**Account**), and who must use two-step sign-in (**Settings** > **Security**). OpenLedgerApp's own "require two-step sign-in" switch is retired: organizations that had it on now have **Required for everyone** (stricter, never weaker). OpenLedgerApp's Security page points to OpenAppHub. Self-hosted, each app shows the same shared screens. Status: **Fixed**.

### Other fixes found while looking

| Finding                                                                                                                                                                                                                       | Status                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **OpenBoardApp took any kind of file**, including web pages and SVG pictures, which can run code when opened.                                                                                                                 | **Fixed.** Documents and pictures only (PDF, Office, OpenDocument, text, CSV, PNG, JPG, GIF, WebP, HEIC), checked by the storage itself, with a plain message if a file is refused.                                                               |
| **Hosted OpenLedgerApp tried to use a server key it doesn't have** for undoing a bank import and recording a backup download, so both failed. (It's good that the key isn't there: the rules say hosted Ledger never has it.) | **Fixed.** Two database functions check the person's permission themselves. Restoring a backup now fills the organization you're in, while its books are empty, in one database step (all or nothing), with no key needed, hosted or self-hosted. |
| Emails with codes or links kept them in the outbox after sending.                                                                                                                                                             | **Fixed.** Removed once sent.                                                                                                                                                                                                                     |
| Live check of every site: HTTPS-only (HSTS), content rules, no framing, camera and microphone off, window isolation.                                                                                                          | OK                                                                                                                                                                                                                                                |
| Storage buckets are private; dependency audits are clean.                                                                                                                                                                     | OK                                                                                                                                                                                                                                                |

### Self-hosted recovery

Self-hosted OpenCharterApp, OpenBoardApp and OpenLedgerApp each have two-step settings, backup codes, a recovery email, **Recent security activity** and a "Can't use your authenticator app?" page, like OpenAppHub. The steps are shared (`shared/security/server.ts`). Each app's own mail server sends its security emails (the database functions take the app's name), and their links open that app. The self-hosted server's service-role key is used only to remove a lost authenticator after the database accepted a backup code or link, and to sign out the person's other sessions. Status: **Fixed**, with tests (`shared/security/server.test.ts`).

### What code can't do (left for the owner or later)

| Item                                                                                                                                       | Why                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| Turning two-step sign-in off needs a fresh code **on our screens**, but Supabase's own interface only asks for a session that used a code. | Supabase decides this. Our screens ask anyway, and every removal through recovery is emailed. |
| Content Security Policy with nonces.                                                                                                       | A framework change (see below).                                                               |

---

## Round 4: table rights, sign-out, the docs site (2026-11-14)

Asked for: "Perform another security and docs review." What we checked, and what we found.

### Checked and fine

- **Dependencies:** `npm audit` / `bun audit` in all five repositories: no known vulnerabilities.
- **Secrets in the code:** none (a scan for Stripe, Supabase, Resend, AWS, Slack and private keys).
  `.env.production.local` files are ignored by git, never committed.
- **CI:** no `pull_request_target` or `workflow_run` triggers, no untrusted text (pull request
  titles, branch names, comments) inside shell commands, every workflow sets its permissions, and
  every third-party action is pinned to a commit.
- **Database (staging):** row security on every table in every schema the API reaches; no public
  storage bucket; only three functions run for visitors who aren't signed in. Two are ours, as
  intended (`get_invitation` masks the email address, `hub_join_waitlist` is rate-limited); the
  third, `rls_auto_enable`, is Supabase's own event trigger and can't be called.
- **Recovery (core 0019):** the server removes an authenticator only after the database, running as
  the signed-in person, accepted a backup code or link; the person is read from a token Supabase
  verifies, and every other session is signed out.
- **Redirects after sign-in:** `safeNext` (hub) and `safeRedirect` (apps) follow only our own sites.
- **Security headers** on the staging sites: all present (HSTS, CSP, COOP, frame and type options).

### Found and fixed

| Finding                                                                                                                                                                                                                                                            | Fix                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The API roles held TRUNCATE, REFERENCES, TRIGGER and MAINTAIN on 25 tables in `public`, from Supabase's default privileges. Row security doesn't cover these (TRUNCATE empties a table whatever its policies). The API can't send them, so nothing could use them. | Core `0020_core_table_privileges.sql` takes them away from every table in `public`, `hub` and `billing`, and from tables created later. Test: `db/tests/25_table_privileges.sql`. |
| A stale sign-in cookie on `.openapphub.org` (staging's old cookie domain) kept someone signed in after signing out (owner report).                                                                                                                                 | Shared 1.23.1 and 1.23.2: `dropStaleSession` removes this project's sign-in cookies on any other domain, in the hub and in each app's own client.                                 |
| The docs site (docs.openapphub.org) sent no HSTS, Content Security Policy, COOP or Permissions-Policy.                                                                                                                                                             | `public/_headers` in the docs repository adds all four. The CSP was tested against the built site, search included.                                                               |
| The hub's recovery and recovery-email pages put the token into the sign-in link without encoding it. Not exploitable (the link stays on our site), but sloppy.                                                                                                     | Encoded.                                                                                                                                                                          |

### For the owner

- **Production is behind staging.** `openapphub.org` doesn't send HSTS, COOP or Permissions-Policy yet,
  and production has none of rounds 2 to 4. They arrive when staging is merged into `main` (your
  approval).
- **Cloudflare Web Analytics** is switched on for the staging sites: Cloudflare adds its script to every
  page, and our Content Security Policy blocks it, so it collects nothing and only fills the browser
  console with warnings. Switch it off in Cloudflare (Analytics & Logs → Web Analytics), or tell us to
  allow it and mention it in the privacy policy.
- **The Privacy Policy page is a placeholder.** It needs the final text before launch.
- **Staging previews get the staging session.** Every branch preview of an app is served under the
  staging domain (for example `<branch>.charter.staging.openapphub.org`), with staging settings, so it
  can read a staging session cookie. Only people with write access to the repositories (and
  Dependabot) can create a branch, and previews never receive the production cookie or reach
  production data, so we accept it.

## Round 5: email limits, analytics on production only (2026-11-15)

Asked for: "Perform another security review. Only want web analytics on the production branch."

### Found and fixed

| Finding                                                                                                                                                                                                                              | Fix                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core 0017 limits invitations per organization (100 an hour, 500 a day), but anyone can sign up and create several organizations, and each invitation emails any address. A script could send a lot of mail from our domain that way. | Core `0021_core_send_limits.sql`: at most 200 emailed invitations a day per person, across all their organizations. Link-only invitations send nothing and don't count.                                                                                                                                                                                                                                                                                  |
| Changing the recovery email sends a confirmation link to the new address, with only a password check each time.                                                                                                                      | Core `0021`: at most 5 recovery email changes a day per person. Test: `db/tests/26_send_limits.sql`.                                                                                                                                                                                                                                                                                                                                                     |
| Hosted OpenLedgerApp showed **Remove** and **Leave** on its members page. Both need the service role, which hosted Charter, Board and Ledger never have, so they could only fail.                                                    | Hidden on hosted; the page points to OpenAppHub's Members page instead, where removing and leaving work for every app.                                                                                                                                                                                                                                                                                                                                   |
| Cloudflare Web Analytics was injected into every page on openapphub.org, staging included (the CSP blocked it, so it collected nothing anywhere).                                                                                    | Cloudflare's automatic injection is off. Production builds add the script themselves: `VITE_CF_ANALYTICS_TOKEN` is set only in each wrangler.jsonc's production `vars` (shared 1.24.0, `shared/analytics.ts`), and the docs site adds it only when Workers Builds builds `main` (`WORKERS_CI_BRANCH`). Production's CSP allows exactly the script and its reporting endpoint; staging's doesn't change. Cookie policy and the docs' Cookies page say so. |

### Checked and fine

- Every server use of the service role: the hub's invitations, account deletion, recovery and billing
  webhook check the person and their rights first; the apps use it only for self-hosted email,
  self-hosted recovery and Ledger's self-hosted member removal.
- Every database function that queues email: none can be called directly by a person.
- The existing limits: confirm-it's-you codes (5 an hour), recovery links (3 an hour), backup codes
  and links (10 wrong tries an hour), invitations per organization, the waitlist.
- Only the hub's Workers hold secrets (Cloudflare lists none for Charter, Board or Ledger).

### For the owner

- **Charter's online payments on hosted.** Members paying dues by card (each organization's own
  Stripe) needs the service role and `GATEWAY_ENCRYPTION_KEY` on the Charter Worker, which hosted
  Charter doesn't have, by design. Either give the Charter Worker those two secrets (simple; it then
  holds the service role, like the hub), or we move those steps into database functions so it
  doesn't need them (more work, keeps the rule "only the hub holds the service role"). Recommended:
  the second, before Stripe goes live (it already waits on the legal entity and EIN).

## OWASP Top 10:2025 review (2026-11-15)

Asked for: review the suite against the [OWASP Top 10 2025](https://github.com/OWASP/Top10/tree/master/2025) (A01–A10), using each category's "How to prevent" list.

| 2025 category                                  | Where we stand                                                                                                                                                                                                                                                                                                                                                                                            | Fixed in this review                                                                                                                                                                                                                                                  |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A01 Broken Access Control**                  | Deny by default (row security on every table, core 0017/0020); one access model (`has_role`, `app_role`) reused everywhere; record ownership in policies; access tests in every repo's `db/tests`; no CORS headers anywhere; no `.git`, `.env`, config or source maps served (checked on every staging site); short-lived Supabase JWTs with refresh tokens; global sign-out on logout.                   | —                                                                                                                                                                                                                                                                     |
| **A02 Security Misconfiguration**              | Same setup for staging and production from one wrangler.jsonc each; security headers everywhere (CSP, HSTS, COOP, frame and type options, Permissions-Policy); private storage buckets; generic error pages; no secrets in code.                                                                                                                                                                          | —                                                                                                                                                                                                                                                                     |
| **A03 Software Supply Chain Failures**         | Lockfiles; Dependabot version updates; every CI action pinned to a commit; dependency audits in the apps' CI; staging before production.                                                                                                                                                                                                                                                                  | `npm audit` (high or critical, shipped packages) added to the hub's and the docs' CI. **Owner:** turn on GitHub's **Dependency graph** for each repo: it gives an SBOM export (Insights → Dependency graph → Export SBOM) and Dependabot security alerts.             |
| **A04 Cryptographic Failures**                 | Sensitive member fields encrypted (AES-256, key in Vault, rotation); codes and tokens stored as SHA-256 of random values; passwords hashed by Supabase (bcrypt); HSTS.                                                                                                                                                                                                                                    | Cloudflare now refuses TLS older than 1.2 and always redirects to HTTPS (zone openapphub.org). Every page a Worker renders now says `Cache-Control: private, no-store`, so no browser or proxy keeps a copy of personal pages.                                        |
| **A05 Injection**                              | Parameterised queries through PostgREST; no dynamic SQL from user input (round 1); React escapes output; email templates escape.                                                                                                                                                                                                                                                                          | —                                                                                                                                                                                                                                                                     |
| **A06 Insecure Design**                        | Tenants separated in every table and test; misuse cases tested (lockouts, limits, cross-organization access).                                                                                                                                                                                                                                                                                             | —                                                                                                                                                                                                                                                                     |
| **A07 Authentication Failures**                | Supabase Auth (premade, well-tested); two-step sign-in with org-level requirements; confirm-it's-you before dangerous actions; generic sign-in errors; sign-up and password reset don't reveal whether an account exists (email confirmation on). **Owner:** turn on **leaked password protection** in Supabase (checks new passwords against Have I Been Pwned) and set a minimum length of at least 12. | —                                                                                                                                                                                                                                                                     |
| **A08 Software or Data Integrity Failures**    | Signed email action links (HMAC); Stripe webhooks verified; changes through pull requests and CI. **Owner:** branch protection (section 2 below).                                                                                                                                                                                                                                                         | —                                                                                                                                                                                                                                                                     |
| **A09 Security Logging and Alerting Failures** | Append-only audit logs in every app; account security activity; failed recovery tries recorded.                                                                                                                                                                                                                                                                                                           | Core `0023`: when recovery locks (10 wrong backup codes or links in an hour, which needs the person's password), the person is emailed at once (`recovery_locked`) and it's recorded. **Owner:** Cloudflare and Supabase alerts to an operations address (section 5). |
| **A10 Mishandling of Exceptional Conditions**  | A global error handler in every Worker returns a generic message; database work is all-or-nothing (functions and `audited_write` roll back on any error); limits on codes, links, invitations and recovery emails.                                                                                                                                                                                        | Core `0022`: at most 20 new organizations a day per person ("nothing should be limitless"). Chapters, seeds and server tasks aren't limited.                                                                                                                          |

Tests: `db/tests/27_org_limit.sql`, `db/tests/28_security_alerts.sql`, and no-cache tests in each repo's `security-headers.test.ts`.

## What the owner needs to do

These are settings in dashboards. We can't change them from the code. They're in order of importance.

### 1. Protect your own accounts (do this first)

Turn on two-step sign-in for **your own** accounts at:

- GitHub
- Supabase
- Cloudflare
- Stripe
- Resend
- your domain registrar

Anyone who gets into one of these could change the whole suite. This matters more than anything else on this list.

### 2. GitHub: branch protection

In each of the five repositories, go to **Settings** > **Rules** > **Rulesets** > **New branch ruleset**. Make one ruleset for `main` and `staging` with:

- **Restrict deletions**: on.
- **Block force pushes**: on.
- **Require a pull request before merging**: on.
- **Require status checks to pass**: on. Choose the CI checks.

### 3. GitHub: security features

In each repository, under **Settings** > **Code security**, turn on:

- **Dependabot alerts** and **Dependabot security updates**;
- **Secret scanning** and **Push protection** (needed for OpenCharterApp, OpenBoardApp and OpenLedgerApp);
- **Code scanning** results will appear on their own once the CodeQL workflow runs.

### 4. Supabase (production project)

Under **Authentication**:

- **Leaked password protection:** on (Passwords).
- **Minimum password length:** 8 or more.
- **Confirm email:** on.
- **URL configuration:** allow only `openapphub.org` and the app domains as redirect addresses.
- **Multi-factor:** TOTP is enabled on production and staging (done, 2026-11-14).
- **Sessions:** consider a time limit, like signing people out after 7 days of no use.

Under **Database**:

- **Enforce SSL:** on.
- **Point-in-time recovery (backups you can roll back to any minute):** turn it on if your plan allows. It's the best protection against mistakes.

### 5. Cloudflare

- Turn on the **WAF managed rules** (a firewall that blocks common attacks).
- Send **alerts** for Worker errors to an operations email address.
- Switch off **Web Analytics** for the sites (round 4): our Content Security Policy blocks its script anyway.

### 6. A security email address

Our `security.txt` and docs use support@openapphub.org for reports today. A separate **security@openapphub.org** is better. If you create it, we'll update those files.

---

## Still on the list (not urgent)

| Item                                                                        | Why it isn't done yet                                                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **Content Security Policy with nonces** instead of allowing inline scripts. | Needs a change to how our framework renders pages. The other protections cover the risk for now.   |
| **CAPTCHA on sign-up** (for example Cloudflare Turnstile through Supabase). | Sign-ups are closed until launch. Turn it on before opening sign-ups to the public.                |
| **Two-step sign-in by text message or security keys.**                      | Authenticator apps and backup codes cover it today. Text messages cost money and are weaker.       |
| **Rate limits on our own server pages.**                                    | Supabase already limits sign-in attempts. Cloudflare's rate limiting can add more if we see abuse. |

---

## For the SOC 2 audit later

This document, [`review-notes.md`](review-notes.md), the CI history, each repo's database tests for access rules (`db/tests`), and the audit logs are evidence for:

- **CC6** (access): who can see and change what;
- **CC7** (operations and monitoring): logs, alerts and vulnerability scanning;
- **CC8** (change management): pull requests, tests and branch protection.

SOC 2 will also need things that aren't code. These include written policies (how we review access, respond to incidents, and choose vendors like Supabase, Cloudflare, Stripe and Resend), a yearly risk assessment, and proof that we follow those policies.
