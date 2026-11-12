# OpenBoardApp integration

What Board publishes for OpenAppHub and the other apps (SHARED-SPEC §3.6). Everything here is a
**read-only view** in schema `board`, created `with (security_invoker = true)`: it runs with the
caller's own row security, so a person sees exactly the rows they could read in Board itself
(members of the organization; nobody else; signed-out visitors nothing).

Rules for consumers:

- **Feature-detect.** On a database without Board (or before migration `0002`), the views don't
  exist. Treat "relation does not exist" (PostgREST `42P01` / `PGRST205`) as "Board isn't here" and
  hide the integration.
- **Never write.** Board exposes no write paths to other apps yet. A change in Board would go
  through a `security invoker` RPC documented here.
- **Columns are stable.** New columns are added at the end; none is removed or renamed.

Migration: [`db/migrations/0002_integration_views.sql`](https://github.com/Nox-Mob/openboardapp/blob/staging/db/migrations/0002_integration_views.sql).
Tests: [`db/tests/60_integration_views.sql`](https://github.com/Nox-Mob/openboardapp/blob/staging/db/tests/60_integration_views.sql).

## `board.api_meetings`

Meetings on the calendar: every status except `draft`.

| Column           | Type        | Meaning                                                                                              |
| ---------------- | ----------- | ---------------------------------------------------------------------------------------------------- |
| `id`             | uuid        | The meeting                                                                                          |
| `org_id`         | uuid        | The OpenAppHub organization                                                                          |
| `title`          | text        |                                                                                                      |
| `meeting_date`   | date        |                                                                                                      |
| `start_time`     | text        | As entered, for example `18:30`; may be null                                                         |
| `location`       | text        | May be null                                                                                          |
| `status`         | text        | `scheduled`, `in_progress`, `completed` or `archived`                                                |
| `minutes_status` | text        | Status of the latest minutes version: `draft`, `submitted`, `approved` or `superseded`; null if none |
| `motion_count`   | int         | Motions recorded at the meeting                                                                      |
| `created_at`     | timestamptz |                                                                                                      |

Example (the hub's dashboard: the next meeting):

```sql
select title, meeting_date from board.api_meetings
where org_id = :org and status = 'scheduled' and meeting_date >= current_date
order by meeting_date limit 1;
```

## `board.api_decisions`

Decisions: motions with an outcome (`pending` motions are left out).

| Column                                                    | Type        | Meaning                                          |
| --------------------------------------------------------- | ----------- | ------------------------------------------------ |
| `id`                                                      | uuid        | The motion                                       |
| `org_id`                                                  | uuid        | The OpenAppHub organization                      |
| `meeting_id`                                              | uuid        | Meeting it was made at                           |
| `meeting_title`                                           | text        |                                                  |
| `meeting_date`                                            | date        |                                                  |
| `motion_text`                                             | text        |                                                  |
| `outcome`                                                 | text        | `carried`, `failed`, `tabled` or `withdrawn`     |
| `votes_yes`, `votes_no`, `votes_abstain`, `votes_recused` | int         | The vote count                                   |
| `decided_at`                                              | timestamptz | When the vote closed or the outcome was recorded |

Example (recent decisions):

```sql
select motion_text, outcome, meeting_date from board.api_decisions
where org_id = :org order by decided_at desc limit 5;
```

## `board.api_action_items` (S-15)

Action items, for the hub's task list (it shows each person the open ones assigned to them).

| Column          | Type        | Meaning                                                    |
| --------------- | ----------- | ---------------------------------------------------------- |
| `id`            | uuid        | The action item                                            |
| `org_id`        | uuid        | The OpenAppHub organization                                |
| `title`         | text        |                                                            |
| `assignee_id`   | uuid        | The person it's assigned to (`auth.users`); null if nobody |
| `due_date`      | date        | May be null                                                |
| `status`        | text        | `open`, `in_progress`, `done` or `cancelled`               |
| `meeting_id`    | uuid        | Meeting it came from; may be null                          |
| `meeting_title` | text        |                                                            |
| `link`          | text        | Path in OpenBoardApp where it's done (`/board/tasks`)      |
| `created_at`    | timestamptz |                                                            |
| `completable`   | boolean     | True when the caller can finish it from the hub (S-19)     |

**Finish from the hub (S-19):** `board.complete_action_item(p_id)` marks an open item done; `security invoker`, so Board's row rules on `action_items` decide who may (and Board must be writable).

## `board.add_report_to_meeting(p_meeting, p_title, p_file_name, p_source_app)` (S-13)

The one write path other apps use: adds a report (PDF) to an upcoming meeting's documents, where the
meeting's Packet tab lists it for the packet. `security invoker`: only people who can edit Board's
records (owner, admin, chair, secretary), only while Board is writable, only for meetings that
haven't happened yet. Returns `document_id` and `storage_path`; the caller uploads the PDF to that
path in the `board-files` bucket (Board's storage rules allow the same people). The shared helper
`addReportToBoardMeeting` and the `AddToBoardPackage` button (OpenAppHub `shared/`) do both steps.

## Board members in sync with OpenCharterApp (S-14)

For organizations that use both apps, OpenCharterApp's officers at the organization level are
OpenBoardApp terms too (migration `0005_charter_sync.sql`, with OpenCharterApp's `0005`):

- **Charter → Board.** Appointing, changing or ending an officer in Charter inserts, updates or
  ends the matching term here (`source = 'charter'`, `source_id` = the appointment). Existing
  officers were copied once when the migration ran.
- **Board → Charter.** A term added here becomes a Charter appointment when its position matches one
  of the organization's seats in Charter (by title) and its person matches a member there (by login,
  else by name). Otherwise it stays Board-only.
- **Linked terms** can't be renamed, moved or deleted here; setting an end date of today or earlier
  ends the appointment in Charter (Charter's rules and permissions apply, or the change is refused).
- The two sides use the transaction setting `oah.syncing` so they don't echo each other.

**An exception to SHARED-SPEC §3.6, on purpose:** `board.sync_term_from_charter` and Charter's
`appointment_from_board` / `end_appointment_from_board` are `security definer` functions that only
the other app's triggers call (execute is revoked from every client role). They run only after a
write the source app already allowed, and the Charter-side ones go through Charter's own
`appoint_officer` / `end_appointment` checks. `security invoker` RPCs would refuse a Charter admin
who isn't also a Board editor and leave the two apps out of step.

A two-app check (both apps' migrations on one database) is in `db/suite/charter_sync.sql`; it isn't
part of CI, which builds Board alone.

## `board.api_people` (H-04)

Each person's role in this app, for the hub's People page (`security invoker`: what the caller may see).

| Column    | Type | Meaning                                                                    |
| --------- | ---- | -------------------------------------------------------------------------- |
| `org_id`  | uuid | The OpenAppHub organization                                                |
| `user_id` | uuid | The person (`auth.users`)                                                  |
| `office`  | text | `chair`, `secretary` or `treasurer`; no row for a member without an office |

A role set for this app alone is in `public.app_role_overrides` (core `0010`); read it with `public.app_role(org, 'board', user)` and set it with `public.set_app_role`. This app's permission checks use it.

## Workflow connectors (S-25, `0010_workflow_triggers`)

Triggers `board.meeting_upcoming` (N days before a meeting, a scan), `board.meeting_scheduled` (event), `board.action_item_overdue` (N days overdue, a scan); they provide a meeting where there is one. Recipient `board.office`: whoever holds an office. The service role may call `add_report_to_meeting`, for other apps' workflow actions.
