# Instructions for Contributors

**Read this first if you are joining the codebase.** This file turns the planning docs into working rules. It applies to everyone who commits, human or AI assistant. If a rule here conflicts with another doc, raise it and fix the docs, do not quietly work around it.

> **Placement:** these docs live in `/docs` (or `/plan`) in the repo. Keep this file linked from the root `README.md`. If you use an AI coding assistant, point its instruction file (for example `CLAUDE.md` or `AGENTS.md`) at this file.

---

## 1. What we are building

An open-source (AGPL), multi-tenant membership platform for non-profits with national organizations and local chapters. Each org collects its own money, issues its own receipts, and runs its own board, elections, documents, and awards. National sets guardrails and sees across its chapters.

Full detail: [`README.md`](README.md).

## 2. Read order for new contributors

1. [`README.md`](README.md): vision, scope, principles
2. [`glossary.md`](glossary.md): shared vocabulary (use these words in code and tickets)
3. [`decisions.md`](decisions.md): what is already decided (cite IDs like `D-036`)
4. [`architecture.md`](architecture.md): structure, tenancy, engines, modules
5. [`epic.md`](epic.md): roadmap and what we are working on now
6. [`setup-engine.md`](setup-engine.md): how configuration is created
7. [`data-domains.md`](data-domains.md): entity inventory for database work
8. [`risks-and-open-questions.md`](risks-and-open-questions.md): what is unresolved

## 3. The commit rules (non-negotiable)

**Every commit must satisfy all four of these before it is pushed:**

1. **Tests pass.** The full relevant test suite passes locally and in CI. Do not commit with failing, skipped, or disabled tests to get green.
2. **New code has tests.** Any new or changed behavior ships with tests in the same commit (see section 5 for what kind). "I'll add tests later" is not accepted.
3. **Documentation is updated.** The root `README.md` and any supporting documentation affected by the change are updated in the same commit (see the table in section 6).
4. **Diagrams and their descriptions stay in sync.** If you touch a diagram, update its "Diagram description" block in the same commit.

A commit that does not meet all four is not ready. Reviewers should reject it, and CI should block it where it can (section 9).

### Before you commit, run

```bash
bun run lint
bun run format:check
bun run typecheck
bun run test              # unit and component tests
bun run check:migrations  # Charter's migration rules (D-125)
bun run test:db           # database rules (needs TEST_DATABASE_URL, see testing.md)
bun run build
bun run test:e2e          # end-to-end in Chromium (needs network; see testing.md)
```

_(Script names are the standard set established in E-01. If a script is missing, adding it is part of E-01, not a reason to skip the check.)_

## 4. Project rules

### Tooling

- **Bun only** (D-104, which supersedes the original npm-only rule). No npm, Yarn, or pnpm. Commit `bun.lock`. CI uses `bun install --frozen-lockfile`.
- TypeScript in strict mode. No `any` without a comment explaining why.
- Validation with **Zod** at every boundary (forms, server actions, route handlers, webhooks, rule and setup definitions).
- Configuration through **environment variables**, documented in `.env.example`. No host-specific features, so packaging can come later (D-011, D-012).
- Docker and Compose packaging is **not** part of early work (F-11). Do not add it unless the epic is pulled in.

### Tenancy and security (the highest-risk area)

- **Every tenant-owned table has `org_id`** and a row-level security policy (D-031, D-003). No exceptions without a recorded decision.
- Application code still checks access. RLS is the safety net, not the only gate.
- **Migration conventions (D-125).** Every new tenant table has `org_id uuid not null references public.organizations(id)`, `grant select, insert, update, delete on public.<table> to authenticated`, `enable row level security`, and policies using `public.has_permission` or `public.is_org_member`. Never `DROP TABLE` or `DROP COLUMN`: add columns and leave deprecation comments. Use `alter policy` and `create or replace trigger` instead of dropping and recreating. "Retire, never delete" means having no DELETE policy, and columns that must not change are guarded by a trigger. `bun run check:migrations` enforces this from migration 0004 on.
- **Migrations not yet applied (D-135).** The owner applies migrations to the live database (`migrate.yml`), sometimes later than they're merged. Put types for unapplied tables and functions in `src/lib/db/pending-schema.ts` (never hand-edit the generated `src/integrations/supabase/types.ts`). Put screens that need them behind the readiness guard (`<RequiresDatabase>`), and list the migration under "Pending migrations" in `/roadmap.md`. Once a migration is applied, never edit it again.
- **All authorization goes through the policy layer.** Never write ad hoc permission checks in components or routes.
- Permissions inherit **downward only** (D-032).
- **Nothing crosses orgs.** A person is global (login identity only). Profile data, attributes, preferences, and settings belong to the person's membership in a specific org and are never copied, pre-filled, or revealed to another org (D-036, D-037).
- Sign-up and sign-in responses must not reveal whether an account exists (risk R-15).
- Gateway credentials are stored encrypted. Card data never touches our servers.
- Signed links (one-click approvals) are single-use, expiring, and bound to a person and a request. **A link must never change state on GET.** It opens a confirmation page and the change happens on submit.

