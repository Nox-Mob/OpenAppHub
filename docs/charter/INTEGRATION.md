# OpenCharterApp integration

What Charter publishes for OpenAppHub and the other apps (SHARED-SPEC §3.6). Everything here is a
**read-only view** in schema `charter`, created `with (security_invoker = true)`: it runs with
the caller's own row security, so a person sees exactly the rows they could read in Charter itself
(staff and members of the organization's tree; nobody else; signed-out visitors nothing).

Rules for consumers:

- **Feature-detect.** On a database without Charter (or before migration `0002`), the views don't
  exist. Treat "relation does not exist" (PostgREST `42P01` / `PGRST205`) as "Charter isn't here"
  and hide the integration.
- **Never write.** A change in Charter would go through a `security invoker` RPC documented here.
- **Columns are stable.** New columns are added at the end; none is removed or renamed.

Migration: [`db/migrations/0002_integration_views.sql`](https://github.com/Nox-Mob/OpenCharterApp/blob/staging/db/migrations/0002_integration_views.sql).
Tests: [`db/tests/9W_integration_views.sql`](https://github.com/Nox-Mob/OpenCharterApp/blob/staging/db/tests/9W_integration_views.sql).

## `charter.api_units`

The organization's tree: the national or standalone association (the top unit has the same id as
the OpenAppHub organization), its regions and its chapters.

| Column       | Type        | Meaning                                                       |
| ------------ | ----------- | ------------------------------------------------------------- |
| `id`         | uuid        | The unit                                                      |
| `org_id`     | uuid        | The OpenAppHub organization (the top unit's id)               |
| `parent_id`  | uuid        | Parent unit; null for the top                                 |
| `type`       | text        | `national`, `region`, `chapter` or `standalone`               |
| `name`       | text        |                                                               |
| `slug`       | text        | Used in the public join page address                          |
| `status`     | text        | `active`, or another state for a unit that's no longer active |
| `created_at` | timestamptz |                                                               |

## `charter.api_board_seats`

Filled board seats: who holds which seat at which unit now (appointments that haven't ended).

| Column        | Type    | Meaning                                                                |
| ------------- | ------- | ---------------------------------------------------------------------- |
| `id`          | uuid    | The appointment                                                        |
| `org_id`      | uuid    | The OpenAppHub organization                                            |
| `unit_id`     | uuid    | Unit the seat belongs to                                               |
| `unit_name`   | text    |                                                                        |
| `seat_id`     | uuid    | The seat (seat template)                                               |
| `title`       | text    | The unit's own title for the seat if it set one, else the seat's title |
| `seat_number` | int     | For seats with more than one holder                                    |
| `required`    | boolean | Whether the bylaws require this seat                                   |
| `holder_name` | text    | The officer's display name; may be null                                |
| `starts_on`   | date    |                                                                        |
| `planned_end` | date    | End of the current term, if it has one                                 |

Example (the hub's dashboard: officers of the top unit):

```sql
select title, holder_name from charter.api_board_seats
where org_id = :org and unit_id = :org order by title;
```

## `charter.api_unit_count`

Active units per organization (spec §6.1: kept in case pricing later depends on units).

| Column   | Type | Meaning                             |
| -------- | ---- | ----------------------------------- |
| `org_id` | uuid | The OpenAppHub organization         |
| `units`  | int  | Active units, the top unit included |

## `charter.api_tasks` (S-15)

What needs doing in Charter, for the hub's task list. Each person sees the tasks for the units they
can see.

| Column      | Type | Meaning                                                                                                                                                                       |
| ----------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `org_id`    | uuid | The OpenAppHub organization                                                                                                                                                   |
| `unit_id`   | uuid | Unit the task is about                                                                                                                                                        |
| `kind`      | text | `join_request` (one per request), `vacant_seat` (a required seat with fewer holders than seats, per unit), `renewals_due` (memberships expiring within 30 days, one per unit) |
| `title`     | text | Ready to show, for example "Review join request: Morgan"                                                                                                                      |
| `unit_name` | text |                                                                                                                                                                               |
| `due_on`    | date | When it was asked (join requests) or the first expiry (renewals); null for seats                                                                                              |
| `item_id`   | uuid | The membership or seat; null for renewals                                                                                                                                     |
| `link`      | text | Path in OpenCharterApp where it's done                                                                                                                                        |

## Board members in sync with OpenBoardApp (S-14)

Officers at the organization level (the top unit) are kept in step with OpenBoardApp's terms
(migration `0005_board_sync.sql`): appointing, changing or ending one here updates Board; a term
added in Board becomes an appointment here when its position matches a seat and its person a
member; ending a linked term in Board ends the appointment here. Chapter officers stay in Charter.
Details, and why these sync functions are trigger-only `security definer` functions (an exception
to SHARED-SPEC §3.6): OpenBoardApp's `docs/INTEGRATION.md`.

## Uses from other apps (S-13)

The Reports tab's **Add to a board package** puts the reports PDF into an upcoming OpenBoardApp
meeting through `board.add_report_to_meeting` (shared `AddToBoardPackage`). Hidden when OpenBoardApp
isn't on this database.

## `charter.api_member_summary` (hub dashboard)

Membership at a glance, per organization (what the reader can see).

| Column             | Type | Meaning                                    |
| ------------------ | ---- | ------------------------------------------ |
| `org_id`           | uuid | The OpenAppHub organization                |
| `current_members`  | int  | Active memberships, paid up or lifetime    |
| `pending_requests` | int  | Join requests waiting for review           |
| `renewals_due`     | int  | Active memberships expiring within 30 days |

## Email (S-16)

Charter doesn't send email itself. It queues email in the core outbox (`public.enqueue_email`, core 0005) from its own security definer functions, with a template from `shared/email/templates.ts`. Hosted, the hub's Worker sends it through Resend; self-hosted, this app's Worker does (`server/email-cron.ts`, through the SMTP server entered on the Account page, `src/modules/email/`). Unsubscribe links go to `/email/unsubscribe` (served by `src/server.ts` when self-hosted).

## Chapters on OpenBoardApp (0006)

A chapter can run its board in OpenBoardApp when its national allows it. The national's setting `board.chapters` (`charter.org_settings` on the top unit) is `off`, `approval` (the default) or `open`. A chapter admin asks with `charter.request_chapter_board(unit)`. With `approval`, the national's owners and admins get an email (`charter.chapter_board_request`) and decide with `charter.decide_chapter_board(request, approve, note)`. The requester then hears back (`charter.chapter_board_decided`).

On approval, `charter._enable_chapter_board` creates the chapter's own organization with core `public._create_child_organization`: parent = the national's organization, `source_app = 'charter'`, `source_ref` = the chapter's unit. The requester owns it, the national's owner is an admin, and the chapter's current officers are copied to its board. OpenBoardApp needs nothing special: it's an organization like any other. When billing is on, the hub's billing 0004 covers it with the national's plan.

The S-14 sync now works per unit: `charter.board_org_for_unit(unit)` gives the board organization (the national's own for the top unit, the chapter's once approved) and `charter.unit_for_board_org(org)` maps back, so officers sync both ways for chapters too. Both are trigger-only security definer functions like the rest of the sync.

## `charter.api_people` (H-04)

Each person's role in this app, for the hub's People page (`security invoker`: what the caller may see).

| Column    | Type | Meaning                                                                                            |
| --------- | ---- | -------------------------------------------------------------------------------------------------- |
| `org_id`  | uuid | The OpenAppHub organization                                                                        |
| `user_id` | uuid | The person (`auth.users`)                                                                          |
| `roles`   | text | Charter roles, comma-separated, each with its unit when below the top (e.g. `President (Post 12)`) |

A role set for this app alone is in `public.app_role_overrides` (core `0010`); read it with `public.app_role(org, 'charter', user)` and set it with `public.set_app_role`. This app's permission checks use it. A role set on the hub for Charter is mirrored into Charter's roles (`_sync_app_role`, source `hub`) without changing the OpenAppHub role.

## Workflow connectors (S-25, `0008_workflow_triggers`)

Triggers `charter.payment_received`, `charter.member_joined`, `charter.membership_lapsed` (events), carrying the member, their unit and the organization's own member fields (rank, branch…, through `fields_fn`). Recipient `charter.seat`: whoever holds a seat in the member's unit, the level above, their region or the national (`wf_seat_options` offers the organization's seats).

## Roles (H-09, core 0011)

Read someone's role here with `public.app_role(org, 'charter', user)` (owner; else set for them in this app; else their named role's; else viewer) and extra permissions with `public.has_app_permission(org, 'charter', key)`. The OpenAppHub role isn't used for anything in this app. Charter registers all of its permission keys (`0011_named_roles`); `charter.has_permission` and `charter.permitted_units` accept a named role's permission in every unit of the organization, besides roles held in units. A role assigned in Charter makes someone new an OpenAppHub member (never raises the OpenAppHub role) and gives the Charter role the assignment needs (admin for the organization admin role, member otherwise).
