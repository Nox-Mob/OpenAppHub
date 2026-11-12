# What comes next (proposed 2026-11-12)

The suite migration (S-01 to S-15) is done apart from the owner's checks. This is the proposed next round: suite epics that cross apps first, then each app's own list in a recommended order. Nothing here is scheduled until the owner picks it. Each app's `docs/epic.md` repeats its own part.

How to read the order: **Now** unblocks other work or closes a launch gap; **Next** is the most visible value to a small nonprofit; **Later** is scoped but can wait.

## 1. Suite epics (cross-app)

| ID   | Epic                              | What it means                                                                                                                                                                                                          | Order                                                                                                                                                            | Unblocks                                                     |
| ---- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| S-16 | Email from the Worker             | One shared way to send email (an email API or custom SMTP), templates in `shared/`, a sent-mail log per organization, and unsubscribe handling. Owner picks the provider.                                              | ✅ 2026-11-12 (PR): core outbox, Resend (hosted, from the hub) and SMTP (self-hosted, entered on each app's Email page), signed unsubscribe links, email choices | Hub billing emails, Board B-09 reminders, Charter E-08, S-17 |
| S-17 | Task digest and reminders         | A weekly (or daily) email of "Your tasks" from the hub dashboard, with per-person settings on the hub's account page. Uses the same `api_*` task views.                                                                | Next                                                                                                                                                             | —                                                            |
| S-18 | Charter payments into Ledger      | Charter offers `charter.api_payments` (dues, fees, donations, refunds); Ledger imports them as income with a category map per organization, without duplicates. Turns Charter's money into the books without retyping. | Next                                                                                                                                                             | Ledger's budget vs. actual for dues                          |
| S-19 | Finish a task from the hub        | "Mark done" on the hub dashboard for Board action items and Ledger recurring entries, through each app's `security invoker` RPC (SHARED-SPEC §3.6). Charter's tasks keep opening the app (they need a decision).       | Next                                                                                                                                                             | —                                                            |
| S-20 | Board package on a schedule       | A meeting can ask for reports automatically: Ledger's financial reports and Charter's membership report are added to the packet a set number of days before the meeting (extends S-13).                                | Later                                                                                                                                                            | —                                                            |
| S-21 | Committees in sync                | Extends S-14 from officers to committees and their members, for organizations using Charter's board templates and Board's committees.                                                                                  | Later                                                                                                                                                            | —                                                            |
| S-22 | Production smoke test             | A read-only Playwright run against production after each deploy, signed in as a dedicated check account, so S-01 doesn't need a person every time.                                                                     | Now                                                                                                                                                              | —                                                            |
| S-23 | Election results into Board terms | When Charter's elections (E-27) certify a result, the winners' terms start in Board through the S-14 sync.                                                                                                             | Later                                                                                                                                                            | Needs Charter E-27                                           |

## 2. OpenAppHub

| ID   | Epic                        | What it means                                                                                                                                                  | Order |
| ---- | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----- |
| H-01 | Stripe test run             | Trial → checkout → renewal → failed payment → cancel → read-only → export, on staging with the Stripe sandbox key (owner adds the key).                        | Now   |
| H-02 | Billing and activity emails | The emails whose preferences are already saved (needs S-16).                                                                                                   | Now   |
| H-03 | Dashboard, round two        | Choose which panels show, a "This week" view across meetings and due dates, and a per-person setting for the default organization's dashboard. Builds on S-15. | Next  |
| H-04 | People across the apps      | One page in the hub's organization settings: each person, their role in each app, and invitations, so an admin doesn't visit three apps.                       | Next  |
| H-05 | Launch                      | Open sign-ups (`VITE_SIGNUPS_OPEN` and the Supabase setting), custom SMTP for Auth, published plans page, and the license file in every repository (owner).    | Now   |
| H-06 | Generated database types    | `gen-types.yml`, so each app's `types.ts` is generated from the shared database instead of edited by hand.                                                     | Later |

## 3. OpenCharterApp

Recommended order, using the epic IDs already in `docs/epic.md`:

1. **E-08 Jobs, email and notifications** (with S-16): lapse notices and renewal reminders, which also finishes E-13.
2. **E-25 Governance compliance:** vacancy alerts and good-standing checks feed the hub's tasks (`api_tasks` already has vacant seats); board reports go to Board through S-13.
3. **E-27 Elections**, then S-23, so results start terms in Board.
4. **E-34 Donations**, with S-18, so gifts reach Ledger.
5. **E-39 Communications** (segmented email to members), on S-16.
6. **E-20 Postpaid dues** and **E-21 PayPal**.
7. Later: E-26 documents (or reuse Board's document library through an RPC), E-24 approvals, awards (E-29 to E-33), events (E-37).

## 4. OpenBoardApp

| ID   | Epic                        | What it means                                                                                                       | Order |
| ---- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- | ----- |
| B-09 | Reminders                   | ✅ 2026-11-12 (PR)                                                                                                  | Now   |
| B-11 | Atomic multi-step changes   | One database call each for a meeting with its agenda, closing a term and starting the next, a file with its record. | Now   |
| B-10 | Backup restore drill        | A tested restore of the full board record export.                                                                   | Next  |
| B-12 | Calendar feed               | A private iCal link per person with the board's meetings.                                                           | Next  |
| B-13 | Consent agenda and sign-off | A consent agenda block voted once, and the secretary's sign-off on approved minutes.                                | Next  |
| B-14 | Policies and annual forms   | A policy library with review dates, and yearly conflict-of-interest disclosures per board member; both feed tasks.  | Later |

## 5. OpenLedgerApp

| ID   | Epic                      | What it means                                                                                                                     | Order |
| ---- | ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----- |
| L-10 | People checks             | A screen-reader pass by a person; the password reset email checked by hand.                                                       | Now   |
| L-17 | Charter income import     | The Ledger side of S-18: category map, matching and an import log.                                                                | Next  |
| L-18 | Fund accounting           | Funds are tags today; make them real funds: restricted and unrestricted balances, releases from restriction, a statement by fund. | Next  |
| L-19 | Budget vs. actual summary | `ledger.api_budget_summary` for the hub's money panel and the board package.                                                      | Next  |
| L-20 | Receipt attachments       | Attach a receipt image or PDF to an entry (pulled forward from L-16).                                                             | Later |
| L-13 | v1.0 gates                | Accounting correctness, security tests, real-statement import, backup recovery, install and upgrade, non-accountant tests.        | Later |

## 6. Suggested first pick

S-16 (email) and S-22 (production smoke test), then H-01 once the Stripe sandbox key is on staging. S-16 unblocks five items across the suite.
