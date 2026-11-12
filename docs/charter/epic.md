> **Superseded (2026-11-12):** the suite has one roadmap, [`docs/ROADMAP.md`](../ROADMAP.md), where this app's items are renumbered (Charter `E-` → `C-`). This file is kept for its history and context; don't update it.

# Epic Map

High-level roadmap. Epics become backlog epics. Stories are written when an epic is pulled into planning. Epic IDs (`E-xx`) are stable. Phases can be reordered when dependencies allow.

## 0. Suite migration: what's left

What's left for the OpenAppHub suite migration to be "done". The same items (S-xx) are tracked in every app's `docs/epic.md`. Status: ✅ done, 🟡 done with follow-ups, 🟠 partly done, ⬜ not started.

| ID        | Item                                    | What "done" means                                                                                                                                                                                                                                                                                                                              | Status (2026-11-11)                                                                                                                                           |
| --------- | --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S-01      | Production check                        | After each production deploy, open the app on openapphub.org as a real organization and confirm its data loads (the Charter Members tab was empty until 2026-11-11 because of a renamed key). The staging end-to-end tests catch most of this first.                                                                                           | 🟡 Members fix merged with this round; production not yet checked by a person                                                                                 |
| S-02      | Exposed schemas                         | `charter`, `board` and `ledger` in Supabase → Data API → Exposed schemas, on staging and production (owner).                                                                                                                                                                                                                                   | ✅ 2026-11-11                                                                                                                                                 |
| S-03      | Integration views for the hub           | Read-only `api_*` views (`security_invoker`) and `docs/INTEGRATION.md`, so OpenAppHub's dashboard can show a summary per app (SHARED-SPEC §6).                                                                                                                                                                                                 | ✅ 2026-11-12 (staging): migration `0002_integration_views.sql`, tests and `docs/INTEGRATION.md`; the owner applies it with `migrate.yml`                     |
| S-04      | Help links                              | A per-page help map (`src/config/help.ts`) pointing at the docs site; today the shell has one Help link for the whole app.                                                                                                                                                                                                                     | ✅ 2026-11-11: `src/config/help.ts`; the Help link opens the docs page for the current screen                                                                 |
| S-05      | Read-only when billing lapses           | The database already refuses writes when an organization's trial or plan has lapsed; the screens should show it (billing banner) and switch write controls off.                                                                                                                                                                                | ✅ 2026-11-11 (PR): write controls off while the plan makes the app read-only; reading and exports stay on (shared 1.6.0 `isReadOnly`)                        |
| S-06      | Export everything                       | Owners and admins can export all of the app's data (CSV and JSON or the app's own format), also while read-only.                                                                                                                                                                                                                               | ✅ 2026-11-11 (PR): Settings → General → Export everything (zip: CSV per table and JSON; works read-only)                                                     |
| S-07      | Old build tooling                       | Remove what only the old editor needed: its Vite config wrapper, preview sign-in storage, error reporting, its project folder and the old `supabase/` folder.                                                                                                                                                                                  | ✅ removed                                                                                                                                                    |
| S-08      | Worker secrets                          | Secrets the hosted app needs, on the production Worker and in the Preview base config for staging (owner; never in the repository).                                                                                                                                                                                                            | ⬜ `SUPABASE_SERVICE_ROLE_KEY` and `GATEWAY_ENCRYPTION_KEY` for payments, production and previews                                                             |
| S-09      | End-to-end tests                        | Playwright on a local dev server against staging and the suite demo, in CI on every pull request and daily.                                                                                                                                                                                                                                    | ✅ 2026-11-11 (`live.yml`, 17 tests and the API smoke test)                                                                                                   |
| S-10      | Retire the old projects                 | The old editor and Supabase projects, once the app has run on the shared projects for a while (owner).                                                                                                                                                                                                                                         | ✅ 2026-11-12 (owner)                                                                                                                                         |
| S-11      | One look across the suite               | Same shell, menus and settings pattern as the other apps; differences found are listed under Known issues.                                                                                                                                                                                                                                     | ✅ shared AppShell; see Known issues; one logo family (shared 1.5.0)                                                                                          |
| S-12      | Data between apps (groundwork)          | Apps exchange data only through documented read-only `api_*` views (to read) and `security invoker` RPCs (to cause a change in the owning app), as SHARED-SPEC §3.6 says. Each app lists what it offers and consumes in `docs/INTEGRATION.md`; the hub and every app feature-detect, so self-hosted single apps keep working.                  | ✅ 2026-11-12 (staging): offers and uses listed in `docs/INTEGRATION.md`; one documented exception, the S-14 sync functions                                   |
| S-13      | Reports into a board package            | From a report (Board's own, Charter's reports, Ledger's financial reports), "Add to a board package" picks an upcoming scheduled meeting in OpenBoardApp and attaches the report (PDF) to that meeting's packet. Needs a Board RPC to add a packet item and a document from another app.                                                       | ✅ 2026-11-12 (staging): Reports → "Add to a board package" (the reports as one PDF); Board side is `board.add_report_to_meeting`                             |
| S-14      | Board members in sync (Charter ⇄ Board) | Appointing, ending or changing a board member or officer in OpenCharterApp shows in OpenBoardApp's members and terms, and the other way round, for organizations that use both. Decide which app owns the record (likely Charter's seats when it's in use), how conflicts resolve, and what the audit logs record.                             | ✅ 2026-11-12 (staging): Charter owns the top unit's officers; migration `0005_board_sync.sql` mirrors them into Board's terms and takes Board's changes back |
| S-15      | Tasks on the hub dashboard              | The hub's dashboard lists each person's open work from every app under one heading ("Tasks", name to confirm): Board's action items assigned to them, and Charter's tasks (join requests to review, vacant required seats, renewals to follow up, setup steps). Each app publishes its own as an `api_*` view; the hub links back to the item. | ✅ 2026-11-12 (staging): `charter.api_tasks` (join requests, vacant required seats, renewals due) and `api_member_summary`, migration `0004_tasks_view.sql`   |
| S-16      | Email                                   | One way to send email for every app: an outbox, Resend when hosted (sent by the hub), the organization's own SMTP server when self-hosted, email choices and unsubscribe links.                                                                                                                                                                | ✅ 2026-11-12 (staging): Account → Email (choices; self-hosted: SMTP server and a test email)                                                                 |
| S-17–S-23 | Next suite epics                        | Task digest, Charter payments into Ledger, finishing tasks from the hub, scheduled board packages, committees in sync, a production check, election results into terms: the hub's `docs/ROADMAP.md`.                                                                                                                                           | ⬜                                                                                                                                                            |
| S-24      | Chapters on OpenBoardApp                | A chapter runs its board in OpenBoardApp when its national allows it: its own organization under the national's, covered by the national's plan, officers synced like the national's.                                                                                                                                                          | ✅ 2026-11-12 (staging): migration 0006; Board settings → Chapters on OpenBoardApp; a chapter's Board page                                                    |

Charter-only follow-ups (2026-11-11):

- `charter.purge_smoke_data` still names the retired Demo National ids; it should follow the suite demo or be removed (a migration).
- The end-to-end tests for chapters, regions and two-level dues were retired with Demo National; they need a national demo with chapters (a second demo organization in the suite seed).
- On the Account page the organization switcher reads "No organization": Charter only knows the current organization on an organization's own pages. Board and Ledger show it everywhere.

## 0b. Chapters on OpenBoardApp (S-24, 2026-11-12, PR)

A chapter can use OpenBoardApp for its own board if its national allows it (Board settings → Chapters on OpenBoardApp: off, approval (default) or open). The chapter's admins ask on its Board page; the national approves or declines, with emails both ways. Approved chapters get their own organization (core 0006) under the national's, covered by the national's plan, and their officers sync like the national's (S-14). Migration `0006_chapter_board.sql`; `docs/INTEGRATION.md`.

## 0c. Smaller changes (2026-11-12)

- Creating a chapter: the web address fills in from the name, can be changed, and turns red with "That web address is taken" when another organization has it (migration `0007_slug_available.sql`).
- Setup offers the Rank and Branch starter fields only to 501(c)(19) veterans organizations.
- The suite demo has a second account for nationals (`docs/demo-data.md`).

## 0a. Next (proposed 2026-11-12)

Proposed, not scheduled; the whole suite's plan is in the hub's [`docs/ROADMAP.md`](https://github.com/Nox-Mob/OpenAppHub/blob/staging/docs/ROADMAP.md). Suite epics that touch this app: S-16 email from the Worker, S-17 task digest, S-18 Charter payments into Ledger (`charter.api_payments`), S-20 board package on a schedule, S-21 committees in sync, S-23 election results into Board terms.

Recommended order of Charter's own epics:

1. E-08 jobs, email and notifications (with S-16), which finishes E-13's lapse notices and reminders
2. E-25 governance compliance: vacancy alerts and good-standing checks into the hub's tasks; board reports to Board through S-13
3. E-27 elections, then S-23
4. E-34 donations, with S-18
5. E-39 communications, on S-16
6. E-20 postpaid dues and E-21 PayPal
7. Later: E-26 documents (or Board's library through an RPC), E-24 approvals, awards (E-29 to E-33), events (E-37)

## 1. Roadmap at a glance

```mermaid
flowchart LR
    P0[Phase 0<br/>Foundation] --> P1[Phase 1<br/>Membership MVP]
    P1 --> P2[Phase 2<br/>Chapters at scale]
    P2 --> P3[Phase 3<br/>Governance and documents]
    P3 --> P4[Phase 4<br/>Awards]
    P2 --> P5[Phase 5<br/>Donations and fundraising]
    P5 --> P6[Phase 6<br/>Events]
    P2 --> P7[Phase 7<br/>Corporate memberships]
    P6 --> P8[Phase 8<br/>Comms and polish]
    P4 --> P8
    P7 --> P8
```

> **Diagram description:** A left-to-right phase roadmap with nine phases. Phase 0 (Foundation) leads to Phase 1 (Membership MVP), which leads to Phase 2 (Chapters at scale). Phase 2 branches three ways: to Phase 3 (Governance and documents), to Phase 5 (Donations and fundraising), and to Phase 7 (Corporate memberships). Phase 3 leads to Phase 4 (Awards). Phase 5 leads to Phase 6 (Events). Phases 4, 6, and 7 all converge on Phase 8 (Communications and polish). Phases 3, 5, and 7 are therefore independent of each other once Phase 2 is done.

Phases 4 and 5 can swap or run in parallel if two streams are available. Hosted-service billing (E-42) can be pulled earlier if we want to start selling hosting sooner.

Current plans live in [`plans/`](plans/): the review of Phases 1–3 with the plan for what's left ([`phases-1-3-review.md`](plans/phases-1-3-review.md)) and the MVP release plan ([`wave-a-mvp.md`](plans/wave-a-mvp.md)).

## 2. Epics by phase

Status for Phases 0–3 (✅ cleared, 🟡 cleared with follow-ups, 🟠 partly built, ⬜ not started or deferred) comes from the review in [`plans/phases-1-3-review.md`](plans/phases-1-3-review.md), refreshed for the v0.1.0 release candidate (2026-11-05). Phase 1 and Phase 2 exit criteria are met; Phase 0's subdomain sign-in waits for E-07, and Phase 3's are not met yet. Later phases haven't started.

### Phase 0: Foundation

| ID       | Epic                                          | Outcome                                                                                                                                                                                                                                                                                                                                                                               | Status (2026-11-05)                                                                                                                                                                                                                                                           |
| -------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-01     | Project scaffolding and CI/CD                 | Repo, lint, types, tests, CI pipeline, environments, npm scripts, local development setup (local Postgres, env vars, `.env.example`)                                                                                                                                                                                                                                                  | 🟡 CI, checks, end-to-end tests (including about 40 user-testing steps, D-198, D-202), a performance budget at 5,000–20,000 members (D-209), the pre-commit hook and the docs check run (D-182, D-197); the coverage gate in `instructions.md` §9 needs a dependency decision |
| ~~E-02~~ | ~~Deployment packaging~~                      | **Moved to the future backlog as F-11** (D-012). ID retired, not reused                                                                                                                                                                                                                                                                                                               | —                                                                                                                                                                                                                                                                             |
| E-03     | Identity and authentication                   | Global person and account, sign-in, sessions, email verification, password reset, invitations, **joining a new org with an existing account, org switcher**                                                                                                                                                                                                                           | ✅ Cleared; account page with a default organization, no separate dashboard (D-192, D-206)                                                                                                                                                                                    |
| E-04     | Organization hierarchy and platform tier      | Org tree (platform, national, region, chapter, standalone), org settings, tax profile, **branding with logo upload and chapter override**                                                                                                                                                                                                                                             | ✅ Cleared                                                                                                                                                                                                                                                                    |
| E-05     | RBAC and permissions                          | Roles, permissions, scoped assignments with downward inheritance, policy layer                                                                                                                                                                                                                                                                                                        | ✅ Cleared                                                                                                                                                                                                                                                                    |
| E-06     | Audit log                                     | Append-only log and viewer, hooks for all modules                                                                                                                                                                                                                                                                                                                                     | ✅ Cleared                                                                                                                                                                                                                                                                    |
| E-07     | Host-based tenant resolution                  | Wildcard subdomain mapping (tested locally with `*.localhost`), org context per request, RLS wiring, tenant-isolation tests. **Deferred** (D-111): RLS and tenant-isolation tests are done; per-org web addresses wait                                                                                                                                                                | ⬜ Deferred (D-111); RLS and isolation tests done                                                                                                                                                                                                                             |
| E-08     | Jobs, email, and notifications infrastructure | Postgres jobs table and scheduled server routes (D-103, replacing pg-boss), email through the platform's email or the client's own server chosen by `EMAIL_TRANSPORT`, server settings and send-from address per org (D-159), template system, signed-action links that open a signed-in confirmation page (D-164). **Deferred** (D-111); its email follow-up list is in `roadmap.md` | ⬜ Deferred (D-111); first update after the MVP (D-169)                                                                                                                                                                                                                       |

**Exit:** a national and a chapter can exist, users can sign in on the right subdomain, a chapter admin sees only their chapter, and every action is audited.

### Phase 1: Membership MVP

| ID   | Epic                                           | Outcome                                                                                                                                                         | Status (2026-11-05)                                                                                                       |
| ---- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| E-09 | Custom attribute system                        | Org-defined member attributes (types, validation, visibility), attribute values on members, admin UI                                                            | ✅ Cleared                                                                                                                |
| E-10 | Setup engine framework + Membership setup flow | Reusable guided-setup framework, first flow covering members, attributes, tiers, and dues questions (see `setup-engine.md`)                                     | ✅ Cleared; setup now also covers prices by member fields (D-177)                                                         |
| E-11 | Membership tiers and terms                     | Org-defined tiers, term options, prices, tax treatment, prepaid model                                                                                           | ✅ Cleared                                                                                                                |
| E-12 | Payment gateway abstraction and Stripe         | Gateway interface, Stripe adapter, transactions, webhooks, refunds                                                                                              | 🟡 Cleared; transaction export done (D-173); live Stripe test-mode check open (A1, owner action)                          |
| E-13 | Member signup and renewals                     | Public join form, application and approval (optional), renewals, lapses, grace periods, standing; national membership with a home chapter (D-166, D-174, D-176) | 🟡 Cleared; automatic lapse notices and reminders wait for E-08                                                           |
| E-14 | Member directory, lists, and exports           | Member list with standing and time-to-expiration, filters, saved segments, privacy-aware CSV exports                                                            | ✅ Cleared; import, off-roster records and lists past 1,000 rows (D-181, D-189, D-190); checked at 20,000 members (D-209) |
| E-15 | Basic automatic receipts                       | Receipt on payment, default template, receipt history                                                                                                           | ✅ Cleared                                                                                                                |

**Exit:** a standalone org can complete setup, sell memberships through Stripe, renew them, see its roster, and export a mailing list.

### Phase 2: Chapters at scale

| ID   | Epic                                           | Outcome                                                                                                                                                                                                                                    | Status (2026-11-05)                                                                                    |
| ---- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| E-16 | Chapter creation wizard and chapter attributes | National-led chapter creation, national-defined chapter attributes (e.g., charter date), prompts for required officers                                                                                                                     | ✅ Cleared                                                                                             |
| E-17 | Board role templates and appointments          | National-defined seats (required, count, term, permissions), custom titles, appointments with history, access grant and revoke                                                                                                             | ✅ Cleared                                                                                             |
| E-18 | Two-level dues and national controls           | National and chapter tiers, none/optional-range/required chapter dues, locked or suggested structures (chapter chooses copy or linked, D-165), two-payment checkout UX; alternative model: national membership with a home chapter (D-166) | ✅ Cleared: suggested levels, national standing and the home-chapter model built (D-174, D-177, D-178) |
| E-19 | Rules engine and attribute-based pricing       | Declarative rules UI, pricing by attribute (e.g., rank bands), reused later for eligibility and approvals                                                                                                                                  | ✅ Cleared                                                                                             |
| E-20 | Postpaid dues                                  | Balances, invoices, due dates, delinquency, admin-defined enforcement as inheritable settings (D-161), manual payment recording, **parent orgs invoicing subordinate orgs** (national fee, D-162)                                          | ⬜ Not started                                                                                         |
| E-21 | Per-org gateways and PayPal                    | Each org connects Stripe or PayPal, **Direct mode only** (Connect dropped, D-162), PayPal adapter. The national fee is invoiced through E-20                                                                                               | 🟠 Partly built (Stripe done; PayPal open)                                                             |
| E-22 | Custom domains                                 | Domain settings, DNS verification, on-demand TLS, subdomain remains default. **Needs a reverse proxy, so F-11 must be pulled forward before or with this epic**                                                                            | ⬜ Not started (keep deferred until F-11)                                                              |
| E-23 | National roll-up reporting                     | Cross-chapter membership and revenue reporting                                                                                                                                                                                             | ✅ Cleared; roll-ups checked at 20,000 members across 80 chapters (D-209)                              |

**Exit:** national can create a chapter through the wizard, seat its officers, and have it collect its own dues, while national sees roll-ups.

### Phase 3: Governance and documents

| ID   | Epic                                            | Outcome                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Status (2026-11-05)                            |
| ---- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| E-24 | Approval workflow engine                        | Generic multi-step approvals, approver resolution, escalation, delegation to national, batch approval, signed one-click links with confirmation page and comment                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | ⬜ Not started                                 |
| E-25 | Governance compliance                           | Vacancy alerts, good-standing checks for officers, board reports (types, schedules, submit, review), national oversight dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | 🟠 Partly built (good standing, vacancy views) |
| E-26 | Document repository                             | Libraries, categories, required types, versions, visibility levels, change alerts to national, compliance dashboard                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | ⬜ Not started                                 |
| E-27 | Elections                                       | Positions, eligibility, nominations, voting windows, single choice and ranked choice, hybrid entry, certification, auto-appointment, immutable results                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | ⬜ Not started                                 |
| E-28 | Automation engine expansion                     | Reusable triggers and schedules, the full automation inventory from `architecture.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | ⬜ Not started (needs E-08)                    |
| E-43 | Annual chapter reports (optional, per national) | A national that wants annual reports builds the report form itself (its own questions, required or not, using the form builder); sets a due date (and which years); every chapter's president then has a task, "Submit the annual report by …", on their Overview, can save a draft and submit once; the national sees who has submitted, who is late and each answer, and can export them. Entirely optional: a national that doesn't build a form sees nothing. Builds on E-29 (the form builder, pulled forward for this or built first here), E-17 (presidents' seats) and E-08 (reminders, later); review and sign-off can use E-24 | ⬜ Not started (proposed 2026-11-03, D-204)    |

**Exit:** national sees vacancies, overdue reports, and document changes at a glance, and a chapter can run an election that seats its new board.

### Phase 4: Awards

| ID   | Epic                                | Outcome                                                                                                                                                   |
| ---- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-29 | Form builder                        | Org-defined forms with fields, conditional logic, uploads, attribute linkage. Reused by awards first                                                      |
| E-30 | Award catalog and approval policies | Awards, families and prerequisites, criteria, per-award forms, tiered approval chains, outcome and appeal settings, payer settings                        |
| E-31 | Submission, routing, and approvals  | Submission flow, routing by chapter/role/rank, rank-verified flag, escalation to national, board-meeting batch approval, email link and portal approvals  |
| E-32 | Award purchase and payer            | Purchase options, add-ons (e.g., express fee), payer chosen per award or via form, chapter override, receipts, revenue to owning org                      |
| E-33 | Award fulfillment tracking          | National-managed statuses (purchased, in production, shipped, presented), lead times, tracking, presentation date, awards dashboard, member award history |

**Exit:** a member can be nominated, routed to the right approver, approved or escalated, paid for by whoever the award allows, and tracked through shipping.

### Phase 5: Donations and fundraising

| ID   | Epic                                                    | Outcome                                                                                                                 |
| ---- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| E-34 | Donations                                               | One-time and recurring gifts, designations (restricted/general), donation pages                                         |
| E-35 | Fundraising                                             | Campaigns with goals and progress, peer-to-peer pages, sponsorships                                                     |
| E-36 | Receipt templates, manual receipts, year-end statements | Template editor with national inheritance, manual receipts (cash, check, in-kind), void and reissue, year-end summaries |

### Phase 6: Events and registration

| ID   | Epic                    | Outcome                                                                                                                           |
| ---- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| E-37 | Events and registration | Events, ticket types, member vs non-member pricing, registration, check-in, capacity and waitlists, fair-market-value on receipts |

### Phase 7: Corporate memberships

| ID   | Epic                  | Outcome                                                             |
| ---- | --------------------- | ------------------------------------------------------------------- |
| E-38 | Corporate memberships | Company accounts, seats, company admin, corporate tiers and billing |

### Phase 8: Communications and polish

| ID   | Epic                                         | Outcome                                                                                                                 |
| ---- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| E-39 | Communications                               | Templates, segmented bulk email, scheduled reminders, announcements                                                     |
| E-40 | Public sites and widgets                     | Public chapter pages, listings, embeddable widgets, public awards roll                                                  |
| E-41 | Accounting export                            | Chart-of-accounts mapping per org, generic CSV by date range                                                            |
| E-42 | Hosted-service billing and tenant management | Platform admin, usage metering (orgs, chapters, active members), hosting plans and billing, thresholds as configuration |

## 3. Dependency map (key relationships)

```mermaid
flowchart TD
    E04[E-04 Org hierarchy] --> E05[E-05 RBAC]
    E04 --> E07[E-07 Tenant resolution]
    E05 --> E17[E-17 Board seats]
    E09[E-09 Attributes] --> E10[E-10 Setup engine]
    E09 --> E19[E-19 Rules and pricing]
    E09 --> E29[E-29 Form builder]
    E11[E-11 Tiers] --> E13[E-13 Signup and renewals]
    E12[E-12 Gateway and Stripe] --> E13
    E13 --> E14[E-14 Member lists]
    E13 --> E18[E-18 Two-level dues]
    E19 --> E18
    E17 --> E25[E-25 Governance compliance]
    E17 --> E27[E-27 Elections]
    E29 --> E43[E-43 Annual chapter reports]
    E17 --> E43
    E08[E-08 Jobs and notifications] --> E24[E-24 Approval engine]
    E19 --> E24
    E24 --> E31[E-31 Award approvals]
    E24 --> E26[E-26 Documents review flow]
    E29 --> E30[E-30 Award catalog]
    E30 --> E31
    E31 --> E32[E-32 Award purchase]
    E12 --> E32
    E32 --> E33[E-33 Fulfillment]
    E12 --> E34[E-34 Donations]
    E15[E-15 Receipts] --> E36[E-36 Receipt templates]
    E34 --> E36
```

> **Diagram description:** A top-down dependency map of selected epics. An arrow means "must come before". The connections are:
>
> - E-04 (Org hierarchy) leads to E-05 (RBAC) and E-07 (Tenant resolution).
> - E-05 (RBAC) leads to E-17 (Board seats).
> - E-09 (Attributes) leads to E-10 (Setup engine), E-19 (Rules and pricing), and E-29 (Form builder).
> - E-11 (Tiers) and E-12 (Gateway and Stripe) both lead to E-13 (Signup and renewals).
> - E-13 leads to E-14 (Member lists) and E-18 (Two-level dues); E-19 also leads to E-18.
> - E-17 (Board seats) leads to E-25 (Governance compliance), E-27 (Elections) and E-43 (Annual chapter reports).
> - E-29 (Form builder) also leads to E-43 (Annual chapter reports): the national builds the report form with it.
> - E-08 (Jobs and notifications) and E-19 (Rules) both lead to E-24 (Approval engine).
> - E-24 leads to E-31 (Award approvals) and E-26 (Documents review flow).
> - E-29 (Form builder) leads to E-30 (Award catalog), which leads to E-31.
> - E-31 leads to E-32 (Award purchase), which leads to E-33 (Fulfillment); E-12 also leads to E-32.
> - E-12 leads to E-34 (Donations).
> - E-15 (Receipts) and E-34 both lead to E-36 (Receipt templates).

**Early design dependencies** (items later phases will need, so earlier phases must not close them off):

| Needed later                                      | Must be anticipated in                                                                               |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Two-level dues (E-18)                             | Tier and membership model in E-11 and E-13 (membership belongs to an org, a person can hold several) |
| Rank-based pricing and approver rank (E-19, E-31) | Attribute types in E-09, including ordered lists                                                     |
| Setup engine for every module (E-10)              | Every later module defines its setup flow as part of its epic                                        |
| Awards as store products (future store)           | Purchase options modeled as products in E-32                                                         |
| Approval engine reuse (E-24)                      | Keep the engine generic, not award-specific                                                          |
| Payer flexibility (E-32)                          | Payment records reference an item and a payer separately from the person it benefits                 |

## 4. Future backlog (scoped, not scheduled)

| ID   | Epic                                                                                                                                                                                                                                                                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | Generic store (merchandise, add-ons) on the shared cart and gateway connectors                                                                                                                                                                                                                                                                                                                                      |
| F-02 | Vendor and inventory tracking for physical items and awards                                                                                                                                                                                                                                                                                                                                                         |
| F-03 | Delegate-based national elections                                                                                                                                                                                                                                                                                                                                                                                   |
| F-04 | Regional tier features and regional award approvals                                                                                                                                                                                                                                                                                                                                                                 |
| F-05 | Reply-by-email approvals (inbound parsing)                                                                                                                                                                                                                                                                                                                                                                          |
| F-06 | Virus scanning for document uploads                                                                                                                                                                                                                                                                                                                                                                                 |
| F-07 | PayPal national-fee mechanism                                                                                                                                                                                                                                                                                                                                                                                       |
| F-08 | Tool-specific accounting export formats                                                                                                                                                                                                                                                                                                                                                                             |
| F-09 | Internationalization and multi-currency                                                                                                                                                                                                                                                                                                                                                                             |
| F-10 | Mobile app or PWA enhancements                                                                                                                                                                                                                                                                                                                                                                                      |
| F-11 | **Deployment packaging:** a lightweight standalone install (D-160; default: app + hosted Supabase, D-168): Docker image, Docker Compose (app + hosted Supabase, or app + a minimal self-hosted Supabase subset), Caddy configuration, backup and restore notes, upgrade notes (moved from E-02). Pull forward before E-22 (custom domains) or E-42 (hosted billing), or sooner if we need a shared test environment |

## 5. Scrum guidance

**Cadence (suggestion):** 2-week sprints. Phase 0 is roughly 3 to 4 sprints. Each later phase is roughly 4 to 8 sprints depending on team size. Treat these as placeholders until we have velocity.

**Slicing rules**

- Prefer **vertical slices** (a thin working path through UI, logic, and data) over layer-by-layer work.
- Engines (attributes, rules, setup, approvals, forms) ship with their **first real consumer** in the same phase so they are not built in a vacuum.
- Every module epic includes: its setup-engine flow, audit events, permissions, and automations. These are part of the epic, not separate "later" tickets.

**Definition of Ready (story)**

- Linked to an epic and relevant decision IDs.
- Acceptance criteria written, including permission and tenancy behavior.
- UI/UX notes or a sketch if user-facing.

**Definition of Done (story)**

- Code reviewed, tests passing (unit, integration, and e2e where user-facing).
- **Tenant-isolation test** added or updated for any new tenant-scoped data.
- Permissions enforced through the policy layer.
- Audit events emitted for meaningful actions.
- Migrations reversible or safely forward-only, and seed data updated.
- Docs updated (these planning docs, plus user or admin docs where relevant).
- Configuration comes from environment variables, with no hard dependency on a host-specific feature (keeps later packaging easy).
- Any diagram touched has its **description** updated in the same change.

**Per-epic exit criteria** are listed with each phase above. A phase is done when its exit statement is demonstrably true in a demo.
