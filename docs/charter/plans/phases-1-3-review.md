# Phases 1–3: epic clearance review and plan

Status on 2026-11-02 (refreshed after Sprints 1–3 of the MVP plan), with migrations `0000`–`0035` applied. Sources: `docs/epic.md` (scope and exit criteria), `roadmap.md`, `docs/decisions.md`, the code under `src/` and `drizzle/migrations/`, and the tests under `db/tests/` and `src/**/*.test.ts*`.

**Legend:** ✅ cleared (the outcome in `epic.md` is built and tested) · 🟡 cleared with follow-ups (usable, named gaps) · 🟠 partly built · ⬜ not started.

## 1. Summary

| Phase                      | Epics | Cleared | With follow-ups | Partly built | Not started | Exit criteria met?                                                                                               |
| -------------------------- | ----- | ------- | --------------- | ------------ | ----------- | ---------------------------------------------------------------------------------------------------------------- |
| 1 Membership MVP           | 7     | 4       | 3               | 0            | 0           | **Yes**, apart from a real Stripe account check (test gateway proven; Stripe test mode not yet checked live, A1) |
| 2 Chapters at scale        | 8     | 3       | 2               | 1            | 2           | **Yes for the exit as written** (wizard, officers, own dues, roll-ups); E-20, E-21 and E-22 are open             |
| 3 Governance and documents | 5     | 0       | 0               | 1            | 4           | **No**: no board reports, documents, elections or alerts yet                                                     |

What holds back most of what's left: **E-08 (jobs and email) is deferred** (D-111, and out of the MVP, D-169). Lapse handling, renewal reminders, vacancy alerts, overdue-report chasing, signed approval links (E-24) and the automation engine (E-28) all need it.

End-to-end tests now exist (Playwright, D-170, D-175) and grow with each feature.

## 2. Clearance by epic

### Phase 1: Membership MVP

| Epic                                | Status | Evidence                                                                                                                                                                                                            | Remaining                                                                                                                                                   |
| ----------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-09 Custom attributes              | ✅     | 7 types incl. ordered lists, visibility, self-edit, inheritance, chapter fields, locked chapter fields, retire-not-delete (D-060, D-061, D-112, D-121); `60_attributes.sql`                                         | —                                                                                                                                                           |
| E-10 Setup engine + Membership flow | ✅     | Engine, drafts, review with diff, one-transaction `apply_setup`; Membership setup v4 with a pricing step (A6, D-177); setup hub (D-113, D-143)                                                                      | Setup flows for documents / elections arrive with their epics                                                                                               |
| E-11 Tiers and terms                | ✅     | Levels, org-defined terms, lifetime, prices in minor units, tax treatment, parent control (D-126); `90_tiers.sql`                                                                                                   | —                                                                                                                                                           |
| E-12 Gateway + Stripe               | 🟡     | Gateway interface, Stripe adapter (no SDK), sealed per-org keys, webhooks, refunds, test gateway (D-127, D-129); return links to the public address and direct confirmation (D-158); transaction CSV export (D-173) | **Verify a real Stripe test-mode account end to end** (A1, owner action; only the test gateway has been run live)                                           |
| E-13 Signup and renewals            | 🟡     | Join page, approval, decline with refund, renewal with stacking, grace, derived standing (D-130..D-134); national membership with a home chapter (D-166, D-174, D-176); `95`, `97`, `9L`                            | **Automatic lapse handling and renewal reminders** need E-08 (standing is derived on read, so a lapse already shows correctly; nothing notifies the member) |
| E-14 Lists and exports              | ✅     | Filters, expiring 30/60/90, saved views, audited privacy-aware exports, directory with privacy choice, admin view across the tree with chosen columns and export (D-138, D-139, D-154, D-179)                       | — (chosen fields as columns and cross-chapter export built in A7, D-179)                                                                                    |
| E-15 Basic receipts                 | ✅     | Automatic, numbered, immutable, void / reissue, refunds, print, footer (D-140)                                                                                                                                      | Templates and manual receipts are E-36 (Phase 5); CPA review of wording (R-07)                                                                              |

**Exit check:** a standalone org can complete setup ✅, sell memberships through Stripe 🟡 (built; live Stripe test-mode run outstanding), renew ✅, see its roster ✅ and export a mailing list ✅.

### Phase 2: Chapters at scale

