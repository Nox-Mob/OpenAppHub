# OpenBoard architecture

## In short

OpenBoardApp is one web app. It talks to one database (Supabase). There are no extra servers, queues or offline copies.

- **Screens** never talk to the database directly. They go through one doorway, `src/data`. A test fails if a screen skips it.
- **The database is the real guard.** Its rules decide who can see each organization's records, lock approved minutes, and count votes in one step. Checks in the browser just make the screens friendlier.
- **Documents are made in the browser.** PDFs and zip files are built on your own computer, not on the server.
- The table below says, for each part of the app, whether it's built and how well it's tested.

One board-management application backed by Supabase (the OpenAppHub suite's shared project when hosted, your own when self-hosted): PostgreSQL, authentication and private file storage. No microservices, queues, offline database or synchronization engine.

```text
React screens (src/routes, src/components)
        |
Data facade (src/data/index.ts)              db + attempt
        |
Platform detection (src/data/platform.ts)
        |
Cloud adapter (src/data/cloud-adapter.ts)    authenticated reads, writes, RPCs, files
        |
Database guards                            RLS, same-org triggers, locks, atomic RPCs

Shared rules (src/lib)                      permissions, votes, terms, templates, exports
Client-side documents                      pdf-lib + fflate; private files via db
```

Status labels used below: **Implemented and tested**, **Implemented, partly verified**, **Planned**, **Not supported**. Tests describe the checks present in the repository, not a guarantee that a particular deployment's latest CI run passed.

## Layers

- **Screens** use `db` from `@/data`, not database or storage clients. React Query manages caching, invalidation and live-meeting polling. Shared `EmptyState`, `LoadingState` and `ErrorState` components live in `src/components/PageStates.tsx`.
- **Data facade** (`src/data/index.ts`) selects the configured adapter and exports its `DataLayer` type. `attempt()` converts a rejected data call into a `{ data, error }` result for form handlers.
- **Platform detection** (`src/data/platform.ts`) recognizes Supabase when both public connection settings exist. An unconfigured platform fails explicitly. There is currently only one adapter; the abstraction does not imply SQLite, self-hosting or offline support.
- **Cloud adapter** (`src/data/cloud-adapter.ts`) owns authentication, table queries, private file operations and governance RPC calls. Ordinary requests run as the signed-in user under row-level security. `DataLayer` is currently inferred from this adapter rather than defined as an independent ports package.
- **Shared rules** (`src/lib`) contain browser-safe permission, voting, title, template, minutes and export helpers. There is no separate services/domain/ports hierarchy.
- **Database guards** enforce organization isolation, permissions, parent-link consistency, audit history, official-record locks and atomic live voting. Client-side checks improve the experience but are not the security boundary.
- **Document generation** uses `pdf-lib` for PDFs and `fflate` for ZIP archives in the browser. This avoids Node-only document processing in the deployed worker runtime.

`src/data/data-layer.test.ts` rejects direct database-client imports in screens and shared helpers. The generated sign-in gate in `src/routes/_authenticated/route.tsx` is the explicit exception. This check is an import-boundary check, not a full analysis of every possible storage call.

## Status by area

| Area                                                                                                | Status                                                                      |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Organization isolation and same-organization parent links                                           | Implemented and tested with live database checks                            |
| Role/capability matrix and database permissions                                                     | Implemented and tested                                                      |
| Organization creation and one-time invitation acceptance                                            | Implemented and tested through database-rule suites                         |
| Board positions, term lengths, holder history and title resolution                                  | Implemented; pure title/term rules tested                                   |
| Meetings, agendas, attendance and action items                                                      | Implemented, partly verified through page tests and related database checks |
| Meeting templates and copied agenda outlines                                                        | Implemented and tested                                                      |
| Live member voting, frozen electorate and immutable ballots                                         | Implemented and tested with unit and live database checks                   |
| Per-agenda-item decision rules and member recusal                                                   | Implemented and tested                                                      |
| Live quorum indicator                                                                               | Implemented; related attendance/voting rules tested                         |
| Approved minutes and official-record locks                                                          | Implemented and tested                                                      |
| Standalone minutes PDF and board packet generation                                                  | Implemented and tested                                                      |
| PNG/JPG/PDF organization letterhead                                                                 | Implemented and tested, including database access rules                     |
| Private document library and versioned packets                                                      | Implemented, partly verified                                                |
| Board-record ZIP export and CSV formula escaping                                                    | Implemented; export-selection and formatting rules tested                   |
| Data-layer import boundary and platform detection                                                   | Enforced by tests in CI                                                     |
| Reminders and backup-restore drill                                                                  | Planned; open roadmap items                                                 |
| Offline/desktop storage, cloud sync and alternate adapters                                          | Not supported                                                               |
| AI transcription, secret ballots, e-signatures, calendar/video integrations, accounting and billing | Outside v0.1 scope                                                          |

## Where rules live

- `src/lib/permissions.ts`: the single `CAPABILITIES` matrix for Owner, Administrator, Chair, Secretary, Treasurer, Board member and Observer. Database helpers must mirror it; `src/lib/board.test.ts` pins the matrix.
- `src/lib/votes.ts`: present attendees, roll-call parsing, tallying, decision rules, recusal and official-record parsing. Database vote finalization must agree with the supported calculations here.
- `src/lib/titles.ts`: current holders, term-end calculations and `Name — Title` formatting. `useTitles()` in `src/lib/org-context.tsx` supplies current titles to screens; packets resolve holders against the meeting date.
- `src/lib/templates.ts`: agenda normalization and copying, including vote-item flags and rule overrides. Later template edits do not alter meetings already created.
- `src/lib/minutes.ts`: assembling minutes content from meeting records.
- `src/lib/board-export.ts`: date-range validation, meetings that took place, packet/document selection as of the meeting day, safe folder names and record CSVs.
- `src/lib/export.ts`: CSV generation and escaping formula-looking values.
- `src/lib/letterhead.ts`: supported file inspection and shared stationery preparation; `src/lib/packet.ts` renders generated PDFs.

Database constraints, policies and triggers remain authoritative for permissions, uniqueness, same-org links and immutability. Do not move a database security rule into UI-only validation.

## Tenancy and permissions

Tenant-owned records carry `organization_id`. Row-level security uses security-definer helpers such as `is_org_member`, `can_edit_records` and `can_manage_org`; same-org triggers reject links to another organization's parent records.

Organization management and invitations belong to owners/admins. Record editing and minutes approval also include chairs/secretaries. All membership roles may read ordinary organization records; audit access and export controls use the capability matrix. Special operations, including live-vote opening and closing, enforce their own database rules and organization settings.

Board titles are governance positions, not access roles. Assigning someone "Membership VP" changes their term/title, not their portal permissions. `board_positions` defines a role and its term length; `board_terms` stores holder history and may link a term to the member's account through `user_id`.

## Changes and history are saved together

The `audit_row` trigger records tenant-table changes in `audit_log` in the same database transaction as the triggering write. Users cannot directly insert, update or delete audit rows.

- Organization creation and invitations use security-definer RPCs: `create_organization`, `create_invitation` and `accept_invitation`.
- Live voting uses atomic RPCs described below.
- Ordinary adapter writes use table operations protected by policies and triggers.

Multi-step changes are atomic (B-11, migration `0008_atomic_changes.sql`). Each is one security-invoker RPC, so row-level security, locks and the audit trigger apply exactly as for table writes:

| Change                                                                  | RPC                                                                                                                          |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| A meeting and its starting agenda                                       | `board.create_meeting_with_agenda(p_org, p_title, p_meeting_date, p_start_time, p_location, p_agenda jsonb)`                 |
| Handing a role over: open terms end the day before, the new term starts | `board.assign_term(p_org, p_position_id, p_position, p_person_name, p_user_id, p_start_date, p_end_date)`                    |
| A document and its first version                                        | `board.add_document(p_id, p_org, p_title, p_category, p_meeting_id, p_storage_path, p_file_name, p_mime_type, p_size_bytes)` |

A file in Storage and its row can't share a database transaction, so the adapter (`withUploadedFile` in `src/data/cloud-adapter.ts`) uploads first, writes the record, and removes the uploaded object if the write fails (documents and their versions, packets, the letterhead). A new document's id is made in the browser so its storage path is known before the upload.

## Reminders are automations

`board.queue_email_reminders()` (an email job every 15 minutes) reads each organization's settings from the core automation engine (S-25, migration `0009_automation_reminders.sql`): `board.meeting_reminders` (`days_before`, default `[7, 1]`) and `board.action_item_reminders` (`days_before`, default 2; `when_overdue`, default on). Owners and admins change them on the Email page (shared `AutomationsPanel`) or in the hub's organization settings. The job records what it did per organization with `public.log_automation`. De-duplication keys are those of 0006, so switching to the engine re-sent nothing. Design: [`../automation-engine.md`](../automation-engine.md).

## Live voting and official records

The member dashboard is `src/routes/_authenticated/board.live.$meetingId.tsx`. It polls for meeting state, attendance and vote progress; it is not an online-presence service.

- Votes can open and be cast only while the meeting is `in_progress`.
- Only one motion may be open for voting per meeting, enforced by a partial unique index.
- `start_vote` freezes the eligible electorate into `vote_electorate`. Later attendance changes do not grant access to that already-open vote.
- `cast_vote` checks the authenticated identity, frozen eligibility, meeting state, vote state and whether the member has already voted. A unique constraint prevents duplicate ballots.
- Opening, casting and closing lock the motion row, preventing cast/close races. Ballots and electorate rows are immutable; `protect_live_motion` blocks direct edits to live-vote records.
- The confirmation dialog warns that the vote is official and cannot be changed. The database enforces this regardless of the dialog.
- `close_vote` and internal finalization snapshot the electorate, vote counts, abstentions, recusals, non-voters, quorum, effective decision rule, result and opening/closing facts into the official motion record.
- An agenda item's `decision_rule` overrides the organization default when set; `null` means use the default. The effective rule is captured at opening, not looked up again after the vote.
- Recused members are excluded from the majority-of-present denominator in both database `finish_vote` and shared `computeDisposition`. Recusal is distinct from abstention.
- Unsupported rules or unmet quorum require an authorized disposition with an explanation through `record_disposition`, rather than an invented automatic result.

Approved/superseded minutes, protected meeting attendance and motions, and distributed packets have database-enforced locks. Amendments create a new minutes version rather than overwriting the approved text.

## Sign-in and sessions

Email/password and Google sign-in are exposed through `db.auth`. The protected pathless route `src/routes/_authenticated/route.tsx` disables SSR for signed-in screens, checks the current user and redirects unauthenticated visitors to `/auth`. Its child board layout uses `OrgProvider` to load memberships and select the current organization.

The public website is `/`; signed-in pages are under `/board`. The `_authenticated` folder name is not part of the public URL. The current organization ID is stored in browser local storage as `board.currentOrg`; it is a convenience preference, never proof of access.

Database requests still enforce membership and permissions. Being signed in does not mean a member is present at a meeting: attendance and its account link determine eligibility, and live votes use the frozen electorate. There is no "Online now" tracking.

`src/start.ts` configures error handling, CSRF protection for server functions and bearer-token attachment middleware. Current board data operations use the adapter's database API/RPC calls, not an application-wide server-function/services pipeline.

Invitation tokens are stored only as SHA-256 hashes and claimed once through `accept_invitation`. Invitations currently produce links for an administrator to share; do not describe this as an automated invitation-email service.

## Files, letterhead and generated documents

- Private files live in `org-files`; paths begin with the organization ID. Downloads opened by URL use 60-second signed links; document generation may download authenticated bytes through `db.files.download`.
- `documents` and `document_versions` hold document metadata/history. `packets` records generated versions and distribution status.
- `organization_letterheads` references active PNG, JPG or PDF stationery in private storage. Managers alone change it. Upload paths are unique; file inspection and preparation guidance cover each supported format.
- `prepareLetterhead` reserves header/footer space and paints generated pages. Existing packet attachments are merged without painting organization stationery over them.
- Minutes and generated packet pages use shared rendering in `src/lib/packet.ts`; `src/lib/load-letterhead.ts` loads active stationery through the data facade.

## Exports and backups

The settings screen offers table JSON/CSV exports and the full board-record ZIP in `src/components/BoardRecordExport.tsx`. CSV values are escaped to avoid spreadsheet formula execution.

The ZIP defaults to Year to date and accepts at most 366 inclusive calendar days. It includes meetings marked in progress, completed or archived, with one folder per meeting: approved minutes when available, vote records, attendance, and the selected packet/supporting document versions as of the meeting day. Missing approved minutes receive an explicit note. Unreadable packet/document downloads are currently skipped without a per-file warning, so the ZIP is not proof that every attachment was successfully included.

Selection rules are implemented in `src/lib/board-export.ts`: document versions must have existed by the end of the meeting date; packet selection prefers a distributed packet among packets created by that cutoff. This is date-based selection, not a full point-in-time database snapshot. Newly rendered minutes use the currently configured letterhead; saved packet PDFs retain their original rendering.

These are readable record exports, not a signed backup format or a tested restore mechanism. The generic table export's allowlist is `EXPORT_TABLES` in the cloud adapter; it does not export every internal table (for example, raw `member_votes` and `vote_electorate`). Closed-vote facts are available through motion snapshots. Backup restoration and its drill remain open roadmap work.

## Build and CI

- npm only: `package-lock.json` and `npm ci`. Alternate package-manager lockfiles are ignored and rejected by CI if present in the checkout.
- React 19, TanStack Start/Router, React Query, Vite and Tailwind CSS v4 form the application stack. Shared visual tokens live in `src/styles.css`; UI controls live in `src/components/ui`.
- TanStack routes live in `src/routes`; `src/routeTree.gen.ts` is generated. Preserve worker-compatible server boundaries; Node-based CI utilities are not application runtime modules.
- Schema changes live in `db/migrations` (schema `board`, on the suite core `db/core`, vendored from OpenAppHub). `scripts/migrate.mjs` applies them; the owner runs the Migrate workflow for staging and production. The app reads schema `board` (the Supabase client is created with `db: { schema: "board" }`) and core tables with `.schema("public")`; `src/data/cloud-adapter.ts` turns core roles plus offices into Board's single role per person. Staging demo data is `db/seed` (`npm run db:migrate -- --seed`).
- `.github/workflows/ci.yml` runs on pushes, pull requests, manual dispatch and a weekly schedule, using Node 22.
- Jobs cover npm-only enforcement, public-environment checks, data-layer boundary checks, unit/page tests, migration-policy checks, database-rule tests (`db/tests` on Postgres 17 with the runner), a performance check (one board through 5,000, 20,000 and 50,000 meetings), type checking, production build, lint, formatting and dependency audit.
- `scripts/ci/check-env.mjs` checks for private credentials in tracked environment configuration; `scripts/ci/check-migrations.mjs` checks migration security declarations. Static checks supplement, not replace, the database-rule tests.
- Production dependency audit blocks high/critical findings; the full audit including development tools is report-only.
- `db/tests/*.sql` (`npm run db:test`, needs `TEST_DATABASE_URL`) build a throwaway database with the runner and check isolation, permissions, record locks, live voting and invitations. `npm run db:perf` times the heavy reads at scale. Never point either at a real database.
- Page tests in `src/test/pages.test.tsx` and `src/test/app-routing.test.tsx` check rendering/routing with test fixtures. They are not comprehensive browser end-to-end coverage.

Useful local checks:

```sh
npm ci
npm run test:unit
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run db:test
node scripts/ci/check-env.mjs
node scripts/ci/check-migrations.mjs
npm run typecheck
npm run lint
npm run format:check
npm audit --omit=dev --audit-level=high
npm run build
```

## Maintaining this document

Keep architecture claims aligned with implemented code, migrations and test coverage. Record structural decisions in `AGENTS.md`, pending work in `roadmap.md`, and update this document when boundaries, security guarantees, export semantics or CI deployment assumptions change. Do not describe layers or deployment promises unless they are actually implemented here.
