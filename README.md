# OpenAppHub

The front door of the OpenAppHub suite (`openapphub.org`): one account for OpenCharterApp,
OpenBoardApp and OpenLedgerApp. It also holds the canonical shared code every app vendors:
`shared/`, `db/core/` and `scripts/migrate.mjs`.

Read [`AGENTS.md`](AGENTS.md) and [`docs/SHARED-SPEC.md`](docs/SHARED-SPEC.md) before changing anything.

**Stack:** TanStack Start (React, SSR) on Cloudflare Workers · Tailwind · shadcn/ui · Supabase
(Postgres + Auth) · npm.

## Status

| Area                                                                                                                                              | State                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Scaffold, Worker config, security headers, CI/staging/release/migrate workflows                                                                   | Done                                         |
| Migration runner (`scripts/migrate.mjs`)                                                                                                          | Done                                         |
| Core SQL (`db/core/0001–0006`: core, org settings, email outbox, chapters' organizations) and DB tests                                            | Done                                         |
| Sign in (email + password, Google), sign up, email confirmation, password reset                                                                   | Done (needs Supabase)                        |
| Design system (Phase 2): "Civic, slightly warm", dark mode, money/date formats                                                                    | Done: `shared/design/`, `shared/format.ts`   |
| Organizations, members, invitations (with email), ownership, account and org settings, account deletion, dashboard, audit log, staging demo tools | Done                                         |
| Billing (Phase 4)                                                                                                                                 | Built; prices come from Stripe by lookup key |
| Dashboard from every app: tasks, meetings, decisions, money, members (S-03, S-15)                                                                 | Done                                         |
| Email for the suite (S-16): outbox, Resend sender every 5 minutes, unsubscribe, email choices                                                     | Done (needs `RESEND_API_KEY`)                |
| Chapters on OpenBoardApp (S-24): child organizations covered by the parent's plan                                                                 | Done                                         |
| Suite demo on staging: Riverside, Northstar Veterans League and a test account, reset every 12 hours                                              | Done (`db/seed/0003_suite_demo_v2.sql`)      |

## Local development

```bash
npm ci
npm run dev   # http://localhost:3000, inside workerd, against openapphub-staging
```

Local development uses the staging Supabase project (`wrangler.jsonc` `vars`). To use your own
project, copy `.env.example` to `.env.local` and set `VITE_SUPABASE_URL` and
`VITE_SUPABASE_PUBLISHABLE_KEY`. Add `http://localhost:3000/auth/callback` to the project's redirect URLs.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

### Database

```bash
DATABASE_URL=postgres://… npm run db:migrate   # db/core then db/migrations
DATABASE_URL=postgres://… npm run db:test      # migrations + SQL tests (use a throwaway DB)
DATABASE_URL=postgres://… npm run db:test:selfhosted   # core alone, as on a self-hosted app (another empty DB)
```

See [`scripts/README.md`](scripts/README.md).

## Configuration

Public settings (`VITE_*`) are Worker `vars` in [`wrangler.jsonc`](wrangler.jsonc), per
environment. The build reads the same values for the browser bundle, so they're defined once.
`.env.local` overrides them locally. Secrets are Worker secrets, never in the repo.
See [`.env.example`](.env.example).

| Mode        | `VITE_HOSTED`     | Notes                                                    |
| ----------- | ----------------- | -------------------------------------------------------- |
| Self-hosted | `false` (default) | No cookie domain; the hub is a standalone sign-in site   |
| Hosted      | `true`            | Session cookie on `.openapphub.org`, shared by every app |

## Deploys

**Merging to `main` deploys production.** Cloudflare's Git integration runs `npm run build` and
`npx wrangler deploy`; the top level of `wrangler.jsonc` is production. Staging is a second Worker
built with `npm run build:staging`. Run `migrate.yml` against production **before** merging a PR
that adds migrations.

| Workflow         | Trigger         | Does                                                        |
| ---------------- | --------------- | ----------------------------------------------------------- |
| `ci.yml`         | every PR / push | typecheck, lint, format, tests, build, DB tests             |
| `staging.yml`    | push to `main`  | migrate staging with seed (skips until the secret exists)   |
| `demo-reset.yml` | every 12 hours  | reset the suite demo on staging (`hub.reset_suite_demo()`)  |
| `migrate.yml`    | owner, manual   | migrations only, staging or production (dry run by default) |

Secrets and variables, and what goes in each: [`docs/SECRETS.md`](docs/SECRETS.md).

## Supabase Auth setup (owner)

- **Site URL:** `https://openapphub.org`.
- **Redirect URLs:** each origin's `/auth/callback`, e.g. `https://openapphub.org/auth/callback`,
  `https://staging.openapphub.org/auth/callback`, `http://localhost:3000/auth/callback`.
- **Google:** enable the Google provider and add the Supabase callback URL to the Google OAuth client.
- **Email confirmation:** on. Custom SMTP before launch.
- Keep sign-ups closed until launch.
