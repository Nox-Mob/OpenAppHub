# OpenAppHub Suite — Start Here (v2, for you, the owner)

This pack turns OpenCharterApp, OpenBoardApp and OpenLedgerApp into apps of OpenAppHub: one Supabase database, one sign-in, one organization ID, with sign-up, invitations, ownership and billing in the hub. Every app still runs on its own when self-hosted.

v2 includes your answers to the three migration notes. Each repo's `docs/MIGRATION-NOTES.md` stays its step plan.

## What goes where

| File | Repo | As |
|---|---|---|
| `SHARED-SPEC.md` | all four app repos | `docs/SHARED-SPEC.md` (replace v1) |
| `AGENTS-OpenAppHub.md` | Nox-Mob/OpenAppHub (create it) | `AGENTS.md` |
| `AGENTS-OpenCharterApp.md` | Nox-Mob/OpenCharterApp | merge into `AGENTS.md` as the **Suite migration** section |
| `AGENTS-OpenBoardApp.md` | Nox-Mob/OpenBoardApp | same |
| `AGENTS-OpenLedgerApp.md` | Nox-Mob/OpenLedgerApp | same |
| docs site | Nox-Mob/OpenAppHub-docs | already there; it has its own `AGENTS.md` |

Prompt for each repo's agent:
> Read `AGENTS.md`, `docs/SHARED-SPEC.md` and `docs/MIGRATION-NOTES.md`. Update the migration notes with the owner's answers, then do the next unfinished step as one pull request, and stop with a summary of what I need to do.

## Do now

1. **Create `Nox-Mob/OpenAppHub`** and start its agent. Everything else is blocked on its Phase 1–2.
2. **Disconnect Lovable** from OpenCharterApp, OpenBoardApp and OpenLedgerApp before their database work reaches `main`.
3. **Create two new Supabase projects**, `openapphub-prod` and `openapphub-staging`, and send their project IDs and publishable keys. (Owner change 2026-11-08: the old projects are deleted; nothing is copied or parked.)
4. **Delete the `SMOKE_DEMO_PASSWORD` repo secret** (the old demo accounts go away with the old projects).
5. **Keep sign-ups closed** on both Supabase projects until launch.
6. Turn on **secret scanning and push protection** on all five repos.

## You'll be asked to decide

- **The design direction.** The hub's agent will open a PR with 2–3 options for the new look. Nothing is restyled until you pick.
- **Prices.** Not needed until billing launches. Charter can report chapter counts if you price by sub-organizations.
- **An AI provider** for Ledger's PDF statement reading, whenever you want it back on.

## Order of database changes on production

| # | Repo | Change |
|---|---|---|
| 1 | Hub | `db/core/*` (+ `0002_billing.sql` once billing is built) |
| 2 | Charter | `0001_charter_baseline.sql` |
| 3 | Board | `0001_board_baseline.sql` |
| 4 | Ledger | `0001_ledger_baseline.sql` |

Staging (`openapphub-staging`) gets the same order, plus each repo's seed data: the hub through `staging.yml`, each app through its **Migrate** workflow (target `staging` adds the seed).

You run each with the repo's **Migrate** workflow in GitHub Actions. Migrations never apply themselves to production; merging to `main` deploys the code, so migrate production first.

Both databases start empty: there is no park step and no legacy schema.

## Things only you can do

**Supabase**
- Exposed schemas: add `charter`, `board`, `ledger`.
- Auth URL settings: Site URL `https://openapphub.org`; redirect URLs for every production and staging address below.
- Custom SMTP before launch (the hub sends invitation emails).
- Copy each project's **Session pooler** connection string for GitHub.

**GitHub Actions secrets (each app repo)**
`PROD_DATABASE_URL`, `STAGING_DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `PROD_REF`, `STAGING_REF`. (No Cloudflare secrets: deploys use Cloudflare's Git integration; merging to `main` deploys production. What goes in each secret: the hub's `docs/SECRETS.md`.)

**Worker secrets**
- Hub: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MAP`.
- Charter: `SUPABASE_SERVICE_ROLE_KEY` (dues only) and its gateway encryption key.
- Ledger: `BACKUP_SIGNING_SEED` (never change it).

**Cloudflare** (`openapphub.org` on Cloudflare; add each as a custom domain on its Worker)

| | Production | Staging |
|---|---|---|
| Hub | `openapphub.org` | `staging.openapphub.org` |
| Charter | `charter.openapphub.org` | `charter-staging.openapphub.org` |
| Board | `board.openapphub.org` | `board-staging.openapphub.org` |
| Ledger | `ledger.openapphub.org` | `ledger-staging.openapphub.org` |
| Docs | `docs.openapphub.org` | — |

Redirect `opencharterapp.org` (and any other old domains) once each app is live on its new address.

**Stripe (hub, test mode first)**: products and prices, webhook `https://openapphub.org/api/stripe/webhook`, Customer Portal on.

## Cost while you have no customers

Supabase free (production and staging use your two free projects), Cloudflare free, Stripe per transaction only. Upgrade production Supabase to Pro at the first paying customer.

## Launch checklist

- [ ] Stripe test cycle works: trial → checkout → renewal → failed payment → cancel → read-only → export.
- [ ] One sign-in carries across the hub and all three apps.
- [ ] Invitations sent from the hub work for each app; ownership transfer works.
- [ ] A new Charter member can sign up at the hub, join and pay dues.
- [ ] Each app runs self-hosted on its own empty database.
- [ ] No demo data on production; the demo works on staging.
- [ ] Custom SMTP set; sign-ups open; Stripe on live keys.
- [ ] Docs updated; the plans page published with confirmed prices.
- [ ] Production Supabase on Pro (or a firm plan to switch at the first sale).
