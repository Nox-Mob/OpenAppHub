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

Routing: the hub's `/invite/<token>` accepts core invitations itself and sends an app invitation
to that app's `/invite/<token>` before accepting it, so acceptance and follow-up happen in the
same place (SHARED-SPEC §4.3 leaves the order open; this avoids a used invitation the app can't
finish).

## Views and RPCs from the hub

None yet. `get_org_billing` arrives with billing (Phase 4).
