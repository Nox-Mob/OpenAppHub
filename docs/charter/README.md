# Membership Platform — Planning Docs

## In short

OpenCharterApp is free, open-source software that runs membership for nonprofit associations: members, dues, chapters, board seats, elections, documents and awards. It works for one organization, or for a national one with chapters under it.

- **New to the code?** Read [`instructions.md`](instructions.md) first. It has the working rules and the checklist for every pull request.
- **Want the "why"?** [`decisions.md`](decisions.md) lists every choice, with an ID you can cite.
- **Want the big picture?** [`architecture.md`](architecture.md) shows how the parts fit.
- The table below lists every document in this folder and what question it answers.

> Name: **OpenCharterApp**. An open-source (AGPL), multi-tenant membership management platform for non-profit associations with national organizations and local chapters. Feature set modeled on Tendenci, plus governance, elections, documents, and awards.

## Purpose of these docs

These documents are the shared reference for the whole build. At any point in development they should answer: _what are we building, why, and in what order._ They are deliberately high level. Database design, API design, and UI design come next and will be derived from these.

## Document index

| Doc                                                          | What it answers                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`README.md`](README.md)                                     | This index, the vision, scope, and how to use the docs                                                                                                                                                                                                                                                                                                                                       |
| [`instructions.md`](instructions.md)                         | **Start here if you are joining the codebase.** Working rules, commit requirements (tests, docs), and PR checklist                                                                                                                                                                                                                                                                           |
| [`decisions.md`](decisions.md)                               | Every decision made so far, with IDs we can cite in tickets                                                                                                                                                                                                                                                                                                                                  |
| [`architecture.md`](architecture.md)                         | How the system is structured: tiers, tenancy, engines, modules, deployment                                                                                                                                                                                                                                                                                                                   |
| [`epic.md`](epic.md)                                         | Phased roadmap, epic map, dependencies, and scrum guidance                                                                                                                                                                                                                                                                                                                                   |
| [`setup-engine.md`](setup-engine.md)                         | The guided setup/configuration engine design                                                                                                                                                                                                                                                                                                                                                 |
| [`data-domains.md`](data-domains.md)                         | Entity inventory by domain, the input to database design                                                                                                                                                                                                                                                                                                                                     |
| [`tables.md`](tables.md)                                     | Every database table in use: a mind map, diagrams by area, and a reference of what each table holds, links to and how it's written                                                                                                                                                                                                                                                           |
| [`glossary.md`](glossary.md)                                 | Shared vocabulary                                                                                                                                                                                                                                                                                                                                                                            |
| [`risks-and-open-questions.md`](risks-and-open-questions.md) | What is still unresolved, and what could hurt us                                                                                                                                                                                                                                                                                                                                             |
| [`security-review.md`](security-review.md)                   | The release security, accessibility and performance review: findings, follow-ups and how to re-run it                                                                                                                                                                                                                                                                                        |
| [`testing.md`](testing.md)                                   | How to run checks locally, how CI works, and how database rule tests are built                                                                                                                                                                                                                                                                                                               |
| [`user-testing.md`](user-testing.md)                         | What to test by hand in the live app, step by step, with the demo accounts                                                                                                                                                                                                                                                                                                                   |
| [`demo-data.md`](demo-data.md)                               | Demo accounts and organizations, how the demo national is set up, and how to remove them                                                                                                                                                                                                                                                                                                     |
| [`plans/`](plans/)                                           | Current plans: [`phases-1-3-review.md`](plans/phases-1-3-review.md) (where Phases 1–3 stand and the waves for what's left) [`wave-a-mvp.md`](plans/wave-a-mvp.md) (the MVP plan) and [`release-v0.1.0.md`](plans/release-v0.1.0.md) (what's left before tagging v0.1.0, and the pull request description). Finished plans are removed; their outcome lives in `decisions.md` and git history |

## Vision

One platform where:

- A **local association** can run itself: members, dues, events, donations, board, documents.
- A **national organization** can run many chapters: set the rules, define the board structure, see compliance at a glance, and still let chapters operate independently.
- **Each level collects its own money** into its own Stripe (later also PayPal) account and issues its own receipts. A national can instead offer one national membership with a home chapter (D-166).
- **Governance is built in**: required board seats, board reports, elections, document compliance, and award approvals routed to the right people automatically.
- Organizations **configure it to match how they actually work** (custom attributes, custom terms, custom titles) through a guided setup rather than a developer.

## Scope

**In scope:** organizations and chapters, users and roles, custom attributes, membership and dues (prepaid and postpaid, two-level), member lists and exports, governance and board management, elections, document repository, awards, payments and receipts, donations and fundraising, events and registration, corporate memberships, public sites and custom domains, communications, reporting, generic accounting CSV export, platform admin and hosting billing.

**Out of scope (for now):** migration from other systems (CSV bulk-add only), tool-specific accounting formats, a general merchandise store, vendor and inventory tracking, delegate-based national elections, regional approval tier, reply-by-email approvals. Several of these are designed for but not built (see `epic.md` → Future).

## Guiding principles

1. **Configurable, not hard-coded.** Term lengths, tier names, titles, ranks, and approval chains are all org-defined. Examples in conversation (1/3/lifetime, E1–E6) are never assumptions in code.
2. **National sets guardrails, chapters operate within them.** Every national-controllable setting has a clear "inherit / override / locked" behavior.
3. **Each tax entity stands alone.** Money, receipts, and records belong to the org that received them.
4. **Everything important is audited.**
5. **Automate the chase.** The system, not a person, notices vacancies, overdue reports, pending approvals, and expiring memberships.
6. **Self-hostable by design.** Configuration is environment-driven and there is no vendor lock-in, so the hosted service runs the same code as self-hosters. Packaging comes later (backlog item F-11): a lightweight Docker Compose install whose default is the app container plus a hosted Supabase project (D-160, D-168).
7. **Build shared engines once** (attributes, rules, approvals, forms, automations, setup) and reuse them across modules.

## How to use these docs with Scrum

- **Epics** in `epic.md` map one-to-one to backlog epics. Each has an ID (`E-xx`).
- **Decisions** in `decisions.md` have IDs (`D-xxx`). Reference them in stories and acceptance criteria.
- Stories are written when an epic is pulled into planning, not up front.
- When a decision changes, update `decisions.md` and note the superseded ID rather than deleting it.
- Update `risks-and-open-questions.md` at each sprint review.

## Diagram convention

Every diagram (Mermaid or image) is followed by a **"Diagram description"** block that explains in plain prose what the picture shows: the shapes, the groupings, and what each arrow means. The description must be enough for someone who cannot see the picture, or for a tool that cannot interpret it, to understand the structure.

- Write the description when the diagram is created, and update it **in the same change** whenever the diagram changes.
- Describe structure and meaning, not styling. Say what sits above, below, or inside what, and what an arrow means.
- Keep the description factual. Explanatory prose stays in the surrounding text.

## Current status

Phases 1 and 2 meet their exit criteria, and the MVP release (v0.1.0) is built and live (migrations up to 0039 applied, 0040 waiting); what's left before tagging is in [`plans/release-v0.1.0.md`](plans/release-v0.1.0.md), with the plan in [`plans/wave-a-mvp.md`](plans/wave-a-mvp.md) and the root [`README.md`](../README.md) "Where it stands". Day-to-day progress is in [`/roadmap.md`](roadmap.md); epic status is in [`epic.md`](epic.md).
