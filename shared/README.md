# shared/

Canonical shared code for the OpenAppHub suite (SHARED-SPEC §8). Apps vendor a read-only copy;
never edit it in an app repo. Change it here, bump `VERSION`, then sync it into each app
(`scripts/sync-shared.mjs`, coming in step 8).

| Path                             | What                                                               |
| -------------------------------- | ------------------------------------------------------------------ |
| `design/`                        | Tokens, Tailwind mapping and preset, `DESIGN.md` (read it first)   |
| `format.ts`                      | The suite's money and date formats: use these, never local helpers |
| `theme.ts`, `ui/ThemeToggle.tsx` | Light / dark / system, shared across the suite                     |
| `supabase/`                      | Cookie-session browser client, hosted-mode helpers                 |
| `docs.ts`                        | Links into docs.openapphub.org                                     |

Version `0.x` is pre-release: the shared shell components (step 7) aren't in yet; `1.0.0` follows.
