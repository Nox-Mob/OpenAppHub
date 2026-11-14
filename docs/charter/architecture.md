# Architecture Map

## In short

OpenCharterApp is one app with one database. It's split into modules (like membership, chapters and payments) by folder, so each part stays tidy without needing separate servers.

- **Built with:** TanStack Start (React) running on Cloudflare, with Supabase for the database, sign-in and file storage. The first plan named other tools. The note just below explains what changed and why.
- **Organizations nest.** A national organization can have regions and chapters under it. Database rules keep each one's records apart and let a national see only what's under it.
- **Shared engines** do the jobs many modules need: guided setup, rules, payments and notifications.
- The sections below go from the big picture down to the details.

High-level only. This describes the shape of the system and the shared engines. Schemas, APIs, and screens come later.

> **Current stack (D-100..D-104, D-111).** The original plan named Next.js, pg-boss, Better Auth and Caddy. They were replaced. The app is **TanStack Start (React 19, Vite) running on edge workers**, with **Supabase** for Postgres (with row-level security), Auth (email/password and Google) and Storage. Background work is planned as a **Postgres jobs table plus scheduled server routes** (E-08, deferred). Bun is the package manager. Per-org web addresses and the reverse proxy (E-07, E-22, F-11) are deferred. The structure below (modules, engines, tenancy, RLS) still applies; where a section names the old tools, read it with this substitution.

## 1. Architectural style

