# Security and release-readiness review (MVP 0.1.0)

Status on 2026-11-02, for branch `BoardUpdates` with migrations `0000`–`0034`. Covers the Wave A release-hardening items R1 (security), R2 (accessibility), R3 (checks), R6 (performance) and R7 (monitoring) from `docs/plans/wave-a-mvp.md` §5. Decisions D-180..D-183. Re-run the checks in §6 before each release and update this page.

**Verdict: no blocking findings.** Three follow-ups are scheduled after 0.1.0 (§1.6), and two items need the owner (§5).

## 1. Security (R1)

### 1.1 Tenant isolation

Checked against a database built from every migration (the `test:db` setup):

- **All 31 tables in `public` have row-level security on.** 28 of them have `org_id`. The other three are the organizations themselves and the global permission catalogue (`permissions`, `role_permissions`), which can be read but not written through the API.
- **Reads** go through `is_org_member` / `has_permission`, which inherit downward only (D-032). A chapter admin asking for a sibling chapter gets nothing back. This is tested in `db/tests/10_tenant_isolation.sql` and in each feature's tests: 9E roll-ups, 9K payments export, 9L home chapter, 9M standing and levels, 9N roll-up performance.
- **Writes** to sensitive tables go only through `security definer` functions that check permission first. Only two tables have a DELETE policy, and both deletes are intended: `org_settings` (managers remove an override) and `member_segments` (saved views). No history, payment, receipt, term, appointment, pricing-rule or chapter-history table can be deleted from the API. `audit_events` has no write grant or policy at all; triggers and definer functions write it.
- **Member records** (`org_member_profiles`) have no insert policy. A member can't create a record in a chapter or point one at someone else's national membership (`home_of`). Records are created by invitation, joining or an admin, all through definer functions.

- **No open read rules (D-207, D-208; migrations 0042, 0043).** A later pass found three read rules that let more through than needed. The permission catalogue is now readable only by signed-in people who hold at least one role, role permissions only for roles the reader can see, and logos in the private `branding` bucket only by signed-in people who can see that organization's tree. `db/tests/9T_no_open_read_rules.sql` fails if a rule that lets every row through comes back.

### 1.2 Definer functions

There are 129 `security definer` functions in `public`. A scripted pass checked each one. Each falls into one of these groups:

- **It checks the caller first.** `auth.uid()` together with `has_permission`, `is_org_member` or `is_platform_operator`. Examples: `create_demo_organization` and `delete_demo_organization` need a platform operator; `export_payments` needs `payments.view`; `chapter_national_standing` needs `members.view`.
- **It is a trigger.** Triggers can't be called through the API.
- **It is an internal helper revoked from API roles,** such as `profile_membership_id`, `listed_in_directory`, `linked_price` and `sync_linked_level`.
- **It is deliberately callable without signing in,** and these are the only two since migration 0037 (four before):
  - `public_join_info` and `public_home_chapter_info`. These return only what a public join page shows: name, levels and prices, required questions, and chapters to pick from.
  - `has_permission` and `is_org_member`. These answer yes or no for a given user and org. Low severity: someone could probe whether a user ID belongs to an org, but user IDs are random UUIDs that aren't published. **F1 done (migration 0037, D-195):** both are revoked from `anon`; no table is readable without signing in, so no policy is affected (`db/tests/9P_ready_for_real_use.sql`).

Every definer function sets `search_path = public`, which prevents search-path hijacking.

### 1.3 Session flags

Linked levels (A4, D-177) can only be changed while the database session flag `app.level_link` is set. Only `sync_linked_level`, `adopt_suggested_level`, `set_linked_level_price` and `make_level_own` set it, and they restore the previous value. A client could set the flag itself with `set_config`, but that only gets past the "linked levels can't be edited directly" guard. The caller still needs `membership.manage` on that org under RLS, so all they could do is edit their own chapter's linked level by hand. Accepted: the guard keeps honest clients consistent and is not a security boundary.

### 1.4 Credentials and payments

