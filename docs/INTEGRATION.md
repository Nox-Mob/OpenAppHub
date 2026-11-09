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

## Views and RPCs from the hub

None yet. `get_org_billing` arrives with billing (Phase 4).