A **modular monolith**: one TypeScript codebase (TanStack Start), one deployable app, one PostgreSQL database. Modules are separated by folder and enforced boundaries (each module exposes a small public interface and does not reach into another module's tables). This keeps self-hosting simple while leaving room to extract services later if ever needed.

## 2. System context

```mermaid
flowchart LR
    subgraph Users
        M[Members]
        CA[Chapter admins and officers]
        NA[National admins and committees]
        PA[Platform admin]
        PUB[Public visitors]
    end

    subgraph App["Membership Platform (TanStack Start modular monolith on edge workers)"]
        WEB[Web UI: public sites and portal]
        API[Server functions and server routes]
        ENG[Shared engines]
        MOD[Domain modules]
        JOBS[Scheduled routes over a jobs table]
    end

    DB[(Supabase Postgres with RLS)]
    S3[(Supabase Storage)]
    PROXY[Edge hosting<br/>custom domains later via reverse proxy]
    STRIPE[Stripe]
    PAYPAL[PayPal]
    EMAIL[Email provider<br/>Resend or Postmark]

    PUB --> PROXY
    M --> PROXY
    CA --> PROXY
    NA --> PROXY
    PA --> PROXY
    PROXY --> WEB
    WEB --> API
    API --> MOD
    MOD --> ENG
    MOD --> DB
    ENG --> DB
    JOBS --> DB
    JOBS --> EMAIL
    MOD --> S3
    MOD --> STRIPE
    MOD --> PAYPAL
    STRIPE -- webhooks --> API
    PAYPAL -- webhooks --> API
    EMAIL -- bounces/events --> API
```

> **Diagram description:** A left-to-right system context diagram. On the left are five user groups: Members, Chapter admins and officers, National admins and committees, Platform admin, and Public visitors. All five connect to the edge hosting layer (custom domains come later through a reverse proxy). The hosting layer passes traffic to the Web UI (public sites and portal), which sits inside a box labeled Membership Platform (TanStack Start modular monolith on edge workers). That box contains five parts: Web UI, Server functions and server routes (the API), Shared engines, Domain modules, and Scheduled routes over a jobs table. Inside the box, the Web UI calls the API, the API calls the Domain modules, and the Domain modules call the Shared engines. The Domain modules and the Shared engines both read and write Supabase Postgres, where row-level security isolates tenants. The scheduled routes also use Postgres and send mail through the email provider. The Domain modules additionally connect to Supabase Storage, Stripe, and PayPal. Stripe and PayPal send webhooks back to the API (one webhook address per organization), and the email provider sends bounce and delivery events back to the API. Email, scheduled jobs and PayPal are planned but not built yet. Demo organizations (D-148) never send email: the email sender must check `public.emails_allowed(org)` first.

## 3. Organization hierarchy

```mermaid
flowchart TD
    P[Platform<br/>installer or hosting operator]
    P --> N1[National Org A]
    P --> N2[National Org B]
    P --> L[Standalone local org]
    N1 --> R1[Region optional]
    N1 --> C1[Chapter 1]
    R1 --> C2[Chapter 2]
    R1 --> C3[Chapter 3]
    N2 --> C4[Chapter 4]
```

> **Diagram description:** A top-down hierarchy map. Platform (installer or hosting operator) is the top rung, with three organizations directly below it: National Org A, National Org B, and a Standalone local org. Directly below National Org A are a Region (optional) and Chapter 1. Chapter 2 and Chapter 3 sit below the Region. Chapter 4 sits directly below National Org B. The Standalone local org has no children. This shows that a chapter may hang directly off a national or off a region, and that the region tier is optional.

- A single `organization` concept with a `type` (national, region, chapter, standalone) and a parent. A standalone local org is simply a root org with no children.
- **Permissions and settings flow downward.** Data visibility flows **upward only where explicitly shared or required** (e.g., national sees members of its chapters, documents shared with national).
- The **region tier exists in the data model from day one** (D-035). Region-specific features, such as regional approvals, are built later.
- **Membership model (D-166, D-174, D-176).** Each national chooses once how membership works across its tree: _separate memberships_ (the national and each chapter have their own memberships, levels, dues and standing; two-level dues optional, D-146), or _national membership with a home chapter_ (one membership at the national; the member picks a chapter, which gets a member record standing for that national membership, so the chapter's members, board, directory and reports read the national standing). The choice is a locked setting at the national that a trigger won't let change.
- The **platform tier** exists above all orgs. On self-hosted installs it is the installer. On our hosted service it is us, managing customer orgs and hosting billing, which is separate from any org's own payment accounts.

## 4. Tenancy and request resolution

1. **Host-based resolution.** Middleware maps the incoming hostname to an organization:
   - `*.nationaldomain` → chapter by subdomain slug (default).
   - Verified custom domains table → chapter (optional, per D-033).
   - Bare national domain → national.
   - Admin and portal routes use the same host, scoped by the signed-in user's permissions.
2. **Org context** is set per request and is carried into the database session so **Row-Level Security** policies enforce isolation as a second line of defense behind application checks.
3. **Scope path.** Org hierarchy is stored so "this org and all descendants" queries are cheap: `organizations.ancestor_ids`, kept by trigger, and `org_subtree`. Every table and how they connect: `docs/tables.md`.
4. **Custom domains:** DNS verification, then certificate issuance by the reverse proxy (on-demand TLS gated by an "is this a verified domain" check).

## 5. Authorization model

- **RBAC scoped to an org node.** A role assignment is (person, role, org node). It applies at that node and **inherits downward**.
- **Permissions** are fine-grained capabilities (`members.read`, `awards.approve`, `documents.manage`, and so on). Roles are bundles of permissions. Platform ships default roles. Orgs may define more.
- **Board seats generate role assignments.** Appointing a person to the Chapter President seat creates the linked assignment, ending the term removes it. Titles are display only.
- **Eligibility gates** layer on top of permissions: an officer or approver must also be in good standing, and some actions require a rank.
- **Every authorization decision** goes through one policy layer, never ad hoc in components.

### Identity across organizations

- A **person** is global to the install and owns the login identity (email, credentials, sessions). Everything else belongs to a **membership in a specific org**: profile fields, attribute values, preferences, consents, and standing.
- **Signing up for an org with an email that already has an account** adds that person to the new org. The person proves ownership by signing in (or verifying the email), and the sign-up flow never reveals to anyone that an account already exists elsewhere.
- **No cross-org data flow.** If two orgs both have an "address" attribute, the second is blank. It is not pre-filled or offered. Orgs and their admins cannot see a person's other memberships.
- **Org switcher:** a person with roles in several orgs picks the active org context. Permissions and data are evaluated per org context, and each context's data stays separate.
- Duplicate accounts from different emails are accepted. A manual admin merge tool is a possible later addition.
- Consequence for the database: attribute values, profile data, and preferences are keyed by **membership** (person + org), not by person.

### Branding and logos

- Every org can have branding: logo (with light and dark variants), small icon or favicon, colors, and an email/receipt header image.
- **National sets the default.** A chapter may **override** with its own logo. Resolution falls back chapter → region → national → platform default, per asset, so a chapter can override only the logo and keep national's colors.
- National can set whether chapters may override branding (inherit / override allowed / locked), like any other setting.
- Resolved branding is used on the org's public site, the portal, **emails, receipts, certificates, and award documents**, always for the **issuing org** (a chapter receipt carries the chapter logo if it has one).
- Logos are stored in object storage with size and type limits, SVG sanitization, and generated size variants. Receipts store a reference to the branding version used so reissued documents stay faithful.

## 6. Shared engines

These are built once and reused. Most of the product's "intelligence" lives here.

```mermaid
flowchart TB
    subgraph Engines
        ATTR[Attribute engine]
        RULES[Rules engine]
        SETUP[Setup engine]
        WF[Approval workflow engine]
        FORM[Form builder]
        AUTO[Automation engine]
        NOTIF[Notification and signed-action links]
        AUDIT[Audit log]
        PAY[Payment gateway abstraction]
        RCPT[Receipt engine]
    end

    SETUP --> ATTR
    SETUP --> RULES
    RULES --> ATTR
    FORM --> ATTR
    WF --> RULES
    WF --> NOTIF
    AUTO --> NOTIF
    PAY --> RCPT
```

> **Diagram description:** A top-to-bottom dependency diagram of ten shared engines inside one group labeled Engines. An arrow means "uses" or "depends on". The engines are: Attribute engine, Rules engine, Setup engine, Approval workflow engine, Form builder, Automation engine, Notification and signed-action links, Audit log, Payment gateway abstraction, and Receipt engine. The connections are: Setup engine uses the Attribute engine and the Rules engine; the Rules engine uses the Attribute engine; the Form builder uses the Attribute engine; the Approval workflow engine uses the Rules engine and the Notification engine; the Automation engine uses the Notification engine; and the Payment gateway abstraction uses the Receipt engine. The Audit log has no arrows because every module writes to it.

| Engine                                   | Responsibility                                                                                                                                                                                                                                                                                 | Used by                                                            |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **Attribute engine**                     | Org-defined fields on members, chapters, and other entities: type (text, number, date, single/multi select, boolean, ordered list such as rank), validation, visibility, who can edit, required, and value history where needed. Chapter attributes are defined by national, at setup or later | Members, chapters, pricing, eligibility, awards, forms, exports    |
| **Rules engine**                         | Declarative conditions and effects, authored in a UI and stored as data. Example: _if attribute rank in [E1, E2] then price = X_. Also eligibility and approver rules. No arbitrary code                                                                                                       | Pricing, voter/candidate eligibility, award routing, automations   |
| **Setup engine**                         | Guided questionnaires that create configuration for each module, re-runnable, with national-driven setup for chapters. See `setup-engine.md`                                                                                                                                                   | Every configurable module                                          |
| **Approval workflow engine**             | Multi-step approvals with configurable steps, approver resolution (by role, rank, chapter), escalation, delegation to national, outcomes, appeals, batch approval, and audit                                                                                                                   | Awards first, then documents, applications, bylaw changes          |
| **Form builder**                         | Org-defined forms with fields, conditional logic, file uploads, and linkage to attributes. Submissions are stored as structured data                                                                                                                                                           | Award submissions, applications, event registration, board reports |
| **Automation engine**                    | Domain events → jobs in a Postgres jobs table, run by scheduled server routes (D-103; replaces pg-boss): scheduled checks, reminders, escalations, and notifications                                                                                                                           | All modules                                                        |
| **Notification and signed-action links** | Email and in-app notifications. **Signed one-click links** carry a single-use, expiring token bound to the approver and the specific request                                                                                                                                                   | Approvals, reminders, invitations                                  |
| **Audit log**                            | Append-only record of admin actions, financial changes, governance, documents, awards, exports, elections                                                                                                                                                                                      | All modules                                                        |
| **Payment gateway abstraction**          | One interface, Stripe and PayPal adapters, per-org credentials or connected accounts, transaction records capture receiving org, gateway, fees                                                                                                                                                 | Dues, donations, events, awards, future store                      |
| **Receipt engine**                       | Templated, immutable receipts driven by tax profile and item tax treatment. Manual and automatic. Void and reissue                                                                                                                                                                             | All payments                                                       |

### Signed one-click approval links

Email security scanners and link previewers often **prefetch every link in an email**. A link that approves on a plain GET could be triggered by a scanner. So the link opens a **confirmation page** (with the optional comment field and the decision button), and the state change happens on submit. It is still one click from the email plus one confirmation, and it is safe. Tokens are single-use, expire, and are bound to the approver and request.

## 7. Domain modules

Modules call engines and each other only through public interfaces. Built today (`src/modules`): attributes, branding, chapters, demo, governance, invitations, members, membership (levels, memberships, joining, pricing, home chapter), payments, receipts, reports, roles, setup. The table lists the target set.

| Module                    | Notes                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Organizations             | Hierarchy (including region), settings, branding and logo override, tax profile, chapter wizard, chapter attributes |
| Identity and access       | Global person and account, org membership on sign-up, org switcher, invitations, roles, assignments                 |
| Members                   | People, memberships per org, member attributes, standing, directory, lists and exports                              |
| Dues                      | Tiers, terms, pricing rules, prepaid/postpaid, balances, two-level dues and national controls                       |
| Governance                | Role templates, seats, appointments, vacancies, board reports, oversight dashboard                                  |
| Elections                 | Positions, nominations, voting (single, ranked choice), certification, auto-appointment                             |
| Documents                 | Libraries, categories, versions, visibility, change alerts, compliance tracking                                     |
| Awards                    | Catalog, families, policies, submissions, routing, purchase, fulfillment                                            |
| Payments                  | Gateways, transactions, invoices, refunds, national fee                                                             |
| Receipts                  | Templates, issuance, manual receipts, year-end statements                                                           |
| Donations and fundraising | Campaigns, recurring gifts, peer-to-peer, sponsorships                                                              |
| Events                    | Events, tickets, registrations, check-in, waitlists, FMV                                                            |
| Corporate                 | Company accounts, seats, company admin                                                                              |
| Communications            | Templates, segments, bulk email, reminders                                                                          |
| Public sites              | Public pages, forms, widgets, domains                                                                               |
| Reporting and export      | Dashboards, roll-ups, CSV exports, accounting export                                                                |
| Platform admin            | Tenant management, hosting billing, usage metering, system settings                                                 |
| Store _(future)_          | Generic products, cart, orders, vendors, inventory                                                                  |

## 8. Payments architecture

- **One gateway interface** (create payment, create subscription, refund, webhook handling, payout reference) with **Stripe** first and **PayPal** later.
- **Each org connects its own account.** Every transaction stores: receiving org, gateway, gateway reference, gross, fees, any national fee, and the item type it paid for.
- **Two entities, two payments.** If a member owes both national and chapter dues (separate-memberships model with two-level dues), checkout produces two independent payments with two receipts, national first. In the home-chapter model there is one payment, to the national.
- **National fee:** optional, settled by invoice: a parent org invoices a subordinate org through E-20's invoicing (D-162). Payments are **Direct** only: each org collects into its own Stripe (or later PayPal) account; Stripe Connect is not used (supersedes the two-mode plan in D-049).
- **Webhooks** are the source of truth for payment state. Handlers are idempotent. While the return page waits, it also asks Stripe how the checkout ended (D-158); both paths apply a payment once.
- **Return links** use the app's public address (`PUBLIC_APP_URL`, else the browser's), never the server's internal URL (D-158).
- **Export:** an audited transaction CSV per org or across a national's tree (D-173, implements D-047).
- Card data never touches our servers (PCI SAQ-A scope).

## 9. Approval workflow (awards as the reference case)

```mermaid
flowchart TD
    S[Submission created<br/>member, officer, or admin] --> R{Resolve nominee chapter<br/>and award policy}
    R --> E{Eligible approver<br/>exists at this tier?}
    E -- yes --> Q[Route to approver<br/>email with signed link and portal queue]
    E -- no --> N[Escalate to national]
    Q --> D{Decision}
    D -- approve --> NEXT{More steps in chain?}
    D -- decline --> O[Outcome per award policy<br/>final or appeal allowed]
    D -- request changes --> SUB[Back to submitter]
    D -- no response --> REM[Reminders then escalate to national]
    REM --> N
    N --> NB[National review or board meeting<br/>single or batch approval]
    NB --> NEXT
    NEXT -- yes --> R
    NEXT -- no --> PAY[Approved: purchase options,<br/>payer per award setting]
    PAY --> F[Fulfillment tracked by national]
    SUB --> R
```

> **Diagram description:** A top-down flowchart of the award approval workflow. It starts with a submission created by a member, officer, or admin. Next the system resolves the nominee's chapter and the award's policy. A decision asks whether an eligible approver exists at this tier. If yes, the request is routed to the approver by email with a signed link and in the portal queue. If no, it is escalated to national. After routing, the approver's decision has four outcomes: approve, decline, request changes, or no response. Approve leads to a check for more steps in the chain. Decline leads to an outcome set by the award policy (final, or appeal allowed). Request changes sends the item back to the submitter, who resubmits and the flow returns to resolving the chapter and policy. No response triggers reminders and then escalation to national. Escalated items go to national review or a board meeting, where approval can be single or batch, and then rejoin the check for more steps. If more steps remain, the flow loops back to resolving the policy for the next step. If none remain, the award is approved, purchase options open with the payer set by the award's setting, and fulfillment is tracked by national.

Rank-based approval: when an approver must hold a certain rank, the chapter president can confirm the approver's rank, which sets a **rank verified flag** on the step so national's review is faster. Rank comes from the member attribute system.

## 10. Automation inventory (events → actions)

| Event                                            | Actions                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| Chapter created                                  | Run chapter wizard, prompt for required board seats, invite appointees |
| Officer appointed or removed                     | Grant or revoke access, notify chapter and national                    |
| Seat vacant beyond threshold                     | Alert chapter, escalate to national                                    |
| Term ending soon                                 | Prompt chapter to start election or appointment                        |
| Report due soon or overdue                       | Remind, escalate to national                                           |
| Membership expiring or lapsed                    | Reminders, standing change, officer good-standing check                |
| Postpaid invoice due or overdue                  | Notices, standing change per admin-set rules                           |
| Document updated or required document missing    | Notify national, remind chapter                                        |
| Award submitted, step pending, stalled, approved | Route, remind, escalate, notify stakeholders, start purchase           |
| Election phase change                            | Open nominations, voting reminders, certify, appoint winners           |

## 11. Documents and storage

- Files are stored in S3-compatible storage under org-scoped keys. Access is by short-lived signed URLs after an authorization check.
- Every upload creates a version. Metadata (type, visibility, uploader, effective date) lives in Postgres.
- Document type categories and required types are defined by national and inherited.

## 12. Deployment topology (target state, packaging deferred to F-11)

**Today:** the hosted app is a Cloudflare Worker (TanStack Start) on the shared OpenAppHub Supabase database (Postgres, Auth, Storage). Charter's tables are in schema `charter` on the suite core (`db/core`), built by `db/migrations` and applied with `scripts/migrate.mjs` (the owner's Migrate workflow). The app reads schema `charter` (every Supabase client is created with `db: { schema: "charter" }`) and core tables with `.schema("public")`; the organization tree is `charter.units`, each unit's `org_id` is its OpenAppHub organization (the top unit's id). **Self-host packaging** (Docker image, Compose file, reverse-proxy configuration) **is not built early** (D-012). The target topology for self-hosting:

