# Releasing v0.1.0

Status on 2026-11-05. The MVP on branch `BoardUpdates` is built and live (every migration applied, up to `0045`). This page says where the release stands, what's left and who does it, and holds the pull request description to use. The plan behind it is [`wave-a-mvp.md`](wave-a-mvp.md); remove this page once `v0.1.0` is tagged.

## 1. Where we are

| Area             | State                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Features         | Wave A (A1–A8), release hardening (R1–R3, R5–R7) and Sprint 4 "ready for real use" (U1–U7) are built. See `CHANGELOG.md` for the full list                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Database         | `0000`–`0045` applied to the live database; nothing waiting. The last were security fixes (D-207, D-208) and indexes for 20,000-member rosters (D-209)                                                                                                                                                                                                                                                                                                                                                                                                       |
| Automated checks | GitHub runs, on every push: lint, formatting, types, 429 unit and component tests, 35 database rule test files (each migration in one transaction), migration conventions, a performance budget at 5,000, 10,000 and 20,000 members, a dependency audit and the build (`ci.yml`). On pushes to `BoardUpdates` and `main`, pull requests to `main`, daily and on demand: the live smoke test (89 checks) and 51 end-to-end tests in Chrome against the live demo, including about 40 steps of the user-testing guide (`live.yml`). All green on the last runs |
| Security         | Review done (`docs/security-review.md`), follow-ups F1–F3 closed; `bun audit`: 2 moderate advisories in development tooling only                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Demo data        | Demo National (for tests) and **Test-Demo**, a sales demo with 15 chapters, ~500 members with years of history and a full board (`docs/demo-data.md`)                                                                                                                                                                                                                                                                                                                                                                                                        |
| Version          | `package.json` is `0.1.0`; `CHANGELOG.md` lists what's in it and the known limits                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 2. What's left before tagging

| #   | Item                                                                                                                                                                           | Who                | Notes                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | ~~Apply the waiting migrations~~                                                                                                                                               | Owner              | Done: `0000`–`0045` applied                                                                                                                                                                            |
| 2   | Live Stripe test-mode run on a non-demo test org (A1)                                                                                                                          | Owner              | Needs a Stripe test account; `docs/user-testing.md` §10                                                                                                                                                |
| 3   | Receipt tax wording looked at by a CPA (R4, R-07)                                                                                                                              | Owner              | If not done, 0.1.0 ships the placeholder wording; the changelog says so                                                                                                                                |
| 4   | ~~Final privacy policy and terms of service text~~                                                                                                                             | Owner              | Done (D-210, D-214), including the legal and support emails                                                                                                                                            |
| 5   | Add the AGPL-3.0 `LICENSE` file and `"license": "AGPL-3.0-only"` in `package.json` (R-24)                                                                                      | Owner / maintainer | GitHub: Add file → Create new file → `LICENSE` → Choose a license template → GNU AGPL v3                                                                                                               |
| 6   | A person's pass through `docs/user-testing.md`                                                                                                                                 | Owner              | The guide marks what the browser tests already check; the rest needs judgement (looks, wording, phones, printing, screen readers) or real money. Use Test-Demo for screens that need realistic numbers |
| 7   | Branch protection on `main` (required checks: CI and Live demo checks)                                                                                                         | Owner              | GitHub → Settings → Branches                                                                                                                                                                           |
| 8   | Optional: repository variable `E2E_BASE_URL` (a deployed site) so the checkout and decline-with-refund tests run                                                               | Owner              | Settings → Secrets and variables → Actions                                                                                                                                                             |
| 9   | Pull request `BoardUpdates` → `main` (opened 2026-11-05 with the description below); review; merge with a merge commit (no force-push, no squash that rewrites pushed history) | Owner              | Items 2–7 can land on `BoardUpdates` while it's open                                                                                                                                                   |
| 10  | Tag `v0.1.0` on `main` and publish the release notes (the `CHANGELOG.md` section)                                                                                              | Owner / maintainer | After the merge; then remove this page and mark the roadmap                                                                                                                                            |

Not blockers (planned after 0.1.0, `roadmap.md`): automatic email (Wave B, first), postpaid dues and invoices, PayPal, approvals engine, board reports and annual chapter reports (E-43), documents, elections, packaging for self-hosting.

## 3. Pull request description (draft)

Title: **OpenCharterApp v0.1.0: the MVP**

```markdown
## What this is

The first release a national with chapters, or a standalone association, can run on: membership
setup and levels, chapters and their boards, joining and renewing online through each org's own
Stripe account, receipts, members across chapters with imports and exports, reports and overview
numbers, and a readable audit log. Version 0.1.0; the full list is in CHANGELOG.md.

## How it was checked

- CI (`ci.yml`): lint, formatting, types, unit and component tests, database rule tests with every
  migration applied in one transaction, Charter's migration conventions, a performance budget at
  5,000, 10,000 and 20,000 members, dependency audit, production build.
- Live demo checks (`live.yml`): the smoke test against the live backend, then 51 end-to-end tests
  in Chrome (sandboxed, other sites blocked), covering the main flows and about 40 steps of the
  user-testing guide.
- Security review: docs/security-review.md (no blocking findings; follow-ups closed).
- A person's pass through docs/user-testing.md: [date, who]

## Before merging

- [x] Every migration applied (up to 0045)
- [ ] Live Stripe test-mode run done (user-testing §10)
- [ ] Privacy policy and terms text replaced (src/content/legal.tsx)
- [ ] LICENSE file added (AGPL-3.0)
- [ ] Receipt wording reviewed, or shipped as a placeholder as the changelog says

## Checklist (docs/instructions.md §8)

- [x] Tests pass locally and in CI (lint, typecheck, unit, integration, e2e)
- [x] New or changed behavior has tests in this PR
- [x] Tenant-isolation tests added or updated for tenant-scoped data
- [x] Root README and supporting docs updated: README, CHANGELOG, roadmap, decisions (D-100..D-209),
      testing, user-testing, demo-data, tables, security-review, plans
- [x] Diagram descriptions updated where diagrams changed (epic.md, tables.md)
- [x] decisions.md / epic.md / risks updated
- [x] Audit events and permission checks included where needed
- [x] No hard-coded org-specific values (terms, ranks, prices, titles)
- [x] Linked epics and decisions: E-01..E-19, E-23 (Phases 0–2), Wave A A1–A8, R1–R7, U1–U7;
      decisions up to D-209

## After merging

Tag `v0.1.0` on main and publish the CHANGELOG section as the release notes.
```