| Epic                                     | Status | Evidence                                                                                                                                                                                                                                                                                                           | Remaining                                                                                                       |
| ---------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| E-16 Chapter wizard + chapter attributes | ✅     | Wizard with chapter fields, first admin, required-officer invitations (D-144)                                                                                                                                                                                                                                      | —                                                                                                               |
| E-17 Board seats and appointments        | ✅     | Seats for an org, its chapters or both; custom titles; each org's own terms with by-law history; appointments grant / revoke the seat's role; contact emails; Board setup (D-141..D-143, D-151, D-156, D-157); `9B`, `9D`, `9I`, `9J`                                                                              | —                                                                                                               |
| E-18 Two-level dues + national controls  | ✅     | National-first two payments, chapter dues none / optional / required, price range, "chapters use our levels" (D-146); suggested levels, copy or linked (A4, D-177); national standing on the chapter's Members page and a national-dues reminder (A5, D-178); the home-chapter model (A8, D-174); `9F`, `9L`, `9M` | Linked renewals (pay national and chapter in one checkout) stay a later improvement. Live since 0032            |
| E-19 Rules + attribute-based pricing     | ✅     | Declarative conditions shared by SQL and TypeScript, pricing per term, quotes (D-147); pricing step in Membership setup (A6, D-177); `9G`, `9M`                                                                                                                                                                    | Reuse for eligibility and approvers comes with E-24 / E-27 / E-31                                               |
| E-20 Postpaid dues                       | ⬜     | Nothing built (no balances, invoices or due dates)                                                                                                                                                                                                                                                                 | Whole epic (D-053, D-054, Q-15, R-14)                                                                           |
| E-21 Per-org gateways and PayPal         | 🟠     | Each org connects its own Stripe (Direct mode)                                                                                                                                                                                                                                                                     | **PayPal adapter** (D-043, R-02). Connect mode is dropped and the national fee is invoiced through E-20 (D-162) |
| E-22 Custom domains                      | ⬜     | Nothing built; needs a reverse proxy, so F-11 first; per-org addresses (E-07) are deferred too                                                                                                                                                                                                                     | Whole epic; recommend keeping it deferred until hosting is decided (R-08, Q-14)                                 |
| E-23 National roll-ups                   | ✅     | Reports for the org and every org below it (chapter admins: their chapter), overview numbers (D-145, D-152), payment export across the tree (D-173); `9E`, `9I`, `9K`                                                                                                                                              | —                                                                                                               |

**Exit check:** national creates a chapter through the wizard ✅, seats its officers ✅, the chapter collects its own dues ✅, national sees roll-ups ✅.

### Phase 3: Governance and documents

| Epic                             | Status | Evidence                                                                                           | Remaining                                                                                                                                                                                                                                                                  |
| -------------------------------- | ------ | -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| E-24 Approval workflow engine    | ⬜     | Membership approval is a single built-in step, not the generic engine                              | Whole epic: chains, approver resolution (role and/or rank, D-081), escalation, delegation to national (D-083), batch approval, signed links to a signed-in confirmation page (D-084, D-164). Needs E-08 for links                                                          |
| E-25 Governance compliance       | 🟠     | Good standing for officers (D-056); vacancies and terms past their end in Reports and the Overview | **Board reports** (types, schedules, submit, review, D-073); **vacancy alerts** (needs E-08); national **oversight dashboard** that combines vacancies, overdue reports and document compliance                                                                            |
| E-26 Document repository         | ⬜     | —                                                                                                  | Whole epic (D-075): libraries, national categories, required types, versions, visibility, change alerts, compliance view; private storage bucket per `architecture.md` §11; virus scanning stays deferred (F-06)                                                           |
| E-27 Elections                   | ⬜     | —                                                                                                  | Whole epic (D-074, D-163, D-167, R-13): positions linked to seats, eligibility (rules engine), nominations, voting windows, first past the post or ranked choice per org, private choices, hybrid entry, certification, auto-appointment into the board, immutable results |
| E-28 Automation engine expansion | ⬜     | No jobs table or scheduled routes yet (D-103 decided, E-08 deferred)                               | Triggers and schedules from `architecture.md` §10, after E-08                                                                                                                                                                                                              |

**Exit check:** national sees vacancies ✅ (Reports, Overview), overdue reports ⬜ and document changes ⬜ at a glance; a chapter can run an election that seats its new board ⬜.

## 3. Plan

Work in waves. Each item follows the commit rules (tests, docs, migration conventions D-125) and ships its setup flow, audit events and permissions with it (`instructions.md` §7).

### Wave A: close Phase 1–2 gaps that need no new infrastructure (detailed plan and MVP release: [`wave-a-mvp.md`](wave-a-mvp.md)) (≈ 1–2 sprints)

