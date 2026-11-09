# Migration notes: OpenAppHub (hub)

The hub's step plan and status. `docs/SHARED-SPEC.md` (v2.1) wins wherever this file disagrees.
The hub is a new repo, so there is nothing to migrate _from_. These notes track the build order and
the owner's decisions that affect it.

## 1. Owner decisions that change the plan

| Date       | Decision                                                                                                                                                                                                | Effect here                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-08 | **Fresh databases.** The old projects (`nxungwtxnctcqolfshcr`, `dnsqxiiexkdokgebysrt`) are being deleted. New projects: `openapphub-prod` and `openapphub-staging`. IDs and publishable keys to follow. | Production is `ymlesgadawnjupnvgokd`, staging is `mbloxixlykmbuuoaprnx` (both in `wrangler.jsonc`; local dev uses staging). The app treats them as "not configured". Never use the old IDs. |
| 2026-11-08 | **Nothing copied or parked; no legacy schema.**                                                                                                                                                         | The hub writes no import or park migrations. Core SQL runs on an empty database.                                                                                                            |
| 2026-11-08 | **Production order:** hub core (+ billing later) → Charter baseline → Board baseline → Ledger baseline. Staging gets the same plus seed data.                                                           | The hub goes first. `release.yml` migrates `db/core` before anything else can run.                                                                                                          |
| 2026-11-08 | **`VITE_SUITE_URLS` is JSON** everywhere: `{"hub":…,"charter":…,"board":…,"ledger":…}`.                                                                                                                 | `shared/supabase/hosted.ts` `parseSuiteUrls()` parses JSON (hub key included) and is tested. `wrangler.jsonc` and `.env.example` updated.                                                   |

## 2. Steps (AGENTS.md)

| #     | Step                                                                                 | Status                                                                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1     | Scaffold, Worker config, security headers, workflows                                 | Done                                                                                                                                                                                 |
| 2     | `scripts/migrate.mjs` + `scripts/README.md`                                          | Done                                                                                                                                                                                 |
| 3     | Core SQL `db/core/0001–0003`                                                         | Done                                                                                                                                                                                 |
| 4     | DB tests                                                                             | Done (Postgres 16 + Supabase stub in CI)                                                                                                                                             |
| 5     | Design audit + 2–3 directions                                                        | **In review**: [`docs/design/`](design/README.md). Waiting for the owner to pick.                                                                                                    |
| 6–9   | Design system, shared UI, sync script, docs look                                     | Blocked on step 5                                                                                                                                                                    |
| 10    | Sign-up and sign-in                                                                  | Partly done ahead of time (email/password, Google, reset, confirmation, safe `next`). Still to do: `hub.waitlist`, `hub.legal_acceptances` (acceptance is in user metadata for now). |
| 11–17 | Orgs, members, invitations, ownership, account deletion, dashboard, audit, operators | Not started                                                                                                                                                                          |
| 18–21 | Billing                                                                              | Not started                                                                                                                                                                          |
| 22–23 | Help links, docs PR                                                                  | Not started                                                                                                                                                                          |

## 3. Owner steps outstanding

- ~~Create `openapphub-prod` and `openapphub-staging`~~ (done: `ymlesgadawnjupnvgokd`, `mbloxixlykmbuuoaprnx`).
- Supabase Auth on both: Site URL, redirect URLs (`/auth/callback` on each origin), Google provider, email confirmation; custom SMTP before launch; sign-ups closed until launch.
- GitHub secrets: `STAGING_DATABASE_URL`, `PROD_DATABASE_URL` (Session pooler strings), `SUPABASE_ACCESS_TOKEN`, `STAGING_REF`, `PROD_REF`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Secret scanning and push protection on the repo.
- Pick a design direction in the Phase 2 pull request.