### Configuration, not hard-coding

- Term lengths, tier names, titles, ranks, approval chains, and prices are **org-defined**. Never bake examples like "1, 3, lifetime" or "E1 to E6" into logic (D-051, D-052).
- Use the shared engines (attributes, rules, setup, approvals, forms, automation) instead of building one-off versions inside a module. See `architecture.md` section 6.
- Attribute values are JSONB validated against definitions (D-065).
- Rules are declarative data, not custom code (D-064).
- Every module that is configurable ships its **setup-engine flow** as part of its epic.

### Data and money

- Money is stored in **integer minor units** with a currency code. Never floats.
- Receipts are **immutable** once issued. Corrections create a new version (D-044).
- The payer and the beneficiary are separate concepts (a chapter may pay for a member's award).
- A member owing national and chapter dues pays **twice**, once per tax entity (D-042).
- Each payment records the receiving org, gateway, and any national fee.

### Auditability

- Meaningful actions emit **audit events**: admin actions, financial changes, governance changes, document changes, awards and approvals, exports, and elections.
- Certified election results and issued receipts are never edited in place.

### Language and naming

- Use the terms in [`glossary.md`](glossary.md). If you need a new term, add it there.
- Inheritance language is **inherit / override allowed / locked**.

## 5. Testing requirements

New code is not done until it is tested. Choose the kinds that match the change:

| Change                                                                   | Required tests                                                                                                                               |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Pure logic (pricing, rules evaluation, standing, eligibility, date math) | Unit tests, including edge cases and boundaries                                                                                              |
| Database access, server actions, route handlers, engines                 | Integration tests against a real Postgres (not mocks of the database)                                                                        |
| Anything touching tenant-scoped data                                     | **Tenant-isolation test**: prove org A cannot read or write org B's data, and that descendants and ancestors behave per the permission model |
| Permissions and approvals                                                | Tests for allowed and denied cases, inheritance, and escalation paths                                                                        |
| Payments and webhooks                                                    | Tests using gateway test mode or recorded fixtures, covering idempotency and failure paths                                                   |
| User-facing flows (sign-up, checkout, approvals, setup flows, elections) | Playwright end-to-end test of the main path                                                                                                  |
| Bug fixes                                                                | A regression test that fails before the fix and passes after                                                                                 |
| Receipts, standing, elections, awards routing                            | Test the rules matrix, not just the happy path                                                                                               |

Guidelines:

- Tests live next to the code they cover or in a mirrored `tests` structure, consistent across modules.
- Tests must be deterministic. Control time, randomness, and external calls.
- Do not weaken or delete a test to make a change pass. If a test is wrong, fix it and explain why in the commit.
- Aim to cover behavior and decisions, not just lines. A coverage number is a floor, not the goal.

## 6. Documentation requirements

The root `README.md` and supporting docs are part of the change. Update what the change affects:

| If you change...                                    | Update...                                                       |
| --------------------------------------------------- | --------------------------------------------------------------- |
| How to install, run, configure, or test the project | Root `README.md`, `.env.example`                                |
| A decision or add a new one                         | `decisions.md` (add an ID, mark superseded ones, do not delete) |
| Structure, tenancy, engines, modules, payments flow | `architecture.md` and its diagram descriptions                  |
| Epic scope, ordering, or dependencies               | `epic.md`                                                       |
| Setup flows or questions                            | `setup-engine.md`                                               |
| Tables, entities, or relationships                  | `data-domains.md`, plus migration notes                         |
| Vocabulary                                          | `glossary.md`                                                   |
| A new risk or a resolved open question              | `risks-and-open-questions.md`                                   |
| A user-facing or admin-facing feature               | User or admin documentation for that feature                    |
| Any diagram                                         | Its **Diagram description** block (see below)                   |

### Diagram convention

Every diagram is followed by a "Diagram description" block explaining in plain prose what it shows: groupings, what sits above, below, or inside what, and what each arrow means. Update it in the same commit as the diagram.

### Decision IDs and traceability

- Cite decision IDs (`D-xxx`) and epic IDs (`E-xx`) in commit messages, PR descriptions, and code comments where a rule comes from a decision.
- Retired IDs are not reused (for example, E-02 moved to F-11).

## 7. Working with epics and sprints

- Work is organized by the epics in [`epic.md`](epic.md). Stories are written when an epic is pulled into planning.
- Prefer **vertical slices** over layer-by-layer work.
- Engines ship with their first real consumer.
- Every module epic includes its setup flow, audit events, permissions, and automations. These are not "later" tickets.

**Definition of Ready (story):** linked to an epic and decision IDs, acceptance criteria written (including permission and tenancy behavior), UI notes if user-facing.

**Definition of Done (story):**

- Code reviewed and tests passing (unit, integration, and e2e where user-facing).
- Tenant-isolation test added or updated for any new tenant-scoped data.
- Permissions enforced through the policy layer.
- Audit events emitted for meaningful actions.
- Migrations reversible or safely forward-only, and seed data updated.
- Docs updated: root `README.md`, these planning docs, and user or admin docs.
- Diagram descriptions updated for any touched diagram.
- Configuration is environment-driven with no host-specific dependency.

## 8. Commits and pull requests

_(Defaults. Adjust in `decisions.md` if the team chooses differently.)_

- Small, focused commits and pull requests. One logical change each.
- Commit message format: `type(scope): summary` (for example `feat(awards): route approvals to national when no eligible approver`). Types: `feat`, `fix`, `test`, `docs`, `refactor`, `chore`, `perf`.
- Reference epic and decision IDs in the body (`E-31`, `D-083`).
- Never commit secrets, `.env` files, real member data, or real gateway keys.
- Database changes go through **migrations**. Never edit an applied migration.
- Pull requests must include the checklist below.

### Pull request checklist

```markdown
- [ ] Tests pass locally and in CI (lint, typecheck, unit, integration, e2e if applicable)
- [ ] New or changed behavior has tests in this PR
- [ ] Tenant-isolation test added or updated for tenant-scoped data
- [ ] Root README and supporting docs updated (list which): ...
- [ ] Diagram descriptions updated if any diagram changed
- [ ] decisions.md / epic.md / risks updated if scope or decisions changed
- [ ] Audit events and permission checks included where needed
- [ ] No hard-coded org-specific values (terms, ranks, prices, titles)
- [ ] Linked epic and decision IDs: ...
```

## 9. Enforcing the rules

Rules that depend on memory will be forgotten, so automate them where possible. This is part of E-01.

**Status (2026-11-04):** `ci.yml` runs install, migration rules, lint, formatting, types, unit tests, the database rule tests (including tenant isolation, each migration in one transaction), the performance check, a dependency audit, the build, and the docs check on pull requests; `live.yml` runs the smoke test and the end-to-end tests against the live demo on pushes to `main` and `BoardUpdates`, pull requests to `main`, daily and on demand (D-175, D-197). The pre-commit hook is in `.githooks/pre-commit` (install with `bun run hooks:install`; D-182). **Not yet in place:** the coverage gate (it needs a coverage dependency, so a decision first) and branch protection, which the repository owner sets on GitHub.

- **Pre-commit hook** (`.githooks/pre-commit`, a plain script rather than Husky and lint-staged, so no dependency): runs lint, formatting, typecheck, migration rules and the tests related to staged files. Blocks the commit on failure.
- **CI pipeline** on every push to any branch and on pull requests: install with `bun install --frozen-lockfile`, migration-rule check, lint, typecheck, full unit and integration tests, tenant-isolation suite, and e2e on the main branch or before merge.
- **Coverage gate:** fail CI if coverage on changed code drops below the threshold set in E-01.
- **Docs check in CI** (lightweight, `scripts/docs-check.sh`): fail the build if source under `src/` (or migrations, smoke tests, scripts) changed but no documentation or test file changed in the same pull request, with an explicit override label for genuine exceptions such as pure refactors. This is a prompt for reviewers, not a substitute for them.
- **Branch protection:** no direct pushes to the main branch, required passing checks, at least one review.
- **Never bypass hooks** (`--no-verify`) to get a commit through. If a hook is wrong, fix the hook.

## 10. If you are an AI coding assistant

Follow everything above, plus:

- Read this file and the docs in the read order before making changes.
- Run the test commands yourself and report real results. Do not claim tests pass without running them.
- Write the tests with the code, and update the README and supporting docs in the same change.
- Do not invent decisions. If something is undecided, check `decisions.md` and `risks-and-open-questions.md`, then ask.
- Do not add dependencies, change the stack, or introduce Docker packaging without an explicit decision.
- Keep changes small and scoped to the epic you were asked to work on.
- Summarize what changed, what was tested, and which docs were updated at the end of each task.

## 11. When something does not fit

- If a rule here blocks sensible work, propose a change by opening a discussion and updating this file and `decisions.md`. Do not ignore the rule silently.
- If you find a gap or contradiction in the docs, fix it or raise it in the same change. The docs are only useful if they stay true.