| #   | Item                                                                                                                                                      | Epic          | Notes                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------- |
| A1  | **Owner action.** Live Stripe test-mode run on a non-demo test org: connect, join, webhook, refund, decline with refund                                   | E-12          | Needs the owner's Stripe test account. Steps in `user-testing.md` §10 |
| A2  | ✅ Playwright end-to-end harness and first specs (Sprint 1, D-175); more specs as features land                                                           | cross-cutting | `docs/testing.md` "End-to-end tests"                                  |
| A3  | ✅ Transaction CSV export, audited, for one org or a national's tree (Sprint 1, D-173, migration 0029)                                                    | E-12, E-23    | —                                                                     |
| A4  | ✅ Suggested levels, Copy or Linked (Sprint 2, D-177, migration 0032)                                                                                     | E-18          | —                                                                     |
| A5  | ✅ National standing on the chapter's Members page; national-dues reminder (Sprint 2, D-178, migration 0032)                                              | E-18          | —                                                                     |
| A6  | ✅ Pricing step in Membership setup (Sprint 3, D-177, migration 0032)                                                                                     | E-19, E-10    | —                                                                     |
| A7  | ✅ Members "everyone" view: chosen columns; export across chapters with each org's directory rule (Sprint 3, D-179)                                       | E-14          | —                                                                     |
| A8  | ✅ National membership with a home chapter, chosen once (on creating a national or on Settings → General) (Sprint 1, D-166, D-174, D-176, migration 0030) | E-13, E-18    | —                                                                     |

### Wave B: infrastructure that unblocks the rest (≈ 2 sprints)

| #   | Item                                                                                                                                                                                                                                                                           | Epic | Notes                                                                                                                   |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---- | ----------------------------------------------------------------------------------------------------------------------- |
| B1  | **Un-defer E-08:** jobs table and scheduled server routes (D-103); email through `EMAIL_TRANSPORT` = `platform` or `smtp` with Settings → Email (server, login, test send, send-from address) (D-159); templates; signed-action links to a signed-in confirmation page (D-164) | E-08 | Design notes in §5. Respect `emails_allowed` for demo orgs (D-148). Then work the email list in `roadmap.md` (Deferred) |
| B2  | Lapse job and renewal reminders                                                                                                                                                                                                                                                | E-13 | First consumer of B1                                                                                                    |

### Wave C: money features (≈ 3–4 sprints, can run in parallel with Wave D)

| #   | Item                                                                                                                              | Epic | Notes                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------- | ---- | -------------------------------------------------------------------------------------------- |
| C1  | Postpaid dues: balances, invoices, due dates, delinquency, enforcement as inheritable settings, manual payment against an invoice | E-20 | D-053, D-054, D-161; settle R-14 (overall standing with mixed levels) in its design          |
| C2  | Parent orgs invoice subordinate orgs (the national fee, or anything else), paid like any invoice                                  | E-20 | D-162; reuses C1's invoices with an org as the payer                                         |
| C3  | PayPal adapter (Direct, no fee split)                                                                                             | E-21 | R-02                                                                                         |
| —   | Custom domains                                                                                                                    | E-22 | **Keep deferred** until F-11 and a hosting decision; record it in `epic.md` like E-07 / E-08 |

### Wave D: Phase 3 (≈ 6–8 sprints)

| #   | Item                                                                                                     | Epic        | Notes                                                                                                                                                                                                                                                                                                                                                       |
| --- | -------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Approval engine, first real consumer: board report review                                                | E-24 + E-25 | "Engines ship with their first real consumer." Generic chains (role and/or rank), escalation to national, batch approval with a meeting date, approve in-portal and by signed link (needs B1). Keep award specifics out (D-081..D-085 are Phase 4)                                                                                                          |
| D2  | Board reports: national defines types and schedules, chapters submit, national reviews, overdue tracking | E-25        | D-073; setup flow §6.5 "Board report types and schedules"                                                                                                                                                                                                                                                                                                   |
| D3  | Vacancy alerts and the national oversight dashboard (vacancies, overdue reports, document compliance)    | E-25        | Alerts need B1; the dashboard extends Reports                                                                                                                                                                                                                                                                                                               |
| D4  | Document repository                                                                                      | E-26        | D-075; private bucket under `<org_id>/`, signed URLs (like branding, D-109); review flow through the approval engine; setup flow §6.7                                                                                                                                                                                                                       |
| D5  | Elections                                                                                                | E-27        | D-074, D-163, D-167, R-13; the org chooses first past the post or ranked choice; private choices, voters see their own ballot until the next election for that position, admins read-only, results after certification; eligibility through the rules engine; certification makes results immutable and appoints through `appoint_officer`; setup flow §6.6 |
| D6  | Automation engine: the `architecture.md` §10 inventory on top of B1                                      | E-28        | Consolidates the reminders and alerts built in B2, D2, D3                                                                                                                                                                                                                                                                                                   |

### Decisions

Settled on 2026-11-02:

