# Wave A and the MVP release

Status, 2026-11-03: **Sprints 1–3 done** except the owner actions (A1 live Stripe check, R4 CPA review). Sprint 4 ("ready for real use", §8) is built: U1–U7, live (migrations up to 0039 applied). Migrations up to 0039 are applied. Then the release checklist (§6). Builds on `docs/plans/phases-1-3-review.md` (Wave A items A1–A8); decisions D-169..D-176.

## 1. Goal

Release the `BoardUpdates` branch as the **OpenCharterApp MVP (v0.1.0)**: the first version a real national (or a standalone association) can run on, hosted on Supabase.

**The MVP is done when** a national can:

1. set itself up (membership model, levels, fields, board)
2. create chapters and seat their officers
3. sell and renew memberships online through its own Stripe account, with receipts
4. see its members across chapters, reports and an overview
5. let members join, renew, pick their chapter and see what they need to do

And when we can show it's safe:

- every flow above has an end-to-end test
- the security review is done
- the release checklist (§6) is complete

## 2. Scope

**In the MVP:** everything built so far (Phases 1–2 minus E-20 / E-21 PayPal / E-22), plus Wave A (A1–A8) and the release hardening in §5.

**Not in the MVP** (later waves, `phases-1-3-review.md` §3):

- automatic email: Wave B. Invitations stay copy-a-link, and there are no reminders.
- postpaid dues and invoices: E-20, Wave C. So in the home-chapter model, **chapters can't bill local dues in the app yet** (D-166 rule 4 arrives with E-20).
- PayPal, custom domains, approvals, board reports, documents, elections, automation.
- packaging for self-hosting (F-11). The MVP runs on the hosted service; the Docker / hosted-Supabase install (D-160) follows.

## 3. Decisions for the MVP (settled 2026-11-02 as D-169..D-172)

