# Suite migration notes: OpenBoardApp → shared OpenAppHub project

This is Board's inventory and step plan for joining the OpenAppHub suite (`docs/SHARED-SPEC.md`, v2). It lists everything Board has in its own Supabase project today, where each piece goes in the shared project, every place the code calls Supabase, the owner's decisions, and the **Progress** table (§10) that drives the work, one PR per step.

- First written November 8, 2026, from `main` at `361780b` (step 1). Sources: `supabase/migrations/` (11 files), `src/integrations/supabase/types.ts`, `src/data/cloud-adapter.ts`. Phase 0 already proved the migrations rebuild the live schema with identical columns (`replay` job), so no schema dump was needed.
- Updated the same day for spec v2: the owner's answers to §8 are filled in, and the plan includes v2's changes.

Target: Board's tables move to schema **`board`** in the shared production project `nxungwtxnctcqolfshcr` (today's OpenCharterApp project). Board's own project `dnsqxiiexkdokgebysrt` is then wiped and becomes the suite's staging project. Nothing in it is copied; demo content becomes seed SQL. Hosted at `board.openapphub.org`, staging at `staging.board.staging.openapphub.org`.

## 0. Spec v2.2 changes (2026-11-09): read first

Spec v2.2 (`docs/SHARED-SPEC.md`, synced from the hub) changes parts of the plan below. Where this
section and the rest of the file disagree, this section wins.

- **Primary agent.** The OpenAppHub session now drives the suite's PRs, including this repo's. The
  earlier PR #6 was closed (its work is still on that PR's page); its notes are carried over here.
- **Fresh databases.** `openapphub-prod` (`ymlesgadawnjupnvgokd`) and `openapphub-staging`
  (`mbloxixlykmbuuoaprnx`). Nothing is copied or parked; there is no legacy schema. The hub's
  `db/core` is already applied to both (2026-11-09).
- Steps 1–2 (inventory, secret scan) were done on the closed PR and are carried over in this file unchanged.
- **Deploys.** Cloudflare's Git integration builds `main` and deploys production (`npm run build`, then
  `npx wrangler deploy`). The **top level of `wrangler.jsonc` is production**; `env.staging` and
  `env.development` are the others. No `release.yml`, no `CLOUDFLARE_*` GitHub secrets. Run
  `migrate.yml` against production on a PR's branch **before** merging it; migrations are additive.
- **`VITE_SUITE_URLS` is JSON**: `{"hub":…,"charter":…,"board":…,"ledger":…}`.
- **Design chosen**: "Civic, slightly warm" (`shared/design/DESIGN.md`). Restyling uses the shared
  tokens and `AppShell` (separate PRs, behaviour and visible text unchanged).
- **Cookie consent** is required: render the shared `CookieConsent` once; any new cookie or browser
  storage goes in `COOKIES` (`shared/consent.ts`).
- **Money and dates** only through `shared/format.ts`.
- **PRs and commits**: no "Generated with Claude Code" line, no session link, no
  "Co-Authored-By: Claude" line.

### 0.1 Shared code is vendored (shared 1.1.0)

This PR copies `shared/`, `db/core/`, `scripts/migrate.mjs`, `scripts/check-shared.mjs` and
`docs/SHARED-SPEC.md` from the hub (`scripts/sync-shared.mjs`), sets `"oahShared": "1.1.0"`, and
runs `node scripts/check-shared.mjs` in CI. Nothing imports the shared code yet. Never edit these
files here: change them in Nox-Mob/OpenAppHub and sync.

### 0.2 Next steps

1. ~~Step 3, hygiene~~ **done**: the first part in §0.3; the old Vite wrapper, error reporting and preview sign-in storage removed 2026-11-11 (docs/epic.md S-07).
2. ~~Steps 4, 5 and 8~~ **done** (§0.4): runner, `migrate.yml`, baseline, DB tests, performance test.
3. ~~Step 9, the client on `board`~~, the staging seed (step 6) and org scoping (step 10) **done** (§0.5).
4. ~~Step 11, hosted vs self-hosted, and the AppShell restyle~~ **done** (§0.6).
5. Done 2026-11-11 (§0.7): the suite demo, Worker previews, opening from OpenAppHub, end-to-end tests.
6. **What's left:** [`docs/epic.md`](epic.md) §1 (the suite items S-01 to S-11, the same in every app).

### 0.7 Suite demo, Worker previews, opening from OpenAppHub, end-to-end tests (2026-11-11)

Board's Overview opens straight from OpenAppHub in the right organization (`?org=`); `/` has no landing page; Cloudflare builds `main` for production and every other branch as a preview on `<branch>.board.staging.openapphub.org` (staging is branch `staging`); the lock file lists every platform package Cloudflare's `npm ci` needs; end-to-end tests on staging (`e2e/`, `.github/workflows/e2e.yml`). The remaining migration work is listed in `docs/epic.md`.

### 0.6 Step 11 and the restyle: hosted vs self-hosted, suite design (2026-11-10)