| For    | Decision                                                                                                                                                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| B1     | Email: `EMAIL_TRANSPORT` = the platform's email or the client's own server; server settings and login on Settings → Email; send-from address per org (D-159)                                                                                       |
| B1, D1 | Approval links open a confirmation page that requires sign-in; the decision happens on submit (D-164)                                                                                                                                              |
| C1     | Postpaid options are inheritable settings: the parent sets them, subordinates where allowed (D-161)                                                                                                                                                |
| C2     | Direct payments only; parents invoice subordinate orgs; hosting is billed outside the app (D-162)                                                                                                                                                  |
| D5     | Ballots: who voted for whom is never shown to members; voters see their own ballot until the next election for that position; admins can view but not change; results after a winner is certified (D-163)                                          |
| D5     | Voting method: each org chooses first past the post or ranked choice to match its by-laws (D-167)                                                                                                                                                  |
| F-11   | Packaging direction: lightweight standalone install with Docker Compose (D-160)                                                                                                                                                                    |
| A4     | Suggested levels: the chapter chooses Copy or Linked (same price or a set reduction), with an explanation on screen (D-165)                                                                                                                        |
| A8     | A national chooses, permanently, "separate memberships" or "national membership with a home chapter"; members may have no chapter or an at-large chapter, change chapter freely, hold one at most; chapters may bill local dues themselves (D-166) |
| D5     | Admins see individual ballots during and after voting; every view is audited (D-163)                                                                                                                                                               |

Still open: nothing. The F-11 default install is the app with a hosted Supabase project (D-168).

## 4. Documentation

Each item updates its docs in the same change (`instructions.md` §6). The documentation rounds of 2026-11-02 brought the README, the planning docs, the roadmap, testing and user-testing guides and the demo data up to date after Sprint 1 and again after Sprints 2–3, adding `docs/security-review.md` and `docs/tables.md` (every table and how they connect).

## 5. Design notes from the 2026-11-02 decisions

### E-08 email (D-159)

- **One interface, two transports.** `sendEmail({ orgId, to, subject, html, text, replyTo })` in a new `src/engines/notifications`, with a `platform` adapter (the hosting platform's email) and an `smtp` adapter. `EMAIL_TRANSPORT` picks one per deployment; if it's unset, nothing is sent and the app says email isn't configured.
- **Where it runs.** The hosted service runs on edge workers, where `platform` is the natural choice. A self-hosted install (D-160) runs the Node server, where an SMTP client library works. A provider with an HTTP API can be added later as a third adapter behind the same interface.
- **Settings → Email** (top-level org admins, `org.manage`):
  - `smtp` only: host, port, security (TLS / STARTTLS), username, password, sealed like Stripe keys (D-127) in the `private` schema and never shown again
  - send-from address and display name per org; chapters inherit unless the parent allows their own (D-108)
  - "Send a test email"
  - a short note on SPF / DKIM for their domain
- **Safety.** Demo orgs never send (`emails_allowed`, D-148). Every send is a job (retries, idempotent per message) and logged without the body. Links in emails never change anything on open (D-164).

### F-11 packaging (D-160)

- **Shape:** one image for the app (Node server build of TanStack Start), Docker Compose, Caddy for TLS.
- **Two profiles:**
  1. app + a hosted Supabase project: one small container, the cheapest to run
  2. app + a minimal self-hosted Supabase subset (Postgres, Auth, REST, Storage): fully self-contained, needs more memory
- **Already in our favour:** configuration is environment-driven (D-011); migrations and RLS already run on plain Postgres (`db/ci/supabase-stub.sql`).
- **To check when F-11 starts:**
  - scheduled routes need a cron runner in Compose
  - storage signed URLs work against the self-hosted Storage API

### A4 suggested levels (built)

Built in Sprint 2 as designed, with one difference: when the national retires a level, linked chapter levels are retired in the same transaction, without a separate notice. How it works is recorded in D-165 (the choice) and D-177 (as built); user steps in `user-testing.md` §6.

### A8 national membership with a home chapter (built)

Built in Sprint 1. How it works is recorded in D-166 (the rules), D-174 (data, standing, moving chapter) and D-176 (choosing it when a national is created). User steps: `user-testing.md` §13b.

## 6. Member overview backlog

Built (D-153): Actions needed (including the national-dues reminder, D-178), Your profile, Your roles and seats, Board and who to contact (with role or officer emails, D-156), Your chapter (home-chapter model, D-174). Still to come:

| Item                                                | Shows                                                                                  | Needs                                  | When                              |
| --------------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------- |
| All my memberships                                  | One line per org the member belongs to, with standing and a link                       | Existing data                          | Next (useful with two-level dues) |
| Membership history                                  | Joined date, years of membership, past renewals and payments                           | A small helper for years of membership | Later                             |
| Organization info                                   | Logo, contact details, chapter fields visible to members (meeting place, charter date) | Existing data                          | Later                             |
| Announcements, events, documents, awards, elections | From their modules                                                                     | Their epics                            | With those epics                  |

Open questions: should an officer be able to hide their own email (forcing a role email)? Should chapter members also see the national's officers? Should "years of membership" count only continuous years? Should members see any aggregate about their org (needs a deliberately narrow function)?