```mermaid
flowchart LR
    I[Internet] --> C[Reverse proxy<br/>wildcard and on-demand TLS]
    C --> A[App<br/>TanStack Start server]
    A --> D[(PostgreSQL with RLS)]
    S[Scheduler<br/>calls scheduled routes] --> A
    A --> O[(Object storage)]
    A --> AU[Auth service<br/>Supabase-compatible]
```

> **Diagram description:** A left-to-right deployment diagram of the self-host target (packaging deferred to F-11). Internet traffic goes to a reverse proxy (wildcard and on-demand TLS), which forwards to the App, a TanStack Start server. The App connects to a PostgreSQL database with row-level security, to object storage, and to a Supabase-compatible auth service. A scheduler calls the App's scheduled routes, which process the jobs table. On the hosted service, Supabase provides the database, auth and storage, and Cloudflare Workers the hosting.

- **Self-host (later, F-11, D-160, D-168):** a lightweight Docker Compose install. The **default** is one app container (the TanStack Start server on Node) plus a hosted Supabase project for Postgres, Auth and Storage, which keeps cloud costs low; a documented alternative self-hosts a minimal Supabase subset (Postgres, Auth, REST, Storage). A reverse proxy (Caddy) provides TLS. Email uses the client's own server (`EMAIL_TRANSPORT=smtp`, D-159). Business rules live in SQL functions and `src/lib/policy` so only adapters change (R-20).
- **Hosted:** the same code and image, multiple installs or a multi-tenant install, plus the platform-tier admin and billing.
- Configuration through environment variables. No dependency on a single cloud vendor's proprietary features.

