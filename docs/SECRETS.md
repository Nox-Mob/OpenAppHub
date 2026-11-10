# Secrets and variables: what goes in each

Everything the hub needs, where it's set, what it contains and when it's needed. Never paste a
secret into a file, an issue, a PR or a chat. Public values (`VITE_*`) are already in
`wrangler.jsonc`; nothing to do for those.

## 1. GitHub Actions secrets

Set in GitHub → **Nox-Mob/OpenAppHub → Settings → Secrets and variables → Actions → New repository
secret**. Used only by workflows; never reach the website.

| Name                    | Contains                                                                                                                                                                                                                            | Where to get it                                                                                                                                                                                                  | Needed by / when                                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `STAGING_DATABASE_URL`  | The Postgres connection string for **openapphub-staging**, Session pooler, including the database password. Looks like `postgresql://postgres.mbloxixlykmbuuoaprnx:YOUR-DB-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres` | Supabase → openapphub-staging → **Connect** (top bar) → **Session pooler** → copy the URI and replace `[YOUR-PASSWORD]` with the database password (Project Settings → Database → reset it if you don't have it) | `staging.yml` (staging migrations + seed on every push to `main`), `demo-reset.yml` (suite demo reset every 12 hours) and `migrate.yml`. **Now** |
| `PROD_DATABASE_URL`     | Same, for **openapphub-prod**: `postgresql://postgres.ymlesgadawnjupnvgokd:YOUR-DB-PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres`                                                                                         | Supabase → openapphub-prod → Connect → Session pooler                                                                                                                                                            | `migrate.yml` with target `production` (only when you run it). **Now**                                                                           |
| `SUPABASE_ACCESS_TOKEN` | A Supabase **personal access token**, starts with `sbp_`                                                                                                                                                                            | supabase.com → your avatar → **Account preferences → Access Tokens** → Generate new token                                                                                                                        | `gen-types.yml` (generating TypeScript types from the schema). Later; not built yet                                                              |
| `STAGING_REF`           | The staging project ref: `mbloxixlykmbuuoaprnx`                                                                                                                                                                                     | already known                                                                                                                                                                                                    | `gen-types.yml`. Later                                                                                                                           |
| `PROD_REF`              | The production project ref: `ymlesgadawnjupnvgokd`                                                                                                                                                                                  | already known                                                                                                                                                                                                    | `gen-types.yml`. Later                                                                                                                           |

Notes:

- Use the **Session pooler** string (port **5432**), not "Direct connection" (GitHub can't reach
  its IPv6 address) and not "Transaction pooler" (port 6543 breaks migrations).
- If the password contains `@`, `:`, `/`, `#` or `?`, URL-encode it (`@` → `%40`), or reset it to
  letters and digits only.
- `STAGING_REF` and `PROD_REF` aren't really secret; they can also be Actions **variables**.
- **The app repos** (OpenCharterApp, openboardapp, OpenLedgerApp) need the same two secrets,
  `STAGING_DATABASE_URL` and `PROD_DATABASE_URL`, with the same values, for their own
  `migrate.yml`. They can be repository secrets or secrets on the `staging` / `production`
  environments (the workflow runs in the environment named by its target).
- **Not needed any more:** `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Deploys use your
  Cloudflare Git connection (section 3), not GitHub Actions.

## 2. Worker secrets (Cloudflare)

Set in Cloudflare → **Workers & Pages → the Worker → Settings → Variables and Secrets → Add →
type Secret**. Set each on **both** Workers (`openapphub` for production, `openapphub-staging` for
staging), with that environment's value. They're readable only by server code, never the browser.

| Name                        | Contains                                                                                                                                                                                                                                                                    | Where to get it                                                                                                                                                                                                                                                                                                                                              | When                                                                                                                                                            |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_SERVICE_ROLE_KEY` | The Supabase **secret** key for that project. It bypasses all security rules, so it's used only for invitation emails, account deletion and staging demo tools (SHARED-SPEC §7.2). Starts with `sb_secret_` (or a long `eyJ…` JWT if you use the legacy `service_role` key) | Supabase → project → **Project Settings → API Keys → Secret keys** (create one named `hub-worker`)                                                                                                                                                                                                                                                           | **In use**: sends invitation emails and deletes accounts. Without it, invitations still work (the inviter gets a link to share) and account deletion is refused |
| `STRIPE_SECRET_KEY`         | Stripe secret API key: `sk_test_…` on staging, `sk_live_…` on production at launch (use `sk_test_` on both until then). A **restricted key** (`rk_…`) with Checkout, Customers, Subscriptions, Billing Portal and Webhook read/write also works                             | Stripe → **Developers → API keys**                                                                                                                                                                                                                                                                                                                           | Phase 4 (billing)                                                                                                                                               |
| `STRIPE_WEBHOOK_SECRET`     | The signing secret of the webhook endpoint, `whsec_…`. Different for each endpoint                                                                                                                                                                                          | Stripe → Developers → **Webhooks** → add endpoint `https://openapphub.org/api/stripe/webhook` (staging: `https://staging.openapphub.org/api/stripe/webhook`) → **Signing secret**. Events to send: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_failed` | Phase 4                                                                                                                                                         |

**Prices are not a secret any more:** the hub finds them in Stripe by **lookup key**. Each price
needs the key `<plan>_<interval>`: `starter_month`, `starter_year`, `suite_month`, `suite_year`,
`plus_month`, `plus_year` (Product catalog → product → price → Lookup key), in the sandbox and in
live mode. To change a price, create the new price in Stripe and move the lookup key to it
("Transfer lookup key"); the site picks it up within 5 minutes and existing subscribers keep their
old price. A plan with no active price shows "Price TBA" and can't be chosen. Delete any
`STRIPE_PRICE_MAP` secret left on the Workers; nothing reads it.

Later, if the hub sends email itself rather than through Supabase Auth: `SMTP_HOST`,
`SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`. Not needed while Supabase sends the emails
(set custom SMTP in Supabase instead, section 4).

## 3. Cloudflare build settings (Git connection)

Workers & Pages → the Worker → **Settings → Build**:

| Worker                          | Branch                         | Build command           | Deploy command        | Build variables |
| ------------------------------- | ------------------------------ | ----------------------- | --------------------- | --------------- |
| `openapphub` (production)       | `main`                         | `npm run build`         | `npx wrangler deploy` | none needed     |
| `openapphub-staging` (optional) | `main` (or a `staging` branch) | `npm run build:staging` | `npx wrangler deploy` | none needed     |

- The Worker's name in Cloudflare must match `wrangler.jsonc`: **`openapphub`** for production,
  **`openapphub-staging`** for staging. If yours is named differently, tell me and I'll change the
  config (or rename the Worker).
- Node version comes from `.nvmrc` (22).
- `npm run build` alone builds **production**: the top level of `wrangler.jsonc` is production.
  `build:staging` selects the staging settings.
- Custom domains (`openapphub.org`, `staging.openapphub.org`) are in `wrangler.jsonc` and get
  attached on deploy; you can also add them under the Worker's **Domains & Routes**.
- **Merging to `main` deploys production.** Run `migrate.yml` against production _before_ merging
  a PR with new migrations.

## 4. Supabase settings (not secrets, but needed for sign-in)

On **both** projects, Supabase → **Authentication**:

| Setting                                            | Production (openapphub-prod)                                                                                                                                 | Staging (openapphub-staging)                                                                                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| URL Configuration → Site URL                       | `https://openapphub.org`                                                                                                                                     | `https://staging.openapphub.org`                                                                                                                                     |
| URL Configuration → Redirect URLs                  | `https://openapphub.org/auth/callback`, `https://openapphub.org/invite/**`                                                                                   | `https://staging.openapphub.org/auth/callback`, `https://staging.openapphub.org/invite/**`, `http://localhost:3000/auth/callback`, `http://localhost:3000/invite/**` |
| Sign In / Providers → Email                        | on, **Confirm email** on                                                                                                                                     | same                                                                                                                                                                 |
| Sign In / Providers → Google                       | on: Client ID + secret from Google Cloud → APIs & Services → Credentials (OAuth client, type Web; authorised redirect URI = the callback URL Supabase shows) | same (can share the Google client)                                                                                                                                   |
| Sign In / Providers → "Allow new users to sign up" | **off until launch**                                                                                                                                         | on, if you want to test sign-up                                                                                                                                      |
| Emails → SMTP Settings                             | custom SMTP before launch                                                                                                                                    | optional                                                                                                                                                             |
| Emails → Templates → **Invite user**               | Wording of the invitation email for people new to OpenAppHub (its link brings them to the invitation page)                                                   | same                                                                                                                                                                 |

On **both** projects, Supabase → **Project Settings → Data API → Exposed schemas**: add `charter`,
`board` and `ledger` (keep `public`; never add `billing`, `hub` or `ops`). The apps' clients read
their own schema through it once they switch over; adding it before is harmless.

Later, when the other apps go live, add their callback URLs too (for example
`https://charter.openapphub.org/auth/callback`).

## 5. Public variables (already set; for reference)

In `wrangler.jsonc` per environment. Shipped to the browser; not secret.

| Name                            | Contains                                                                                      |
| ------------------------------- | --------------------------------------------------------------------------------------------- |
| `VITE_HOSTED`                   | `true` on openapphub.org and staging (part of the suite); `false` for self-hosted copies      |
| `VITE_APP_ID`                   | `hub`                                                                                         |
| `VITE_SUPABASE_URL`             | The project URL (`https://<ref>.supabase.co`)                                                 |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | The project's **publishable** key (`sb_publishable_…`). Public by design; safe in the browser |
| `VITE_HUB_URL`                  | The hub's own address                                                                         |
| `VITE_COOKIE_DOMAIN`            | `.openapphub.org`: shares the sign-in and the theme choice across the suite                   |
| `VITE_SUITE_URLS`               | JSON of app addresses: `{"hub":…,"charter":…,"board":…,"ledger":…}`                           |
| `VITE_DOCS_URL`                 | `https://docs.openapphub.org`                                                                 |
| `VITE_SIGNUPS_OPEN`             | `false` on production until launch (shows "Sign-ups are closed")                              |
| `VITE_DEMO_LOGIN`               | `true` on staging only: sign-in buttons for the suite demo accounts. Never on production      |