- **Hosted** (`VITE_HOSTED=true`): the browser session is a cookie on `.openapphub.org` (`@supabase/ssr`), shared with the hub and the other apps. `/auth` and signed-out pages go to the hub's sign-in and come back. New organizations, invitations and ownership transfer are in the hub (Board shows links); Board keeps roles and offices, removal, settings, letterhead and export. Signing out returns to the hub.
- **Self-hosted:** unchanged (Board's own sign-in, organizations, invitations and transfer).
- **Restyle** (behaviour and wording unchanged): `styles.css` uses the suite tokens and Inter; every board page is in the shared `AppShell` (same nav, suite and organization switchers, Help, the user menu with the suite theme toggle, the billing banner from `get_org_billing` via the data layer); `<html data-app="board">` with the suite theme script; cookie consent and a `/cookies` page.
- **Shared 1.3.0** vendored.

### 0.5 Steps 6, 9 and 10: the app on schema `board`, staging seed, org scoping (2026-11-10)

- **Client:** the Supabase client is created with `db: { schema: "board" }`; core tables are read with `.schema("public")`. `src/integrations/supabase/types.ts` is generated from `db/core` + `db/migrations` (schemas `public,board`), with `board` as the default schema for the `Tables<…>` helpers. Column `organization_id` is `org_id` everywhere; tables renamed in code: `board_positions` → `positions`, `board_terms` → `terms`, `organization_letterheads` → `letterheads`; files are in bucket `board-files`.
- **Roles:** the app keeps one role per person, from the core role plus the office (`board.officers`): owner → owner, admin → admin, member + office → chair / secretary / treasurer, member → member, viewer → observer. Changing a role updates the core membership (owner and admins only, by the database) and then the office. Ownership changes only by transfer.
- **Rewritten on core** (`src/data/cloud-adapter.ts`): my organizations (core name + `board.org_settings`, defaults when missing), creating (`create_organization`, then Board's time zone), renaming (`rename_organization`), settings (upsert), members (`org_member_directory`), invitations (`create_invitation` with `app = 'board'` and `{"office": …}`; `accept_invitation` then `board.on_invitation_accepted`; `revoke_invitation`), ownership (`ownership_transfer_candidates`, `transfer_ownership`), live-voting RPCs (`p_` parameters), the export (core organization and memberships plus Board's tables, including officers and people).
- **Org scoping:** the current organization is the suite cookie `oah_org` (`shared/supabase/org.ts`), re-checked against memberships; otherwise the first organization alphabetically. The old local-storage choice is read once.
- **Staging seed:** `db/seed/0001_board_demo.sql` replaced `reset_demo()` and its `pg_cron` job; `0002_board_demo_v2.sql` builds on it: Riverside's board in step with OpenCharterApp and OpenLedgerApp, the veterans national's executive committee and Post 7's board (the suite demo, `docs/SHARED-SPEC.md`). Dates are relative to the hub's 12-hourly reset. The demo sign-in is `board.demo@demo.openapphub.org`; the "Explore the demo board" button appears only where `VITE_ALLOW_DEMO_LOGIN=true` (staging) and on dev servers, no longer on production. Refuses a database the hub hasn't marked staging. CI loads it after the DB tests.
- **Retired:** `supabase/migrations` and `supabase/config.toml`. Self-hosting is `npm run db:migrate` plus exposing `board` (README).
- **Not changed yet (step 11):** Board keeps its own sign-in screens and session.

### 0.4 Steps 4, 5 and 8: runner, baseline, DB tests (2026-11-10)

- **`db/migrations/0001_board_baseline.sql`**: 21 tables in `board`, per §1.3, with `org_id`. The final names: `org_settings`, `officers`, `people`, `positions`, `terms`, `committees`, `committee_members`, `meetings`, `agenda_items`, `attendance`, `motions`, `minutes`, `documents`, `document_versions`, `packets`, `action_items`, `meeting_templates`, `vote_electorate`, `member_votes`, `letterheads`, `audit_log`.
  - Helpers: `board.can_edit_records` (`public.can_write` and owner/admin or chair/secretary), `board.can_manage` (`can_write` and owner/admin), `board.can_read_audit`, `board.holds_any` (mixed roles and offices, for `vote_closer_roles`), `board.settings(org)` (defaults when there's no row).
  - Live-voting RPCs are `board.*`; casting, closing and recording stop when the org is read-only.
  - `board.on_invitation_accepted` applies an office from `app_payload`.
  - Bucket `board-files` with `<org_id>/` paths (skipped on a database without Supabase Storage).
- **Decisions made in this step:**
  - **No triggers on core tables.** An officer row counts only while the person is core `member` or higher (`board.my_office`). The record locks let an organization's deletion cascade through (they check that the organization is gone) instead of using a trigger on `public.organizations`.
  - **Account columns on official records are plain ids** with a `person_name` snapshot (`attendance`, `minutes`, `motions`, votes, `created_by`): those rows are locked, and a foreign key with `on delete set null` would block account deletion. `terms`, `committee_members`, `action_items.assignee_id` and `officers` do reference `auth.users`.
  - `terms`, `committee_members` and `attendance` hold `user_id` **or** `person_id` (never both); both null is allowed (free-text names).
  - The old `memberships_one_owner`, `create_organization`, invitations and ownership functions aren't recreated: core has them.
  - Not ported: the `reset_demo` pg_cron job (staging seed, step 6), API views (step 14).
- **Package name** is now `openboardapp`: the runner records migrations under the package name, and Board and Ledger were both `tanstack_start_ts`.
- **Retired** in the same PR (spec §3.3): `drizzle/`, `drizzle.config.ts`, the `drizzle-*` packages, `supabase-db.yml` (replay and push), and the live-backend suites in `src/test/db` (replaced by `db/tests/*.sql`). `check-migrations.mjs` now checks `db/migrations`. **Kept, frozen:** `supabase/migrations` and `supabase/config.toml`, the old schema today's app still runs on, for self-hosters until step 9 (`supabase/README.md`). No workflow applies them to the shared database.
- **Row rules are set-based** (as in Charter and Ledger): `org_id in (select board.readable_org_ids())`, and `editable_org_ids` / `managed_org_ids` / `audit_org_ids` for writes and the audit log, so Postgres checks access once per query, not once per row. With the per-row `public.is_member(org_id)` checks, exporting 20,000 meetings took 2.4 s; now 148 ms. The `can_*` helpers stay for functions and the app.
- **CI:** `database-rules` (runner, then `db/tests`, on Postgres 17 with a stub of Supabase auth and storage) and `performance` (one board grown through 5,000, 20,000 and 50,000 meetings, the other 40 boards up to 500 each; 3 s budget on CI, 1 s locally), as in Charter.
- **Performance at 50,000 meetings** (locally): meetings list 1 ms, one meeting 1 ms, decisions 96 ms, my action items 44 ms, export 359 ms, audit log 1 ms.

### 0.3 Step 3 (hygiene), first part, as done for v2.2

- `package-lock.json` resolves every package from registry.npmjs.org (83 were on a private package cache); CI fails if a private registry comes back.
- `.env` is untracked (CI fails on a tracked env file); `.env.example` lists every variable. Unit tests in CI use placeholder values.
- `wrangler.jsonc`: top level = production (`board.openapphub.org`, `openapphub-prod`), `env.staging` (`staging.board.staging.openapphub.org`, `openapphub-staging`). `npm run build:hosted` / `build:hosted:staging` write its public `VITE_*` values before building (`scripts/deploy/build-env.mjs`).
- Security headers on every response (`src/lib/security-headers.ts`, `src/server.ts`); the CSP allows the Supabase project for connections, images and file previews.
- Unused `client.server.ts` (service role) and `cron-auth.ts` removed: Board uses no service-role key.
- The old shared test backend is gone, so the live `database-rules` suites skip themselves; the same suites still run against a local database in `supabase-db.yml`.
- **Self-hosting:** `npm run build` with your own `.env`; README has a section.
- **Owner:** the `openboardapp` Worker's build command must be `npm run build:hosted` and its deploy command `npx wrangler deploy --config wrangler.jsonc`. The hosted app can't work until the baseline (step 5) and client (step 9) are in.

## 1. What Board's database contains today

Everything is in schema `public`, plus policies on `storage.objects`, a trigger on `auth.users`, and one `pg_cron` job.

### 1.1 Extensions

| Extension  | Schema       | Used for                                                           | Shared project                                                    |
| ---------- | ------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `pgcrypto` | `extensions` | `gen_random_bytes`, `digest` (invitation tokens)                   | Only core invitations need it now; the core creates it            |
| `pg_cron`  | `pg_catalog` | `reset-demo-org` job every 6 hours (`20261106010000_demo_org.sql`) | **Dropped.** The reset becomes a scheduled `staging.yml` run (§6) |

### 1.2 Enums

| Enum                | Values                                                      | Destination                                                                   |
| ------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `org_role`          | owner, admin, chair, secretary, treasurer, member, observer | Core `public.org_role` (owner, admin, member, viewer) + `board.office` (§2.2) |
| `meeting_status`    | draft, scheduled, in_progress, completed, archived          | `board.meeting_status`                                                        |
| `minutes_status`    | draft, submitted, approved, superseded                      | `board.minutes_status`                                                        |
| `attendance_status` | present, absent, excused, remote                            | `board.attendance_status`                                                     |
| `motion_outcome`    | pending, carried, failed, tabled, withdrawn                 | `board.motion_outcome`                                                        |
| `task_status`       | open, in_progress, done, cancelled                          | `board.task_status`                                                           |
| (new)               | chair, secretary, treasurer                                 | `board.office`                                                                |

### 1.3 Tables (22)

The org column is `organization_id` everywhere today; the suite uses `org_id` (spec §3.4).

| Table                      | Created in             | Purpose                                                 | Destination                                                                           |
| -------------------------- | ---------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `profiles`                 | 0000                   | `id`, `full_name`, `email`                              | **Core** `public.profiles`; names and emails via `public.org_member_directory` (§2.4) |
| `organizations`            | 0000, 0002, 0003       | name + Board settings (timezone, quorum, vote rules)    | **Core** for id/name; Board columns move to `board.org_settings` (§2.1)               |
| `memberships`              | 0000, ownership        | `id` pk, `organization_id`, `user_id`, `role`           | **Core** `public.memberships` (pk `(org_id, user_id)`, no `id`)                       |
| `invitations`              | 0000                   | token-hash invites                                      | **Core** `public.invitations` (§2.5). No `board.invitations`                          |
| `audit_log`                | 0000                   | trigger-written history                                 | `board.audit_log` (Board tables only)                                                 |
| `board_positions`          | 0005                   | roles (President, Secretary…) with term length          | `board.positions`                                                                     |
| `board_terms`              | 0000, 0005             | holder history: `person_name`, `user_id`, `position_id` | `board.terms`, holder = user **or** `board.people` (§2.3)                             |
| `committees`               | 0000                   | committees                                              | `board.committees`                                                                    |
| `committee_members`        | 0000                   | `person_name`, `user_id`, `role`                        | `board.committee_members`, holder = user or `board.people`                            |
| `meetings`                 | 0000                   | meetings                                                | `board.meetings`                                                                      |
| `agenda_items`             | 0000, 0003, 0004       | agenda, notes, vote items with optional decision rule   | `board.agenda_items`                                                                  |
| `attendance`               | 0000                   | `person_name`, `user_id`, status, `is_voting`           | `board.attendance`, attendee = user or `board.people`                                 |
| `motions`                  | 0000, 0002, 0003, 0006 | motions, tallies, live-vote state, `vote_record`        | `board.motions`                                                                       |
| `minutes`                  | 0000                   | versioned minutes, approval                             | `board.minutes`                                                                       |
| `documents`                | 0000                   | document metadata, category                             | `board.documents` (+ later Charter bylaws link, §4)                                   |
| `document_versions`        | 0000                   | file versions in storage                                | `board.document_versions`                                                             |
| `packets`                  | 0000                   | generated board packets                                 | `board.packets`                                                                       |
| `action_items`             | 0000                   | tasks, `assignee_id` (user)                             | `board.action_items`, `assignee_id → auth.users`                                      |
| `meeting_templates`        | 0001                   | agenda outline as JSON                                  | `board.meeting_templates`                                                             |
| `vote_electorate`          | 0003                   | frozen electorate per live vote (immutable)             | `board.vote_electorate` (users only)                                                  |
| `member_votes`             | 0003, 0006             | individual votes incl. `recused` (immutable)            | `board.member_votes` (users only)                                                     |
| `organization_letterheads` | 0007                   | active letterhead file, header/footer space             | `board.letterheads`                                                                   |
| (new)                      | —                      | org settings                                            | `board.org_settings` (§2.1)                                                           |
| (new)                      | —                      | officer overlay                                         | `board.officers` (§2.2)                                                               |
| (new)                      | —                      | people without accounts                                 | `board.people` (§2.3)                                                                 |

Final table names are settled in the baseline PR (step 5), with the code renames they need. **Views:** none today.

### 1.4 Functions

| Function                                                                                                                                    | Kind                  | Destination                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `is_org_member(_org)`                                                                                                                       | RLS helper            | **Core** `public.is_member`                                                                                                                      |
| `has_org_role(_org, _roles)`                                                                                                                | RLS helper            | **Core** `public.has_role`                                                                                                                       |
| `can_manage_org(_org)`                                                                                                                      | RLS helper            | **Core** `public.has_role(org, '{owner,admin}')`; for Board writes, `board.can_manage(org)` = that **and** `public.can_write(org,'board')`       |
| `can_edit_records(_org)`                                                                                                                    | RLS helper            | `board.can_edit_records(org)` = `public.can_write(org,'board')` and (owner/admin or office ∈ chair, secretary). Board's write helper (spec §3.4) |
| `shares_org_with(_user)`                                                                                                                    | RLS helper            | Covered by the core `profiles` policy. Dropped                                                                                                   |
| `vote_is_closed(_motion)`                                                                                                                   | RLS helper            | `board.vote_is_closed`                                                                                                                           |
| `create_organization(_name, _timezone)`                                                                                                     | RPC                   | **Core** `public.create_organization(p_name)`. Timezone lives in `board.org_settings` (missing row = defaults)                                   |
| `create_invitation`, `accept_invitation`                                                                                                    | RPC                   | **Core** (§2.5). Board adds `board.on_invitation_accepted(p_invitation_id)`                                                                      |
| `ownership_transfer_candidates`, `transfer_ownership`                                                                                       | RPC                   | **Core.** Not recreated in Board; `memberships_one_owner` not recreated either                                                                   |
| `start_vote`, `cast_vote`, `close_vote`, `vote_progress`, `record_disposition`, `finish_vote`                                               | live-voting RPCs      | `board.*`; the writing ones also require `public.can_write(org,'board')`, so voting stops when the org is read-only                              |
| `handle_new_user`                                                                                                                           | trigger, `auth.users` | **Core** (reads `full_name`/`name` into `display_name`)                                                                                          |
| `audit_row`                                                                                                                                 | trigger               | `board.audit_row`, on `board.*` only. Core table history is the hub's (`hub.audit_log`)                                                          |
| `check_meeting_org`, `check_committee_org`, `check_document_org`, `check_packet_path`, `check_motion_agenda_org`, `check_term_position_org` | same-org triggers     | `board.*`                                                                                                                                        |
| `lock_approved_minutes`, `lock_meeting_records`, `lock_distributed_packets`, `reject_vote_change`, `protect_live_motion`                    | record locks          | `board.*`, unchanged behaviour                                                                                                                   |
| `reset_demo()`                                                                                                                              | demo builder          | Replaced by `db/seed/0001_board_demo.sql`, staging only (§6)                                                                                     |

### 1.5 Triggers

- `auth.users`: `on_auth_user_created` → `handle_new_user`. Core-owned.
- Same-org: `t_org_agenda`, `t_org_att`, `t_org_mot`, `t_org_min`, `t_org_doc`, `t_org_pkt`, `t_org_act`, `t_org_cm`, `t_org_dv`, `t_pkt_path`, `t_mot_agenda`, `t_org_term_pos`.
- Locks: `t_lock_minutes`, `t_lock_motions`, `t_lock_attendance`, `t_lock_packets`, `t_live_motion`, `t_immutable` (×2).
- Audit: `t_audit` on 15 tables from the 0000 loop (including `organizations`, `memberships`, `invitations`, which Board no longer audits), plus `meeting_templates`, `board_positions`, `organization_letterheads`, and insert-only on `member_votes` and `vote_electorate`.

### 1.6 Indexes and constraints kept

`motions_one_open_vote`, `meeting_templates (organization_id, name)` unique, `board_positions (organization_id, title)` unique, `minutes (meeting_id, version)`, `packets (meeting_id, version)`, `document_versions (document_id, version)`, the letterhead path check (now `board-files`), and the vote-setting checks on `organizations` (`org_vote_close_modes_chk`, `org_vote_timer_chk`, `org_decision_rule_chk`), which move with their columns to `board.org_settings`. `memberships_one_owner` is **not** kept: the core enforces one owner.

### 1.7 Storage

| Today                                                                                                                  | Shared project                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Private bucket `org-files`, paths `<org id>/…`, letterheads `<org id>/letterhead/…`                                    | Private bucket **`board-files`**, same paths                                                                                            |
| select: `is_org_member`; insert: `can_edit_records`; restrictive letterhead insert: `can_manage_org`; no update/delete | select: `public.is_member`; insert: `board.can_edit_records`; restrictive letterhead insert: `board.can_manage`; still no update/delete |
| 60-second signed URLs                                                                                                  | unchanged                                                                                                                               |

Files in the old project are demo only and are not copied.

### 1.8 Edge Functions, cron, realtime

- Edge Functions: **none**, and the suite uses none (spec §2).
- Cron: `reset-demo-org` (pg_cron). Dropped; staging reset runs from `staging.yml` (§6).
- Realtime: not used (the live meeting dashboard polls).

## 2. Mapping onto core

### 2.1 Organizations → `board.org_settings`

Core `public.organizations` has `id, name, slug, created_by, created_at`. Board's extra columns move to `board.org_settings (org_id pk → public.organizations on delete cascade)`: `timezone`, `quorum_count`, `vote_recording`, `vote_close_modes`, `vote_timer_minutes`, `vote_closer_roles`, `seconder_required`, `decision_rule`. A missing row reads as today's defaults, so orgs created in the hub need no setup in Board. Writes need `board.can_manage`.

Create, rename and delete use the core functions (`create_organization`, `rename_organization`, `delete_organization`): hosted, Board links to the hub; self-hosted, Board's own screens call them. Org names are limited to **120 characters** (core); the UI limit drops from 160.

### 2.2 Roles: core role + Board office

| Board role today | Can today                                 | Core role | `board.officers` office |
| ---------------- | ----------------------------------------- | --------- | ----------------------- |
| Owner            | everything, transfer ownership            | `owner`   | —                       |
| Administrator    | manage org, invite, edit records, export  | `admin`   | —                       |
| Chair            | edit records, approve minutes, read audit | `member`  | `chair`                 |
| Secretary        | edit records, approve minutes, read audit | `member`  | `secretary`             |
| Treasurer        | read only                                 | `member`  | `treasurer`             |
| Board member     | read only (update own tasks, vote)        | `member`  | —                       |
| Observer         | read only                                 | `viewer`  | —                       |

- `board.officers (org_id, user_id, office board.office, pk (org_id, user_id))`, managed by owner/admin in Board in **both** modes. An officer must hold core `member` or higher (a viewer can't be chair).
- `board.can_edit_records(org)` = `public.can_write(org,'board')` and (`public.has_role(org,'{owner,admin}')` or office ∈ chair, secretary). Minutes approval and audit reading use the same rule (audit reading without `can_write`, since it's a read).
- `board.org_settings.vote_closer_roles` holds a mix of offices and core roles (e.g. `{owner,admin,chair,secretary}`), stored as text with a check constraint.
- `src/lib/permissions.ts` becomes a table over (core role, office); `src/lib/board.test.ts` and the docs page `board/people/roles.md` change with it.
- Live voting: who may vote is unchanged (present, voting attendees who are signed-in members).

### 2.3 People: users and non-users

`board_terms`, `committee_members`, `attendance`, `vote_electorate` and `member_votes` store `person_name` plus an unconstrained `user_id`. After the move:

- `user_id uuid references auth.users(id) on delete set null` where the person has an account;
- `board.people (id, org_id, full_name, email, notes)` for people without one (external directors, guests);
- `terms`, `committee_members` and `attendance` hold `user_id` **or** `person_id` (check: at most one; both null allowed only for legacy free-text rows in the seed, decided in step 5), and keep `person_name` as a snapshot so official records don't change when someone renames their profile;
- `vote_electorate` and `member_votes` stay user-only.

### 2.4 Profiles and the member directory

Board's members list and ownership-transfer candidates read `profiles.full_name` and `profiles.email` today. They switch to the core `public.org_member_directory(p_org)` (`user_id, display_name, email, role`) and `public.ownership_transfer_candidates(p_org)`.

### 2.5 Invitations

- One implementation: `public.invitations` and the core functions (`create_invitation`, `get_invitation`, `accept_invitation`, `revoke_invitation`, `list_invitations`), 14-day expiry.
- Hosted: the hub creates invitations and sends the email. An invitation with `app = 'board'` links to `https://board.openapphub.org/invite/<token>`.
- Board keeps its `/invite/<token>` page, rebuilt on `shared/ui/InvitationPage`: `get_invitation` → sign-in (hub when hosted, Board's own when self-hosted) → `public.accept_invitation` → `board.on_invitation_accepted(p_invitation_id)` when `app = 'board'`.
- `board.on_invitation_accepted(p_invitation_id)`: `security definer`; checks `accepted_by = auth.uid()`, `app = 'board'`, and that the invitation's role is `member` or higher if an office is given; applies `app_payload` (`{ "office": "secretary" }`) by upserting `board.officers`. Idempotent.
- Self-hosted: Board's members screen creates invitations through the same core functions and shows the link to copy, as today.

### 2.6 Ownership

Core only. Hosted: Board's Settings → Transfer ownership links to the hub. Self-hosted: `src/components/TransferOwnership.tsx` calls `public.transfer_ownership` and `public.ownership_transfer_candidates`. Board's typed-name confirmation stays in the UI (the core function takes no confirmation argument).

## 3. Every place the code calls Supabase

Nearly all calls are in one file (the data-layer rule in `AGENTS.md`, `src/data/data-layer.test.ts`).

| File                                                | What                                                                                                                            | Changes in          |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------- |
| `src/integrations/supabase/client.ts`               | `createClient` (supabase-js) with a preview sign-in storage helper (lines 74–79)                                                | step 3, 9           |
| `src/integrations/supabase/client.server.ts`        | Service-role admin client. **Imported nowhere**; Board needs no service role (spec §7.2)                                        | step 3 (delete)     |
| `src/integrations/supabase/auth-middleware.ts`      | Server-function middleware: `auth.getClaims(token)` (line 88)                                                                   | kept                |
| `src/integrations/supabase/auth-attacher.ts`        | Attaches the `getSession()` token to server-function calls (`src/start.ts:4`)                                                   | kept                |
| `src/integrations/supabase/cron-auth.ts`            | cron-secret helper, unused                                                                                                      | step 3 (delete)     |
| `src/routes/_authenticated/route.tsx:7`             | `auth.getUser()` route guard → hosted redirects to `${VITE_HUB_URL}/login?next=…`                                               | step 11             |
| `src/data/cloud-adapter.ts` — auth (44–72)          | `getSession`, `onAuthStateChange`, `signInWithPassword`, `signUp`, `signInWithOAuth` (third-party broker for Google), `signOut` | step 3 (Google), 11 |
| `src/data/cloud-adapter.ts` — org (78–115)          | `memberships` select, `create_organization`, `organizations` update, `ownership_transfer_candidates`, `transfer_ownership`      | step 9–11           |
| `src/data/cloud-adapter.ts` — export (117–130)      | `EXPORT_TABLES` (line 16), `select *` by `organization_id`                                                                      | step 10, 13         |
| `src/data/cloud-adapter.ts` — letterhead (133–160)  | `organization_letterheads`, storage upload                                                                                      | step 9–10           |
| `src/data/cloud-adapter.ts` — members (165–217)     | `memberships` by **`id`**, `profiles`, `invitations`, `create_invitation`, `accept_invitation`                                  | step 9–11           |
| `src/data/cloud-adapter.ts` — governance (222–299)  | `board_terms`, `board_positions`, `committees`, `committee_members`                                                             | step 9–10           |
| `src/data/cloud-adapter.ts` — meetings (304–414)    | `meetings`, `agenda_items`, `attendance`, `motions`, `minutes`                                                                  | step 9–10           |
| `src/data/cloud-adapter.ts` — files (419–476)       | `documents`, `document_versions`, `packets`; storage `upload`, `createSignedUrl(path, 60)`, `download` on `org-files`           | step 9–10           |
| `src/data/cloud-adapter.ts` — dashboard (481–550)   | `meetings`, `documents`, `action_items`, `minutes`                                                                              | step 9–10           |
| `src/data/cloud-adapter.ts` — audit (560)           | `audit_log`                                                                                                                     | step 9–10           |
| `src/data/cloud-adapter.ts` — live voting (580–640) | `start_vote`, `cast_vote`, `close_vote`, `record_disposition`, `vote_progress`; `vote_electorate`, `member_votes`               | step 9–10           |
| `src/data/cloud-adapter.ts` — templates (645–676)   | `meeting_templates`                                                                                                             | step 9–10           |
| `src/data/platform.ts:14`                           | Backend named after the old host                                                                                                | step 3              |
| `src/lib/org-context.tsx:36`                        | Current org in `localStorage` → `oah_org` cookie via `shared/supabase/org.ts`                                                   | step 10             |
| `src/routes/auth.tsx:110`                           | "Try the demo" button signs in with the demo credentials                                                                        | step 6              |
| `src/test/db/helpers.ts:18–19`                      | Live DB tests sign in with the publishable key                                                                                  | step 8              |
| Type-only imports                                   | `MinutesTab.tsx:17`, `PacketTab.tsx:13`, `SaveAsTemplate.tsx:8`, `board.members.tsx:11` import `Tables` from `types.ts`         | step 9              |

Every query already filters by `organization_id`; step 10 renames it to `org_id` through `shared/supabase/org.ts`, and the members screen addresses memberships by `(org_id, user_id)` instead of `membership.id`.

## 4. Data Board shares with the other apps

**Today: none.** Board stores no Charter or Ledger data and calls no other app.

Settled for v2 (spec §3.6):

- **Publish** (step 14), both `with (security_invoker = true)`:
  - `board.api_meetings`: `id, org_id, title, meeting_date, status`;
  - `board.api_decisions`: `id` (motion), `org_id, meeting_id, title` (motion text), `date` (meeting date), `status` (outcome).
- **Consume later:** Charter bylaw documents, once Charter publishes them, as an optional `documents.charter_document_id` (feature-detected; hidden when `charter` is missing).
- Other ideas (Ledger budgets on budget motions, Ledger reports in packets, Charter `api_board_seats` against Board positions) are proposed as issues, not built.

## 5. Secrets (step 2 report)

Scanned the working tree and all 155 commits (`git log --all -p`) on November 8, 2026 for:

| Pattern                                                                             | Found                                                                                            |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `sb_secret_…` (Supabase secret key)                                                 | none                                                                                             |
| JWT-shaped keys (`eyJ….eyJ…`, e.g. legacy service_role)                             | none                                                                                             |
| `sk_live_` / `sk_test_` (Stripe), `whsec_` (Stripe webhook)                         | none                                                                                             |
| `postgres://user:password@host` connection strings                                  | one template only: `postgresql://${user}:…@${host}:5432/${name}` in `supabase-db.yml` (no value) |
| Private keys, GitHub tokens (`ghp_`), Resend keys, Google OAuth secrets (`GOCSPX-`) | none                                                                                             |
| `sb_publishable_…` (Supabase publishable key)                                       | 2: the old project's and Board's own project's. **Public by design**; no action needed           |

**Result: no secrets to rotate.** Notes:

- `.env` is tracked and holds only publishable values (guarded by `scripts/ci/check-env.mjs`). Step 3 untracks it (spec §7.1).
- The demo account's password is intentionally public today. It was removed from `AGENTS.md` in this PR; it stays in `src/routes/auth.tsx` and the demo migration until step 6 moves the demo to staging with new `@demo.openapphub.org` accounts. It protects nothing real (the account only reaches the demo org).
- Owner: turn on GitHub secret scanning and push protection for this repo (spec §7.1).

## 6. Demo data

Today `public.reset_demo()` builds "Riverside Community Association" (`d0000000-0000-0000-0000-000000000001`), writing directly into `auth.users`, `auth.identities`, `public.organizations`, `public.memberships` and `public.profiles`, and pg_cron reruns it every 6 hours.

Plan (owner answer D5, spec §11):

- Step 6 rewrites it as idempotent `db/seed/0001_board_demo.sql`, run only by `staging.yml` (`migrate.mjs --seed`). It refuses to run when the database has non-demo organizations.
- Demo accounts move to `@demo.openapphub.org`. The password is shown only on staging's sign-in page (a staging-only Worker var), never in the repo.
- The six-hourly reset becomes a scheduled `staging.yml` run, not `pg_cron`.
- Whether the seed may create `auth.users` rows itself, or the hub's demo-org registry (`hub` schema) creates the accounts and org and Board seeds only `board.*`, depends on the hub's seed design (spec §11: "the hub owns demo organizations"). Settled in step 6.
- Production gets no demo. The old project's demo disappears when it is wiped.
- Step 7 (export helper) is skipped.

## 7. Conflicts with the spec and replaced repo rules

### 7.1 Conflicts (all settled by v2)

| #   | Conflict                                                                                                         | Settled                                                                                                          |
| --- | ---------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| C1  | Board is TanStack Start SSR on Cloudflare Workers, not Pages                                                     | Workers for every app (spec §2, §10). Headers in `src/server.ts`; no `_headers`/`_redirects`                     |
| C2  | `vite.config.ts` wraps a third-party config package                                                              | Replaced with the plain plugins in step 3                                                                        |
| C3  | `supabase-db.yml` (`supabase db push`) and `drizzle/`                                                            | `supabase-db.yml`'s push job is retired in step 4; `supabase/migrations/` and `drizzle/` are deleted in step 5   |
| C4  | Board audited `organizations`/`memberships`/`invitations`                                                        | Board audits `board.*` only; core history is the hub's `hub.audit_log`                                           |
| C5  | One owner + transfer were Board migrations on `public.memberships`                                               | Core (spec §3.2, §4.4)                                                                                           |
| C6  | Current org in `localStorage`                                                                                    | `oah_org` cookie, step 10                                                                                        |
| C7  | 7-value `org_role`                                                                                               | Core 4 roles + `board.officers` (§2.2)                                                                           |
| C8  | Google sign-in via a third-party broker                                                                          | Plain `supabase.auth.signInWithOAuth` self-hosted (step 3); hub when hosted                                      |
| C9  | Repo connected to the old editor                                                                                 | Done: disconnected by the owner                                                                                  |
| C10 | Spec §3.4 names the write helper `board.can_edit(org)`; Board's v2 answers name it `board.can_edit_records(org)` | Board uses `can_edit_records` (and `can_manage`), the "finer helpers" spec §3.4 allows; both include `can_write` |

### 7.2 Current `AGENTS.md` rules and when they change

| Rule (AGENTS.md "Current architecture rules")                                                                    | Replaced by                                                           | Step   |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ------ |
| Tenancy (`organization_id`, `is_org_member`…)                                                                    | `org_id`, core helpers, `board.can_edit_records` / `board.can_manage` | 5, 10  |
| Permissions (`CAPABILITIES`, 7 roles)                                                                            | (core role, office) table                                             | 5, 10  |
| Data access (`db` from `src/data`)                                                                               | kept; adapter uses `shared/supabase/client.ts`                        | 9      |
| Audit (every tenant table)                                                                                       | `board.*` tables only                                                 | 5      |
| Invites (Board RPCs)                                                                                             | core invitations + `board.on_invitation_accepted`                     | 5, 11  |
| Ownership (`memberships_one_owner`, Board RPC)                                                                   | core `transfer_ownership`; hosted links to the hub                    | 5, 11  |
| Files (`org-files`)                                                                                              | `board-files`                                                         | 5, 9   |
| Routing (public site at `/`, org in localStorage)                                                                | hosted: no landing, `oah_org` cookie                                  | 10, 11 |
| Demo (`reset_demo`, pg_cron)                                                                                     | staging-only seed + scheduled `staging.yml`                           | 6      |
| Tests (`src/test/db` against the live backend)                                                                   | `db/tests/*.sql` + the existing suites against a local stack          | 8      |
| CI (`ci.yml` jobs)                                                                                               | + `db` job, `staging.yml`, `release.yml`, `migrate.yml`               | 3, 4   |
| Cloudflare (`wrangler.jsonc` overrides only)                                                                     | `staging` and `production` environments                               | 3      |
| Old editor note                                                                                                  | removed (S-07)                                                        | 3      |
| Official records, live voting, recusal, templates, board roles, PDFs, letterhead, exports, npm only, attribution | kept, in `board.*`                                                    | —      |

## 8. Owner decisions

| #   | Question             | Answer (v2)                                                                                                            |
| --- | -------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| D1  | Role mapping         | Keep today's rule with `board.officers`; treasurer and board member = core `member`, observer = `viewer`               |
| D2  | Ownership            | Core; transferred in the hub (hosted) or Board's screen calling the core function (self-hosted)                        |
| D3  | Profiles             | Core `org_member_directory(p_org)`; `handle_new_user` reads `full_name`/`name`                                         |
| D4  | Invitations          | Core, handled by the hub; Board keeps `/invite/<token>` on `shared/ui/InvitationPage` + `board.on_invitation_accepted` |
| D5  | Demo                 | Staging only, `@demo.openapphub.org`, reset by scheduled `staging.yml`, password only on staging's sign-in page        |
| D6  | Integrations         | Publish `api_meetings`, `api_decisions`; consume Charter bylaws later                                                  |
| D7  | Hosting              | Cloudflare Workers; headers in `src/server.ts`                                                                         |
| D8  | Owner inputs         | Filled in (spec §0.1). Design is a full refresh for every app                                                          |
| —   | Step 7 export helper | Skipped                                                                                                                |

No open questions for steps 2–3.

## 9. Dependencies on other repos

- **`Nox-Mob/OpenAppHub` exists but holds only a README** (checked November 8, 2026). Step 4 (vendor `shared/`, `db/core/`, `scripts/migrate.mjs`) and everything that needs the core waits for the hub's Phase 1–2. Step 3 can go ahead.
- Docs: `Nox-Mob/OpenAppHub-docs`, folder `src/content/docs/board/` (steps 16–17 and every user-facing PR).
- Production order (START-HERE): Charter park → hub core + billing → Charter baseline → **Board baseline** → Ledger baseline → wipe Board's old project, make it staging, run `staging.yml` everywhere.

## 10. Progress

| Step  | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Status                           |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| 1     | Inventory (this file)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | **This PR**                      |
| 2     | Secret scan report (§5)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **This PR** (clean)              |
| 3     | Hygiene: `.env.example`, untrack `.env`, `.gitignore`; remove the old editor's tooling (Vite wrapper, OAuth broker, preview sign-in storage, `cron-auth.ts`, error reporting, platform name, lockfile cache URLs, README); plain Google OAuth; delete unused `client.server.ts`; security headers in `src/server.ts`; `wrangler.jsonc` `staging`/`production` envs; `staging.yml` and `release.yml` (skip with a notice until secrets exist); switch off any build that deploys production from `main`; owner step: disconnect the old editor | **done** (S-07)                  |
| 4     | Vendor `shared/`, `db/core/`, `scripts/migrate.mjs`; `migrate.yml`, CI `db` job, `oahShared` version check; retire `supabase-db.yml`'s push job; point `check-migrations.mjs` at `db/`                                                                                                                                                                                                                                                                                                                                                        | **Done** (§0.4)                  |
| 5     | `db/migrations/0001_board_baseline.sql`: tables of §1.3 in `board` (template §3.4), `org_settings`, `officers`, `people`, `can_edit_records`/`can_manage`, live-vote RPCs gated by `can_write`, `board-files`, `on_invitation_accepted`; delete `supabase/migrations/`, `drizzle/`, `drizzle.config.ts`, `supabase/config.toml` project ref                                                                                                                                                                                                   | **Done** (§0.4)                  |
| 6     | `db/seed/0001_board_demo.sql` (§6); scheduled `staging.yml`; demo credentials out of `auth.tsx`                                                                                                                                                                                                                                                                                                                                                                                                                                               | Blocked: step 5, hub seed design |
| 7     | Export helper                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Skipped (owner)                  |
| 8     | DB tests: isolation, viewer, read-only on expiry, officer overlay, live vote refused when read-only, `on_invitation_accepted`                                                                                                                                                                                                                                                                                                                                                                                                                 | **Done** (§0.4)                  |
| 9     | `shared/supabase/client.ts` (`VITE_APP_SCHEMA=board`), `.schema('public')` for core, regenerate types (`gen-types.yml`)                                                                                                                                                                                                                                                                                                                                                                                                                       | Blocked: step 4–5                |
| 10    | Org scoping via `shared/supabase/org.ts`; memberships by `(org_id, user_id)`                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Blocked: step 9                  |
| 11    | Hosted vs self-hosted: hosted links to the hub for sign-in, org create/rename/delete, core roles, invitations, ownership; officers stay in Board; `/invite/<token>` on `InvitationPage`                                                                                                                                                                                                                                                                                                                                                       | Blocked: step 9                  |
| 12    | `BillingBanner`, write controls off when read-only, link to hub billing                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Blocked: step 9                  |
| 13    | Export of all Board data, available when read-only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Blocked: step 10                 |
| 14    | `board.api_meetings`, `board.api_decisions`; `docs/INTEGRATION.md`                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | Blocked: step 5                  |
| 15    | Full design refresh: shared tokens and `AppShell`, separate PRs, before/after screenshots, behaviour and text unchanged                                                                                                                                                                                                                                                                                                                                                                                                                       | Blocked: hub design direction    |
| 16    | Help links (`src/config/help.ts`, table in `AGENTS.md`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Blocked: `shared/docs.ts`        |
| 17    | Docs PR (`board/people/roles.md` first; getting-started, settings, inviting, help pages)                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Blocked: steps 9–15              |
| Final | Owner steps to retire the old project and reuse it as staging (Worker vars, wipe schemas and auth users, `STAGING_DATABASE_URL`/`STAGING_REF`, run `staging.yml` in every repo)                                                                                                                                                                                                                                                                                                                                                               | Listed in the last Phase 2 PR    |
