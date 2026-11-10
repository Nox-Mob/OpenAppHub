# Integration (OpenAppHub)

What the hub offers other apps (SHARED-SPEC §3.6). Core functions are in `db/core/` and
documented in SHARED-SPEC §3.2.

## Core functions (all apps, hosted and self-hosted)

`is_member`, `has_role`, `has_app_access`, `can_write`, `create_organization`,
`rename_organization`, `delete_organization`, `transfer_ownership`,
`ownership_transfer_candidates`, `create_invitation`, `get_invitation` (anon),
`accept_invitation`, `revoke_invitation`, `list_invitations`, `org_member_directory`.

Additional helper: `shares_org(p_user)`: true when the caller shares an organization with
`p_user` (used by the profiles policy).

## Invitation follow-up (each app implements)

An app that sends app invitations (`create_invitation(..., p_app => '<app>', p_payload => {...})`)
provides `<app>.on_invitation_accepted(p_invitation_id uuid)`: `security definer`, checks
`accepted_by = auth.uid()` on the invitation, applies `app_payload` (Charter: link the roster
record and grant portal access; Board: set an office; Ledger: set the treasurer overlay), and is
idempotent so a retry is safe. The shared `InvitationPage` calls it through `onAccepted`.

Implemented (in each app's `0001_<app>_baseline.sql`, not yet applied):

| App     | Function                         | `app_payload`                                                                                                                                                                 |
| ------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Charter | `charter.on_invitation_accepted` | `{"unit_id": …, "role_key": …}`: a member record in that unit and the role; Charter's own `charter.create_invitation` / `accept_invitation` / `revoke_invitation` wrap core's |
| Board   | `board.on_invitation_accepted`   | `{"office": "chair" \| "secretary" \| "treasurer"}`                                                                                                                           |
| Ledger  | `ledger.on_invitation_accepted`  | `{"ledger_role": "treasurer"}`                                                                                                                                                |

Charter also has `charter.ensure_top_unit(org)`: an organization created in the hub opens in
Charter once its owner or an admin calls it (the top unit has the organization's id).

Routing: the hub's `/invite/<token>` accepts core invitations itself and sends an app invitation
to that app's `/invite/<token>` before accepting it, so acceptance and follow-up happen in the
same place (SHARED-SPEC §4.3 leaves the order open; this avoids a used invitation the app can't
finish).

## Row rules in app schemas

Use set-based checks, worked out once per query: `org_id in (select <app>.readable_org_ids())`
(a `security definer` function returning the caller's organization ids), not
`public.is_member(org_id)` per row. All three apps do this; at their performance-test sizes the
per-row form was 5–15× slower.

## Views and RPCs from the hub

`get_org_billing(p_org)` (billing, `0002_billing.sql`): plan, status and per-app access for the billing banner. The apps' `api_*` views for dashboard summaries come with each app's integration step.