| #   | Question                                                                                                                                                      | Decision (as recommended)                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| M1  | Ship the MVP without automatic email (copy-a-link invitations, no reminders), or pull a minimal B1 (invitations and payment confirmations only) into the MVP? | Ship without; announce email as the first update. It keeps the MVP to about 3 sprints (D-169)                                |
| M2  | Add Playwright as a dev dependency for end-to-end tests (`instructions.md` §10 asks for a decision before adding dependencies)                                | Yes, `@playwright/test`, Chromium only, run in CI on pull requests to `main` (D-170)                                         |
| M3  | Demo organizations and accounts in the MVP database: keep them (clearly badged, for training) or remove them at release (`docs/demo-data.md` cleanup)?        | Keep the demo national for now (it's isolated, never emails, D-148); remove before onboarding a second real national (D-171) |
| M4  | Version and release notes                                                                                                                                     | `0.1.0` in `package.json`, a `CHANGELOG.md`, and a `v0.1.0` tag on `main` (D-172)                                            |

## 4. Wave A items

Sizes: S ≈ 1–2 days, M ≈ 3–5 days, L ≈ 1–2 weeks. Every item follows the commit rules: tests, docs, migration conventions (D-125), audit events, permissions through the policy layer.

### A8 Membership model: national membership with a home chapter: ✅ done in Sprint 1

Built as planned, with two changes: chapter admins see their members through the chapter's own member records (each standing for the national membership) rather than a separate `chapter_affiliates` function, and the model is also chosen when a national is created. Details: D-174, D-176; migration 0030; tests `db/tests/9L_home_chapter.sql`; user steps `user-testing.md` §13b. End-to-end specs for joining with a chapter and changing it are still to add.

### A4 Suggested levels: Copy or Linked: ✅ done in Sprint 2

Built as planned (D-177; migration 0032; `db/tests/9M_levels_standing_pricing.sql`; `e2e/levels.spec.ts`; user steps `user-testing.md` §6). The original plan follows.

- **Migration:** `suggested` on a level; on a chapter's level, `source_tier_id`, `link_mode` and the price rule.
- **RPCs:** `adopt_suggested_level`, `make_level_own`; linked levels update when the national changes or retires its level.
- **UI:**
  - a "Suggest to chapters" switch on the national's levels
  - "Start from a suggested level" on the chapter's levels, with both choices explained side by side
- **Separate-model only:** in the home-chapter model, chapters have no membership levels.
- **Tests:** price rules (same, amount off, percent off, kept within the range, rounding); changes reach linked levels but not copies; retirement; permissions; isolation.

### A5 National standing for chapters: ✅ done in Sprint 2

Built as planned (D-178; migration 0032; user steps `user-testing.md` §8 and §14a).

- In the separate model, a chapter's Members page shows each member's national standing next to the chapter one, through a definer function that returns standing only.
- "Actions needed" reminds a chapter member when the national membership they need is missing or lapsed.

### A6 Pricing step in Membership setup: ✅ done in Sprint 3

Built as planned (D-177; migration 0032; user steps `user-testing.md` §6).

- An optional step: rules per term (same rule builder as the levels page), applied through `apply_setup` as a `pricing_rules` section.
- Tests: setup tests plus a database test that re-applying doesn't duplicate rules.

### A3 Transaction CSV export: ✅ done in Sprint 1

Settings → Payments → "Export payments" (D-173; migration 0029; `db/tests/9K_payments_export.sql`). Emails only for exporters who may see members; the database audits every export.

### A7 Members "everyone" view: ✅ done in Sprint 3

Built as planned (D-179; user steps `user-testing.md` §8).

- A column picker for member fields (saved per viewer in the browser).
- Export across chapters, applying each chapter's directory rule per row (D-139). It resolves each org's rule the way `privacyRulesQuery` does today, so nobody opted out slips through.

### A2 End-to-end tests: ✅ harness done in Sprint 1, specs grow with each item

Playwright in Chromium against the live demo backend (D-170, D-175); `bun run test:e2e`; CI on pull requests to `main`. Covered so far: the menu by role and "View as member", members across chapters, the board's contact-email choice, Settings → Setup, the join page's required questions, and joining with the test gateway (against a deployed site). Added since: the lifecycle spec (a throwaway national with the home-chapter model, the chapter wizard, picking and changing chapter), the payments export, suggested levels, and accessibility for each role. Still to add: renewal, Membership and Board setup applied, appointing an officer. See `docs/testing.md`.

### A1 Live Stripe test-mode check (S, owner action: needs the owner's Stripe test account)

- On a non-demo test org: connect a test key and webhook, then join, return, refund, and decline with refund. Covered by `user-testing.md` §10.
- If a Stripe test key can be stored as a CI secret, add a smoke step for it.

## 5. Release hardening (in parallel, mostly Sprint 3)

| #     | Item                                                                                                                                                                                                                                                                                           | Size         |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| R1 ✅ | Security review before the first production release (`risks-and-open-questions.md` §4): tenant isolation (RLS on every table, definer functions' permission checks), credential storage (`private` schema, sealed secrets), return links (D-158), exports and audit. Record findings and fixes | M            |
| R2 ✅ | Accessibility pass to WCAG 2.1 AA (Q-16): keyboard paths through join, checkout, setup, Members, Board; labels; contrast in both themes                                                                                                                                                        | S–M          |
| R3 ✅ | `instructions.md` §9 gaps: add the pre-commit hook (lint-staged: lint, format, related tests) and a lightweight docs check in CI, or mark them as planned in the doc                                                                                                                           | S            |
| R4    | Receipt wording: CPA review (R-07). If it isn't done by release, ship with the current placeholder wording and say so in the release notes                                                                                                                                                     | — (external) |
| R5 ✅ | Release docs: README (what the MVP does, how to run it), `CHANGELOG.md`, `docs/user-testing.md` pass, hand-off for any pending migrations                                                                                                                                                      | S            |
| R6 ✅ | Performance check with a large roster (5,000 members across 20 chapters): Members "everyone" view, overview, reports, exports                                                                                                                                                                  | S            |
| R7 ✅ | Error monitoring: confirm server errors are logged, and that failed payments / webhooks are visible to admins                                                                                                                                                                                  | S            |

**Outcome:** recorded in `docs/security-review.md` (R1, R2, R3, R6, R7) and decisions D-180..D-183. R4 is an owner action; if it isn't done, 0.1.0 ships with the placeholder wording, as `CHANGELOG.md` says.

## 6. Release checklist

Current status and owners: [`release-v0.1.0.md`](release-v0.1.0.md). As of 2026-11-03: 1 ✅ (CI and the live demo checks green); 2 waits for `0040` to be applied; 3, 4 (owner sign-off), 7, 8 and 9 are for the owner; 5 and 6 ✅.

1. All Wave A items merged on `BoardUpdates`; CI green (lint, format, types, unit, database rules, migration conventions, build, end-to-end).
2. Every pending migration is applied; `bun run test:smoke` passes against the live backend.
3. Full pass of `docs/user-testing.md` as National, Chapter and Member, on desktop and phone width.
4. Security review (R1) signed off by the owner (`docs/security-review.md`); accessibility: automated checks pass, manual checks in `user-testing.md` §16 done.
5. Decisions M1–M4 recorded in `decisions.md` (done: D-169..D-172).
6. ✅ `package.json` version `0.1.0`, `CHANGELOG.md`, README "Where it stands" updated.
7. Add the AGPL-3.0 `LICENSE` file (R-24) and `"license": "AGPL-3.0-only"` in `package.json` (maintainer: GitHub's "Add file → Create new file → LICENSE → Choose a license template" gives the official text).
8. Pull request `BoardUpdates` → `main` with the checklist from `instructions.md` §8; reviewed and merged (no force-push).
9. Tag `v0.1.0` and publish release notes, listing what's not in the MVP (§2).

## 7. Sequence (about 3 sprints of 2 weeks)

| Sprint | Work                                                                                                           |
| ------ | -------------------------------------------------------------------------------------------------------------- |
| 1 ✅   | A2 end-to-end harness and first flows; A8 in full, including choosing the model when a national is created; A3 |
| 2 ✅   | A4; A5; end-to-end tests for them                                                                              |
| 3 ✅   | A6; A7; R1–R3, R5–R7 (A1 and R4 are owner actions)                                                             |
| 4 ✅   | Ready for real use (§8): U1–U7 (D-189..D-195); then the release checklist and v0.1.0                           |

**Risks to the plan:**

- **End-to-end tests run against the live demo backend** (like `bun run test:smoke`): a feature whose migration isn't applied yet can only be tested end to end after it is applied.
- **R1 may turn up fixes:** keep Sprint 3 light for that.

## 8. Release-readiness review (2026-11-03)

**Outcome:** all seven built in Sprint 4 (D-189..D-195, migration 0037). U5's pages carry placeholder text for the owner to replace.

A check of Phases 0–2 against one question: could a real association start using 0.1.0 tomorrow? The Phase 1 and 2 exit criteria are met (Phase 1's "sell through Stripe" still needs the live test-mode run, A1). The gaps below are things a real admin or member would hit in the first week. They are proposed as **Sprint 4, "ready for real use"**, before the release checklist (§6).

### What a real association would hit

| #   | Gap                                                                                                         | Why it matters                                                                                                                    | Proposal                                                                                                                                                                                                                                                                        | Size      |
| --- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| U1  | **No member import.** Members are added one at a time ("Add member", then "Record membership")              | A national moving from a spreadsheet has hundreds or thousands of members with paid-through dates; typing them in isn't realistic | Settings → Members import: upload a CSV, map columns (name, email, level, term, joined, paid through, member fields, chapter), preview with row errors, then apply in one transaction through a definer function; audited; re-running matches by email, so it doesn't duplicate | M         |
| U2  | **Records can't be taken off the roster.** There's no delete (by design) and no "remove"                    | Duplicates, typos and people who left stay listed forever and count in reports                                                    | "Remove from roster": the record is marked as left (history, payments and receipts kept), seats end, roles from seats go; audited; can be restored                                                                                                                              | S         |
| U3  | **The audit log isn't readable.** It shows time, action and table only                                      | Admins can't tell who changed what (the data is already stored)                                                                   | The readable log proposed on 2026-11-02: who, what, previous → current, grouped per save                                                                                                                                                                                        | M         |
| U4  | **No account page.** A signed-in person can't change their name, email or password (only "forgot password") | People change emails; admins will get these requests by hand                                                                      | Account page: name, email (with confirmation), password, and the organizations you belong to                                                                                                                                                                                    | S         |
| U5  | **No privacy policy or terms links.** Join pages collect personal details and payments                      | Stripe and members expect them; legally needed before real data                                                                   | Settings → General: privacy policy and terms URLs per organization (inherited from the national), linked on join pages and in the footer; the owner supplies the text                                                                                                           | S + owner |
| U6  | **The join link is hard to find.** It's only on Settings → Payments                                         | Sharing the join page is the first thing a new org does                                                                           | A "Share your join page" card on the admin Overview (copy link), shown once payments are connected                                                                                                                                                                              | S         |
| U7  | **`has_permission` / `is_org_member` callable without signing in** (security review F1)                     | Low risk, but cheap to close before real data                                                                                     | Revoke from anonymous callers, with a database test                                                                                                                                                                                                                             | S         |

### Accepted for 0.1.0 (known limits, in `CHANGELOG.md`)

- **No automatic email** (D-169). Invitations are copied links; there are no renewal reminders. Workaround: Members → "Expiring within 30 days", then export and email from your own mail. Email is the first update (Wave B).
- **No postpaid dues or invoices** (E-20, Wave C), no PayPal (E-21), no per-org web addresses or custom domains (E-07, E-22).
- **Demo organizations stay** until a second real national joins (D-171).
- **Coverage gate** (E-01) waits for a dependency decision.

### Owner and maintainer actions (unchanged)

A1 live Stripe test-mode run · R4 CPA look at receipt wording · the AGPL-3.0 `LICENSE` file (R-24) · the privacy policy and terms text (`src/content/legal.tsx`) · 0036 and 0037 applied · the release checklist (§6).
