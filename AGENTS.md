# AGENTS.md — OpenAppHub (Nox-Mob/OpenAppHub) · v2

Save as `AGENTS.md` in the repo root. **Read `docs/SHARED-SPEC.md` (v2) first.**

You're building the hub: the suite's front door and the owner of everything shared. In hosted mode, people sign up, sign in, create organizations, invite members, transfer ownership and pay **here**. This repo also holds the canonical shared code (`shared/`, `db/core/`, `scripts/migrate.mjs`) that every app vendors.

**Everything else waits on this repo.** Charter, Board and Ledger are each blocked at their "vendor shared code" step until Phase 1–2 here is merged. Work fast on Phases 1–2.

The repo doesn't exist yet. Create it with the stack in SHARED-SPEC §2: **TanStack Start on Cloudflare Workers**, Tailwind, shadcn/ui, **npm**. Copy the build and Worker setup pattern from OpenLedgerApp or OpenBoardApp (without their Lovable packages).

---

## Phase 1 — Foundations

1. **Scaffold.** Repo layout (§2.1), `wrangler.jsonc` with `staging` and `production` environments (§10), security headers in the server entry, `.env.example`, `.gitignore`, `ci.yml`, `staging.yml`, `migrate.yml` (§10.2; `release.yml` retired 2026-11-09: Cloudflare deploys `main`).
2. **Migration runner.** `scripts/migrate.mjs` exactly per §3.3, including `--seed`, `--dry-run` and `--skip`. `scripts/README.md`.
3. **Core SQL** in `db/core/0001_core.sql`, `0002_core_functions.sql`, `0003_core_policies.sql`, exactly per §3.2: organizations, memberships with one owner, profiles, **invitations**, instance settings; `create_organization`, `rename_organization`, `delete_organization`, `transfer_ownership`, `ownership_transfer_candidates`, the invitation functions, `org_member_directory`, `handle_new_user` (reads `full_name` / `name`), and the owner-change trigger.
   - Everything idempotent: the same files run on self-hosted single-app databases.
4. **DB tests** (`db/tests/`): org isolation; roles; exactly one owner; owner only changes through `transfer_ownership`; invitations (single use, expiry, revoked, email match, app-only invitation creates no membership, `get_invitation` reveals nothing beyond §3.2); `delete_organization` needs the exact name and the owner; `org_member_directory` only for members.

## Phase 2 — Design refresh

The owner wants a **new design language for the whole suite** (SHARED-SPEC §9).

5. **Audit and propose.** Read OpenCharterApp, OpenBoardApp and OpenLedgerApp (public repos) and list every component and pattern they use. Then open one PR proposing **2–3 distinct directions**, each with tokens (light and dark), type, spacing, radius, elevation, per-app accent colours, and screenshots of the same three sample screens (dashboard, data table, form dialog) on desktop and phone.
   - **Stop. The owner picks a direction in the PR.**
6. **Design system.** Write the chosen direction to `shared/design/tokens.css`, `tailwind-preset.ts` and `DESIGN.md` (including the money and date formats).
7. **Shared UI and helpers.** `shared/ui/AppShell`, `SuiteSwitcher`, `OrgSwitcher`, `BillingBanner`, `HelpLink`, `InvitationPage` (with an app follow-up hook, §4.3); `shared/supabase/client.ts`, `org.ts`, `hosted.ts`; `shared/docs.ts`. All must render under SSR. Set `shared/VERSION` to `1.0.0`.
8. **Sync script.** `scripts/sync-shared.mjs`: copies `shared/`, `db/core/` and `scripts/migrate.mjs` into another checkout and updates its `oahShared` version. Document it.
9. **Docs look.** Docs repo PR: apply the new tokens to `src/styles/custom.css` so the docs match.

## Phase 3 — Hub app

10. **Sign-up and sign-in.** Email and password, Google (plain Supabase OAuth), password reset, email confirmation.
    - `next` is followed only to suite origins.
    - When `next` points at a Charter join page (`charter.<apex>/join/…`), sign-up **doesn't** ask the person to create an organization (§4.5).
    - `VITE_SIGNUPS_OPEN=false` shows a waitlist form instead (stored in `hub.waitlist`).
    - Record terms and privacy acceptance in `hub.legal_acceptances`.
11. **Organizations.** Create, rename, switch (`oah_org` cookie), delete (owner only, typed name, warning listing the apps that hold data).
12. **Members and invitations.** List (via `org_member_directory`), change core roles, remove, invite by email.
    - Sending the email is a hub server function using the service role (§7.2).
    - The link goes to the hub's `/invite/<token>`, or to the app's `/invite/<token>` when the invitation has an `app` (§4.3).
    - Pending invitations: list and revoke.
