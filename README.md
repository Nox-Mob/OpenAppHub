# OpenAppHub

The front door of the OpenAppHub suite (`openapphub.org`): one account for OpenCharterApp,
OpenBoardApp and OpenLedgerApp. It also holds the canonical shared code every app vendors:
`shared/`, `db/core/` and `scripts/migrate.mjs`.

Read [`AGENTS.md`](AGENTS.md) and [`docs/SHARED-SPEC.md`](docs/SHARED-SPEC.md) before changing anything.

**Stack:** TanStack Start (React, SSR) on Cloudflare Workers · Tailwind · shadcn/ui · Supabase
(Postgres + Auth) · npm.

## Status

| Area                                                                            | State                                   |
| ------------------------------------------------------------------------------- | --------------------------------------- |
| Scaffold, Worker config, security headers, CI/staging/release/migrate workflows | Done                                    |
| Migration runner (`scripts/migrate.mjs`)                                        | Done                                    |
| Core SQL (`db/core/0001–0003`) and DB tests                                     | Done                                    |
| Sign in (email + password, Google), sign up, email confirmation, password reset | Done (needs Supabase)                   |
| Design refresh (Phase 2)                                                        | Not started; placeholder neutral tokens |
| Organizations, members, invitations, ownership, billing screens                 | Not started                             |

## Local development

```bash
npm ci
cp .env.example .env.local   # fill in VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY
npm run dev                  # http://localhost:3000, running inside workerd
```

Without Supabase values the site runs, but the sign-in screens say they're not connected.

Checks: `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`.

### Database

```bash
DATABASE_URL=postgres://… npm run db:migrate   # db/core then db/migrations
DATABASE_URL=postgres://… npm run db:test      # migrations + SQL tests (use a throwaway DB)
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

| Workflow      | Trigger         | Does                                                                                    |
| ------------- | --------------- | --------------------------------------------------------------------------------------- |
| `ci.yml`      | every PR / push | typecheck, lint, format, tests, build, DB tests                                         |
| `staging.yml` | push to `main`  | migrate staging with seed → deploy `staging.openapphub.org` (skips until secrets exist) |
| `release.yml` | owner, manual   | migrate production → deploy `openapphub.org`                                            |
| `migrate.yml` | owner, manual   | migrations only, staging or production (dry run by default)                             |

Nothing deploys production automatically.

## Supabase Auth setup (owner)

- **Site URL:** `https://openapphub.org`.
- **Redirect URLs:** each origin's `/auth/callback`, e.g. `https://openapphub.org/auth/callback`,
  `https://staging.openapphub.org/auth/callback`, `http://localhost:3000/auth/callback`.
- **Google:** enable the Google provider and add the Supabase callback URL to the Google OAuth client.
- **Email confirmation:** on. Custom SMTP before launch.
- Keep sign-ups closed until launch.