## 13. Cross-cutting concerns

| Concern              | Approach                                                                                                                                                                                                                                                                    |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Security             | RLS plus app-level authorization, CSRF protection, rate limiting, secrets in env or a secrets manager, encrypted storage of gateway credentials                                                                                                                             |
| Privacy              | Consent tracking, data export and deletion tools, member privacy preferences honored in directories and exports, audited exports                                                                                                                                            |
| Auditability         | Append-only audit log, immutable receipts and certified election results                                                                                                                                                                                                    |
| Observability        | Structured logs, error tracking, job queue dashboards, health checks                                                                                                                                                                                                        |
| Accessibility        | WCAG 2.1 AA target for public and member-facing UI; automated name, heading and keyboard checks in the end-to-end suite (D-183)                                                                                                                                             |
| Internationalization | English and USD first. Keep strings and currency out of hard-coded paths so it can be added                                                                                                                                                                                 |
| Performance          | Lists past 1,000 rows are read in pages (the API's limit); roll-ups resolve inherited settings once per org; `bun run test:perf` with 5,000, 10,000 and 20,000 members, budget under 1 second per read (D-181, D-209)                                                       |
| Testing              | Unit and component tests with Vitest, database rule tests against a throwaway Postgres (`db/tests/`), end-to-end flows with Playwright against the live demo backend (D-175), a live smoke suite, with tenant-isolation tests as a first-class category (`docs/testing.md`) |
| Backups              | Documented backup and restore for self-hosters, automated for hosted                                                                                                                                                                                                        |

## 14. Repository layout

```
/src
  /routes              TanStack Start routes (public, portal, admin, api)
  /modules             domain modules, each with its own public interface
                       built: attributes, branding, chapters, demo, governance,
                       invitations, members, membership (tiers, dues, joining),
                       payments, receipts, reports, roles, setup
                       planned: documents, elections, awards, events, ...
  /engines             built: attributes, payments, rules, settings, setup
                       planned: approvals, forms, automation, notifications
  /components          UI by area (org, members, membership, governance, ...)
  /lib                 shared utilities, policy layer, db readiness
/db/core              suite core (vendored from OpenAppHub; never edited here)
/db/migrations        SQL migrations for schema charter (tables, RLS policies, RPCs)
/db/tests              database rule tests
/db/perf               performance check (5,000 to 20,000 members)
/db/seed               staging demo data (--seed)
/docker                (added later, F-11) compose files, proxy config
/docs                  these planning docs
```

## 15. Extension points (designed for, not built)

- **Generic store:** products and orders reuse the cart, payment gateway abstraction, and receipt engine. Awards purchase options are modeled as products from the start so the store is an extension, not a rewrite.
- **Vendor and inventory:** fulfillment records reference an optional vendor and inventory item later.
- **Regional tier:** the hierarchy and policy engine already allow a region level. Features switch on later.
- **Reply-by-email approvals:** the notification layer exposes an inbound hook later.
- **Delegate elections:** election eligibility rules can reference a delegate attribute or seat.
