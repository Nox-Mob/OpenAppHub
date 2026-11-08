# shared/

Canonical shared code for the OpenAppHub suite (SHARED-SPEC §8). Apps vendor a
read-only copy; never edit it in an app repo. Change it here, bump `VERSION`,
then sync it into each app (`scripts/sync-shared.mjs`, coming in Phase 2).

Version `0.x` is pre-release: the design system and shared UI (§9) are not in yet.
