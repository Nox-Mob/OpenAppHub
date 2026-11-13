# OpenLedgerApp integration

What Ledger publishes for OpenAppHub and the other apps (SHARED-SPEC §3.6). Everything here is a
**read-only view** in schema `ledger`, created `with (security_invoker = true)`: it runs with the
caller's own row security, so a person sees exactly the rows they could read in Ledger itself
(members of the organization, viewers included; nobody else; signed-out visitors nothing).

Rules for consumers:

- **Feature-detect.** On a database without Ledger (or before migration `0002`), and in the
  desktop edition, the views don't exist. Treat "relation does not exist" (PostgREST `42P01` /
  `PGRST205`) as "Ledger isn't here" and hide the integration.
- **Never write.** A change in Ledger would go through a `security invoker` RPC documented here.
- **Columns are stable.** New columns are added at the end; none is removed or renamed.
- **Money is in cents** (`bigint`), in the organization's currency.

Migration: [`db/migrations/0002_integration_views.sql`](https://github.com/Nox-Mob/OpenLedgerApp/blob/staging/db/migrations/0002_integration_views.sql).
Tests: [`db/tests/70_integration_views.sql`](https://github.com/Nox-Mob/OpenLedgerApp/blob/staging/db/tests/70_integration_views.sql).

## `ledger.api_budgets`

One row per budgeted account and period (a year or a month), optionally for one fund or project.

| Column         | Type        | Meaning                                                          |
| -------------- | ----------- | ---------------------------------------------------------------- |
| `id`           | uuid        | The budget row                                                   |
| `org_id`       | uuid        | The OpenAppHub organization                                      |
| `account_id`   | uuid        |                                                                  |
| `account_name` | text        |                                                                  |
| `account_type` | text        | `revenue` or `expense` in practice (any account type is allowed) |
| `period_type`  | text        | `year` or `month`                                                |
| `period_start` | date        | First day of the period                                          |
| `period_end`   | date        | Last day of the period                                           |
| `amount_cents` | bigint      | The budgeted amount (never negative)                             |
| `fund_id`      | uuid        | Null for the whole organization                                  |
| `project_id`   | uuid        | Null for the whole organization                                  |
| `updated_at`   | timestamptz |                                                                  |

## `ledger.api_period_summaries`

Money in and out per calendar month, from posted transactions. Same rules as Ledger's income
statement: revenue and expense accounts only, voided transactions and year-end closing entries
left out. Months without transactions have no row.

| Column              | Type   | Meaning                                        |
| ------------------- | ------ | ---------------------------------------------- |
| `org_id`            | uuid   | The OpenAppHub organization                    |
| `month`             | date   | First day of the month                         |
| `currency`          | text   | The organization's currency, for example `USD` |
| `revenue_cents`     | bigint | Revenue (positive)                             |
| `expense_cents`     | bigint | Expenses (positive)                            |
| `net_cents`         | bigint | Revenue minus expenses                         |
| `transaction_count` | int    | Posted transactions in the month               |

Example (the hub's dashboard: this year so far):

```sql
select sum(revenue_cents) as revenue, sum(expense_cents) as expenses, sum(net_cents) as net
from ledger.api_period_summaries
where org_id = :org and month >= date_trunc('year', current_date);
```

## `ledger.api_tasks` (S-15)

What needs doing in Ledger, for the hub's task list.

| Column        | Type    | Meaning                                                                |
| ------------- | ------- | ---------------------------------------------------------------------- |
| `org_id`      | uuid    | The OpenAppHub organization                                            |
| `kind`        | text    | `recurring_due`: a recurring transaction due within 7 days, or overdue |
| `title`       | text    | Ready to show, for example "Record Rent"                               |
| `due_on`      | date    |                                                                        |
| `item_id`     | uuid    | The template                                                           |
| `link`        | text    | Path in OpenLedgerApp where it's done (`/templates`)                   |
| `completable` | boolean | True when the caller can skip it from the hub (S-19)                   |

**Skip from the hub (S-19):** `ledger.skip_recurring_due(p_template)` moves the template to its next date without recording it and returns that date. It records the skipped occurrence and an audit entry through `ledger.audited_write` (`security invoker`), so Ledger's own write rules decide who may.

## Uses from other apps (S-13)

Reports → **Add to a board package** puts the board package PDF (income, balance, budget vs actual,
funds) into an upcoming OpenBoardApp meeting through `board.add_report_to_meeting` (shared
`AddToBoardPackage`). Hidden when OpenBoardApp isn't on this database.

## `ledger.api_people` (H-04)

Each person's role in this app, for the hub's People page (`security invoker`: what the caller may see).

| Column    | Type | Meaning                                                                        |
| --------- | ---- | ------------------------------------------------------------------------------ |
| `org_id`  | uuid | The OpenAppHub organization                                                    |
| `user_id` | uuid | The person (`auth.users`)                                                      |
| `role`    | text | `treasurer` (the only Ledger overlay); admins and members come from their role |

A role set for this app alone is in `public.app_role_overrides` (core `0010`); read it with `public.app_role(org, 'ledger', user)` and set it with `public.set_app_role`. This app's permission checks use it.

## OpenCharterApp payments (S-18 / L-17, `0011_charter_income`)

Reads `charter.api_payments` when OpenCharterApp is on the database (guarded by `to_regclass`, so Ledger alone works unchanged). `ledger.charter_import_config(org)` / `save_charter_import_config(org, jsonb)` (owner and Ledger admins), `ledger.charter_drafts(org)` (anyone who reads the books), `ledger.record_charter_import(...)` (writers, after posting or to skip) and `ledger.reopen_charter_import(org, id)`. Tables: `charter_import_settings`, `charter_imports`, `charter_import_payments`. The app side: `src/lib/charter-income.functions.ts`, `src/lib/services/charter-income.ts`, `src/components/CharterDrafts.tsx`, `src/routes/_authenticated/settings/charter.tsx`.

## Workflow connectors (S-25, `0004_workflows`)

Trigger `ledger.books_locked` (event, when the books are closed through a month). Action `ledger.reports_to_meeting` (needs a meeting): the board package PDF as of the last closed month, today or a date, added to the meeting through `board.add_report_to_meeting`. The hub's cron calls Ledger's signed `POST /automation/run` (`shared/automation/run.ts`), which claims and does Ledger's jobs.

## Terms (H-07)

Hosted, Ledger reads `public.hub_accepted_terms()`; when the hub already recorded the terms, Ledger asks only for its not-advice notice.

## Roles (H-09, core 0011)

Read someone's role here with `public.app_role(org, 'ledger', user)` (owner; else set for them in this app; else their named role's; else viewer) and extra permissions with `public.has_app_permission(org, 'ledger', key)`. The OpenAppHub role isn't used for anything in this app. Ledger registers `ledger.close_books` and `ledger.manage` (`0008_named_roles`). A treasurer needs a member or admin role in Ledger. An invitation made in Ledger makes the person an OpenAppHub member with the chosen Ledger role; `ledger.on_invitation_accepted` then adds the treasurer overlay.

## Designer steps (S-28, core 0012)

Steps this app offers the low-code designer (`public.register_automation_step`). They run as the organization, inside it only; their output is what later steps can use.

| Step                        | Kind   | Function                                                                                                                  | Gives                                                                                                     |
| --------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `ledger.month_totals`       | lookup | `ledger.wf_month_totals`: the last closed month, this month, or a date's month                                            | `month`, `month_name`, `income`, `spending`, `net` (currency units), `currency`, `transactions`, `closed` |
| `ledger.reports_to_meeting` | job    | `/automation/run` (unchanged); in the designer the meeting comes from the step's `context` (e.g. a meeting found earlier) | `summary`, `document_id`                                                                                  |
