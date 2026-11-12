# The automation engine (S-25)

One engine for every schedule and automation an organization may want to change, instead of fixed jobs in each app. It drives reminders now, and is meant to drive OpenCharterApp's award system, renewal reminders, governance alerts, scheduled board packages and every other "the app does this on its own" feature later.

This document is the design. **Part 1 is built** (shared 1.11.0, core `0008_core_automations.sql`, Board `0009_automation_reminders.sql`); later parts are planned in [`ROADMAP.md`](ROADMAP.md).

## 1. Words

| Word           | Meaning                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| **Kind**       | One automation an app offers, e.g. `board.meeting_reminders`. Registered by the app's migration with its defaults and what can be changed |
| **Automation** | A kind as one organization has it: on or off, with its settings. No row means the defaults                                                |
| **Settings**   | The kind's parameters (e.g. `days_before: [7, 1]`), checked against the kind's schema                                                     |
| **Run / log**  | What an automation did for an organization ("2 meeting reminders emailed"), kept for a year                                               |
| **Trigger**    | What starts it. Part 1: a schedule (an email job every 15 minutes that checks dates). Later: events in any app                            |
| **Condition**  | When it applies. Later: the rules engine (Charter's C-19)                                                                                 |
| **Action**     | What it does. Part 1: queue email. Later: create a task, start an approval, add to a packet, change a status                              |

## 2. How part 1 works

```mermaid
flowchart LR
    MIG[App migration<br/>register_automation_kind] --> K[(public.automation_kinds<br/>defaults + schema)]
    UI[AutomationsPanel<br/>hub settings / app page] -->|list_automations| K
    UI -->|set_automation / reset_automation<br/>owners and admins| A[(public.automations<br/>org choices)]
    JOB[Email job every 15 min<br/>board.queue_email_reminders] -->|automation_settings org, kind| A
    JOB --> EQ[enqueue_email]
    JOB -->|log_automation| L[(public.automation_log)]
    L --> UI
```

> **Diagram description:** Each app's migration registers its kinds in `public.automation_kinds` with their defaults and a schema of what can change. The shared Automations panel (on the hub's organization settings page and in each app) lists them with `list_automations`; owners and admins change one with `set_automation` or go back to the defaults with `reset_automation`, which writes `public.automations`. The app's job (for Board, the reminders job that runs every 15 minutes) reads the settings in force for each organization with `automation_settings`, queues email, and records what it did with `log_automation`, which the panel shows as the last run.

### Tables (core 0008)

| Table                     | Columns                                                                                                                    | Who can read / write                                                                                                        |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `public.automation_kinds` | `key` (`app.name`), `app`, `name`, `description`, `category`, `default_enabled`, `default_params`, `params_schema`, `sort` | Everyone signed in reads; written only by `register_automation_kind` (service role, migrations)                             |
| `public.automations`      | `org_id`, `kind`, `enabled`, `params`, `updated_by`, `updated_at` (primary key `org_id, kind`)                             | Members read; written only by `set_automation` / `reset_automation` (owners, admins)                                        |
| `public.automation_log`   | `org_id`, `kind`, `at`, `count`, `summary`                                                                                 | Members read; written only by `log_automation` (service role); pruned after a year (`core.automation_log_prune` job, daily) |

### Functions

| Function                                                                                                                | For                                                                               |
| ----------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `register_automation_kind(key, app, name, description, category, default_enabled, default_params, params_schema, sort)` | An app's migration adds or updates a kind (idempotent)                            |
| `automation_settings(org, kind) → (enabled, params)`                                                                    | Jobs: the settings in force (the organization's choices over the defaults)        |
| `list_automations(org)`                                                                                                 | Members: every kind with its settings in force, defaults, schema and last run     |
| `set_automation(org, kind, enabled, params)`                                                                            | Owners and admins: change it. Settings are checked and cleaned against the schema |
| `reset_automation(org, kind)`                                                                                           | Owners and admins: back to the defaults                                           |
| `log_automation(org, kind, count, summary)`                                                                             | Jobs: record what it did (only when the count is above 0)                         |

### The settings schema

`params_schema` is a small JSON object, one entry per setting. The panel draws the form from it and `set_automation` checks against it, so a new kind needs no new UI code.

| `type`     | Form                  | Checked                                                                                             |
| ---------- | --------------------- | --------------------------------------------------------------------------------------------------- |
| `int`      | A number field        | A whole number from `min` to `max`                                                                  |
| `int_list` | A text field ("7, 1") | 1 to `max_items` whole numbers, each from `min` to `max`; stored sorted high to low without repeats |
| `bool`     | A checkbox            | true or false                                                                                       |

Each entry also has `label`, `help` and `unit` (shown in the form). Unknown settings are refused.

### The first automations (Board 0009)

| Kind                          | Default                             | Settings                                    | Behaviour                                                                                                                                                                                             |
| ----------------------------- | ----------------------------------- | ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `board.meeting_reminders`     | On; 7 and 1 days before             | `days_before`: up to 5 numbers, 0–60        | Each current board member (a term with an account) gets one email per chosen day; a meeting scheduled inside a window gets that window's email (a meeting set 5 days out still gets the "7 days" one) |
| `board.action_item_reminders` | On; 2 days before, and when overdue | `days_before`: 0–30; `when_overdue`: on/off | The assignee of an open item; overdue once, up to a week late                                                                                                                                         |

The de-duplication keys didn't change, so switching to the engine sent nothing twice.

## 3. Adding an automation (for developers)

1. In the app's migration, call `public.register_automation_kind(...)` with a key `app.name`, plain-language name and description, defaults and a schema.
2. In the job, read `public.automation_settings(org_id, '<key>')` for each organization (skip it when `enabled` is false) and call `public.log_automation(...)` with what it did.
3. Write database tests for the defaults, a changed setting, and switched off.
4. Document it in the customer docs (the app's guide and the hub's Automations page) and here.

## 4. Later parts

| Part | What                                                                                                                                                                                            | Needs           |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- |
| 2    | **Move fixed schedules in**: the task summary's job (S-17's settings stay per person), Charter's renewal reminders and lapse notices (C-13), scheduled board packages (the former S-20)         | C-08            |
| 3    | **Event triggers**: an outbox of events each app writes (`payment.received`, `appointment.made`, `meeting.scheduled`, `task.overdue`), a runner that matches them to automations                | —               |
| 4    | **Conditions**: the rules engine (C-19) decides whether an automation applies ("only for Gold members", "only chapters in Region 2")                                                            | C-19 ✅         |
| 5    | **More actions**: create a task, start an approval (C-24), add reports to a packet (S-13), change a status, call an app RPC                                                                     | C-24            |
| 6    | **Organizations build their own** from triggers, conditions and actions, with a history of every run; **awards** (C-30…C-33): routing, reminders, escalation to national, purchase, fulfillment | Parts 3–5, C-29 |

Every part keeps the same promise: sensible defaults are on, owners and admins see and change them in one place, and each run is recorded.