- Each org's Stripe keys and webhook secrets are sealed with `GATEWAY_ENCRYPTION_KEY` and stored in `private.gateway_secrets`. The `private` schema is not exposed through the API, and only `service_role` can use it. Server functions unseal them on the server only, and the browser never sees them.
- Webhooks are verified with the org's signing secret before anything is recorded. Already-handled events (`webhook_events`, unique per gateway event) are ignored, so replaying an event does nothing.
- Return links after paying use the app's public address (D-158). An address taken from the browser or the proxy is used only if it's on the allowlist (`PUBLIC_APP_URL`, `PUBLIC_APP_ALLOWED_ORIGINS`, the request's own origin, localhost), so a caller can't send payers back to a site they control (`src/modules/payments/origin.ts`). Payments are also confirmed from the return page by asking Stripe, so a forged return URL can't mark a payment paid.
- No secrets are in the repository. `.env` only holds the publishable Supabase key.

### 1.5 Exports and audit

- Member exports and payment exports write their audit event inside the same database call that returns the rows (`log_member_export`, `export_payments`), so there is no export without a log entry.
- Payment exports include emails only where the exporter may see that org's members (D-173). Member exports follow each org's directory rules (D-139, D-179).
- CSV cells that start with `=`, `+`, `-` or `@` are escaped, so a spreadsheet won't run them as formulas.
- Viewing an individual ballot (Wave E, not in the MVP) will be audited (D-163).

### 1.6 Dependencies

`bun audit` on 2026-11-02 reported 29 advisories (1 critical, 14 high, 13 moderate, 1 low). **After the dependency refresh the same day (D-187), 2 moderate remain**, both transitive in development tooling: `esbuild` (through drizzle-kit and the router plugin; affects only a running dev server) and `minimatch` (through ESLint). They clear when those packages update. The table records the original findings:

| Where                                           | Packages                                                                                                                                    | Risk to us                                                                                                                                                                                                 | Action                                                                                                                                   |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Lint, format, build and dev-server tooling only | `shell-quote` (critical), `brace-expansion`, `js-yaml`, `minimatch`, `launch-editor`, `nanoid`, `source-map-js`, `esbuild`, `vite` 8.1.5    | None in production: none of these ship in the built site. The dev-server ones matter only when running `bun run dev` on an untrusted network                                                               | Fixed by the refresh (D-187), except `esbuild` and `minimatch` above                                                                     |
| Runtime: server-side rendering                  | `seroval` 1.6.8 (through `@tanstack/react-start` 1.168.60)                                                                                  | Moderate. The advisories need attacker-made RegExps or typed arrays in data the server serialises; we serialise query results (strings, numbers, dates)                                                    | **F2 done (2026-11-02):** TanStack Start 1.169.4 brings `seroval` 1.7.6                                                                  |
| Test browser                                    | Playwright 1.64.1 bundles Chromium 156.0.8078.4, behind Chrome stable's late-October security fixes; Playwright's sandbox is off by default | Low for us: tests visit only our own app and backend                                                                                                                                                       | Pinned at 1.64.1 by the owner and hardened (D-186): sandbox on, CI on Google Chrome stable, an origin guard that blocks every other host |
| Runtime: form validation                        | `zod` 3.25.76 (fixed only in 4.6.6)                                                                                                         | Low. The advisory is about memory use when validating oversized constrained collections; our schemas cap lists (for example, at most 10 conditions per pricing rule), and the database rechecks everything | **F3 done (2026-11-02):** zod 4.6.7 with `@hookform/resolvers` 7 (D-187)                                                                 |

### 1.7 Security headers (D-219)

Every rendered page gets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: DENY` and a Content-Security-Policy from the server entry (`src/lib/security-headers.ts`, spec §10.1). The CSP allows the app, its Supabase project (API, websocket, storage images) and Google Fonts only; `frame-ancestors 'none'`, `object-src 'none'`, `base-uri` and `form-action` `'self'`. It still allows `'unsafe-inline'` scripts and styles (TanStack Start's inline hydration scripts); per-request nonces are a later hardening step.

## 2. Accessibility (R2)

- **Automated** in `e2e/a11y.spec.ts`, as National, Chapter and Member, on the dashboard and every main screen (Overview, Members or Directory, Board, Reports, Chapters, Settings, Levels, Payments):
  - every button, link, field, combobox, checkbox, switch, radio, tab and menu item has an accessible name (WCAG 4.1.2, 1.3.1)
  - each page has one main heading and a language (2.4.6, 3.1.1)
  - sign-in works by keyboard alone, with a visible focus ring (2.1.1, 2.4.7)
  - **Result: all pass.**
- **By design:** the components are Radix-based (shadcn/ui), with keyboard support, focus trapping in dialogs and ARIA roles built in. Dialogs have titles. Toasts are announced. Tables use real `th` headers.
- **By hand** (`docs/user-testing.md` §16), before release:
  - colour contrast in light and dark themes
  - every flow at 200% zoom and phone width
  - a screen-reader pass of join and checkout

## 3. Checks before code lands (R3)

- **Pre-commit hook** (`.githooks/pre-commit`; install once with `bun run hooks:install`). It runs:
  - lint
  - formatting
  - types
  - migration rules
  - unit tests related to staged files
- **"Docs check" job in CI** for pull requests: code or migration changes need a docs or test change, or the label `no-docs-needed` (D-182).
- Database tests, build and end-to-end tests stay in CI.

## 4. Performance with a large roster (R6)

`bun run test:perf` (needs `TEST_DATABASE_URL`, like `test:db`) seeds a national with 20 chapters and 5,000 members, each with a membership and a payment, then times the heavy reads as the national admin. Budget: under 1 second each (D-181). Since D-209 it then grows the same roster to 10,000 and 20,000 members (250 per chapter) and times them again; results at the end of this section.

| Read                                                          | Before   | After 0034 |
| ------------------------------------------------------------- | -------- | ---------- |
| Overview numbers (`org_overview_stats`)                       | 1,050 ms | 156 ms     |
| Reports: members by chapter (`org_rollup_members`)            | 1,347 ms | 77 ms      |
| Reports: revenue by chapter (`org_rollup_revenue`)            | 5 ms     | 5 ms       |
| Members "everyone" view (profiles plus memberships under RLS) | 428 ms   | 372 ms     |
| Directory of one chapter (`member_directory`)                 | 129 ms   | 8 ms       |
| Payments export across the tree (`export_payments`)           | 68 ms    | 69 ms      |

Laptop-class Postgres 16; the hosted database will differ, but the ratios hold. Two fixes came out of this:

- **Inherited settings resolved per row.** Grace days, and the directory's listed-by-default setting, were resolved once for every member row. Migration 0034 resolves them once per organization; `db/tests/9N_rollup_performance.sql` checks that each membership still uses its own org's grace days.
- **Lists truncated at 1,000 rows.** The API returns at most 1,000 rows per request, so a single chapter's Members page, the directory and the payments export would have stopped at 1,000. All three now read every page, like the "everyone" view already did (`src/lib/db/pages.ts`). A very large payments export writes one audit event per 1,000 rows.

**At 10,000 and 20,000 members (D-209).** Times in ms, laptop-class Postgres 16:

| Read                        | 5,000 | 10,000 before 0044 | 10,000 | 20,000 before 0044 | 20,000 |
| --------------------------- | ----- | ------------------ | ------ | ------------------ | ------ |
| Overview numbers            | 70    | 192                | 166    | 979                | 284    |
| Reports: members by chapter | 64    | 131                | 118    | 286                | 234    |
| Reports: revenue by chapter | 4     | 7                  | 5      | 8                  | 7      |
| Members "everyone" view     | 91    | 1,188              | 172    | over budget        | 381    |
| Directory of one chapter    | 6     | 13                 | 6      | 13                 | 10     |
| Payments export             | 59    | 121                | 121    | 258                | 245    |

After 0044 every read grows in step with the roster and stays well under the 1 second budget at 20,000. The two fixes:

- **A missing index.** `memberships` was indexed on `(org_id, profile_id)` but not on `profile_id` alone, so finding each member's membership read the whole index once per member: twice the members took about three times as long. 0044 indexes the foreign keys of every table that grows with the roster (memberships, member records, payments, receipts, membership events, chapter changes, webhook events, role assignments, appointments); `9U_scale_indexes` fails if a new one is added without an index.
- **JIT compilation.** At 20,000 members the planner's cost estimate for the Overview crossed Postgres's JIT thresholds, and compiling took about 700 ms of the read. JIT is off for the six heavy report functions (overview, both roll-ups, payments export, directory, audit log). Supabase leaves JIT on by default, so this matters on the hosted database too.

## 5. Monitoring (R7) and owner actions

- **Errors:** since D-219 the old error reporting is gone. Unexpected server errors are logged with `console.error` (`src/lib/error-capture.ts`, `src/server.ts`) and show in the Worker's logs (Cloudflare → Workers → `opencharterapp` → Logs; turn on Workers Logs). Browser errors are logged to the console only. Owner: turn on Workers Logs for both Workers; an error-reporting service can be added later.
- **Failed payments** show as "Failed" on Settings → Payments.
- **Webhook rejections** (a wrong signing secret) aren't stored, because we can't trust the request. They show in the Stripe dashboard under the webhook endpoint's deliveries. Owner: after connecting Stripe, send a test event and check for "Succeeded" (`user-testing.md` §10). An admin-visible "last webhook received" line is a candidate for Wave B.
- **A1, live Stripe test-mode check (owner action):** needs a Stripe test account. On a non-demo test org, connect a test key and webhook, then join, return, refund, and decline with refund, following `user-testing.md` §10.
- **License file (maintainer action):** the repository has no `LICENSE` yet (R-24). Add the official AGPL-3.0 text before the release; it's on the release checklist.
- **R4, receipt wording (owner action):** a CPA should review the wording (R-07). If this isn't done by release, 0.1.0 ships the current placeholder wording and the release notes say so.

## 6. Re-running this review

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bun run test:db
```

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bun run test:perf
```

```bash
bun audit
```

```bash
bun run test:e2e
```

`test:perf` also prints the catalogue checks from §1.1 and §1.2 (tables without RLS, DELETE policies, definer functions callable without signing in); compare them with the expectations printed alongside.