13. **Ownership transfer** in Settings, using `transfer_ownership`.
14. **Account deletion**, blocked while the user owns an org.
15. **Suite dashboard.** Cards for Charter, Board and Ledger with **Open** links and access state from `get_org_billing`; optional summaries from `api_*` views, feature-detected.
16. **Hub audit.** `hub.audit_log` with triggers on `public.organizations`, `public.memberships` and `public.invitations` (hub migration, not core), and a viewer for owners/admins.
17. **Platform operators.** `hub.platform_operators`, and on staging only, creating and deleting demo organizations (§11).

## Phase 4 — Billing

18. **Billing schema**, `db/migrations/0002_billing.sql`, per §5: plans (placeholder rows), subscriptions, events, `org_has_app_access`, trial trigger with one trial per user, member-limit trigger (core memberships only), `get_org_billing` (members or Charter portal members, resolved at run time). Last line enables billing.
    - DB tests: trial active → write; trial expired → read only; Starter for `board` → board writable, others read-only; member limit; portal members don't count.
19. **Stripe** per §6.2 as hub server functions and the `/api/stripe/webhook` route. Unit-test the event → row mapping with Stripe fixture payloads.
20. **Billing page** `/billing`: plan, trial days left, plan picker (Starter asks which app), monthly/yearly, Manage billing (portal), read-only explanation with the export story.
21. **Landing page** at `/` (signed out): the three apps, a pricing table (plans from `src/config/pricing.ts`, prices from Stripe by lookup key), self-hosting links, **Docs** link in header and footer.

## Phase 5 — Docs

22. **Help links** (`src/config/help.ts`): sign-in → `hub/accounts/signing-in/`; members and invitations → `hub/accounts/invitations/`; org settings and ownership → `hub/accounts/organizations-and-roles/`; billing → `hub/hosting/hosted-vs-self-hosted/` (plans page once published); export → `hub/data/ownership-and-export/`.
23. **Docs PR for the hub tab** (§12.4): one sign-in, organizations, invitations, ownership transfer, account deletion and billing as built. Publish `hub/hosting/plans.md` only when the owner confirms prices.

---

## Rules for this repo

- **Pull requests: never add a "Generated with Claude Code" line or a link to the agent session to a PR description.** Owner rule (2026-11-09), mandatory, for every PR. The GitHub tool may append such a footer by itself: after creating or editing a PR, read the description back and remove any footer like that.
- **Commits: no "Co-Authored-By: Claude" line and no session link in commit messages.** Owner rule (2026-11-09), mandatory, in every suite repo.
- **This hub session is the primary agent for the whole suite** (owner, 2026-11-09): it also opens the sync, migration and restyle PRs in Charter, Board, Ledger and the docs repo.
- **Cookies:** every new cookie or browser storage goes in `COOKIES` (`shared/consent.ts`); anything not required checks `hasConsent()` first (SHARED-SPEC §9).
- **Merging to `main` deploys production** (Cloudflare's Git integration, SHARED-SPEC §10.2). The top level of `wrangler.jsonc` is production. PRs with migrations say so at the top: the owner runs `migrate.yml` (production) on the PR branch before merging. Migrations must be additive.
- Money and dates only through `shared/format.ts`; theme only through `shared/theme.ts`.

- The hub is the only repo that touches Stripe **suite billing**, the `billing` and `hub` schemas, `ops`, and `instance_settings`. Charter dues are Charter's (§6).
- Changes to `db/core/` bump `shared/VERSION` and must stay idempotent and self-hostable: no core function may depend on `billing` or `hub` except through run-time resolution that degrades safely.
- Service-role use only as listed in §7.2.
- Never log full Stripe objects or tokens; log event id and type.
- Prices only in Stripe (lookup keys `<plan>_<interval>`), never in code.

## Owner steps to list in PRs

- Create the repo; enable secret scanning and push protection.
- GitHub secrets: `STAGING_DATABASE_URL`, `PROD_DATABASE_URL`, `SUPABASE_ACCESS_TOKEN`, `STAGING_REF`, `PROD_REF` (contents: `docs/SECRETS.md`). No Cloudflare secrets: deploys use Cloudflare's Git integration.
- Worker secrets: `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Stripe products and prices (test mode first), webhook endpoint `https://openapphub.org/api/stripe/webhook`, Customer Portal on.
- Supabase Auth: Site URL `https://openapphub.org`; redirect URLs for every production and staging origin; custom SMTP before launch.
- Cloudflare: Worker `openapphub` connected to `main` (build `npm run build`, deploy `npx wrangler deploy`); optional `openapphub-staging` (build `npm run build:staging`); custom domains `openapphub.org` and `staging.openapphub.org`.
- Run `migrate.yml` for production before merging a PR with migrations, in the order in START-HERE.

## Done when

SHARED-SPEC §13 is satisfied, and in Stripe test mode the owner can: sign up → create an org → trial → open each app without signing in again → invite someone → transfer ownership → check out → cancel → read-only → export.
