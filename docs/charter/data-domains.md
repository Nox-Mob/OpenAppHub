# Data Domains (input to database design)

## In short

This is a list of the kinds of things OpenCharterApp needed to store, like people, memberships, chapters and payments, grouped by area. It was written **before** the database was designed, to plan it.

- It's **not** the real list of tables. For that, see [`tables.md`](tables.md).
- Every table that belongs to one organization has an `org_id`, so database rules can keep organizations apart.
- It's kept because it explains _why_ the data is shaped the way it is.

An inventory of what we will need to store, grouped by domain. This is **not a schema**: for the tables actually in use and how they connect, see [`tables.md`](tables.md). It lists the main entities, key relationships, and the design questions to settle before writing tables. Domains are ordered roughly by the order we will design them.

Conventions to assume at schema time: every tenant-owned table carries `org_id`; timestamps and soft-delete or status columns where history matters; audit events for meaningful changes; IDs are opaque (UUID or similar).

## 1. Platform and organizations (first pass)

| Entity                                   | Notes                                                                                                                                                                                                                                                          |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Platform settings                        | Installer-level config, hosting mode (self-host or hosted)                                                                                                                                                                                                     |
| Organization                             | Type (standalone, national, region, chapter), parent, slug, status, branding, timezone                                                                                                                                                                         |
| Organization hierarchy path              | Closure table or path column for "this org and descendants"                                                                                                                                                                                                    |
| Tax profile                              | Legal name, EIN, tax status, address, per org                                                                                                                                                                                                                  |
| Branding asset                           | Org, kind (logo light, logo dark, icon, email header), storage key, variants, status. Resolution falls back chapter → region → national → platform. Override allowed mode set by national                                                                      |
| Organization settings                    | Key/value or typed settings with inherit / override / locked mode                                                                                                                                                                                              |
| Chapter attribute definitions and values | Defined by national or region, values per chapter (e.g., charter date). Stored in `attribute_definitions` with `applies_to = 'chapter'` and `attribute_values` keyed by the chapter's org id (D-120). A `locked` field is set only by the defining org (D-121) |
| Domain                                   | Hostname, org, kind (subdomain or custom), verification status, TLS status                                                                                                                                                                                     |

## 2. Identity, roles, access (first pass)

| Entity                 | Notes                                                                                                                                                                 |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Person                 | A human, global to the install. Holds only the login identity (email, credentials). Decided, see D-036                                                                |
| Org membership profile | (person, org) record holding that org's profile fields, preferences, consents, and attribute values. **Nothing here is shared across orgs** (D-037)                   |
| Account / credential   | Login identity, sessions, verification                                                                                                                                |
| Invitation             | To an org, optionally to a role or seat, with expiry                                                                                                                  |
| Role                   | Bundle of permissions, platform-defined or org-defined. Org roles apply to descendants, are retired (`active`) not deleted, and keys are unique per hierarchy (D-119) |
| Permission             | Capability identifier                                                                                                                                                 |
| Role assignment        | (person, role, org node, source) where source is manual or generated by a board seat                                                                                  |
| Audit event            | Actor, org, action, target, before/after, request metadata                                                                                                            |
| Signed action token    | Purpose, bound person and target, expiry, used-at                                                                                                                     |

## 3. Custom attributes (first pass, shared by many domains)

| Entity               | Notes                                                                                                                                                                          |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Attribute definition | Owner org, applies-to entity type (member, chapter, ...), key, label, data type, options, ordering (for ranked lists), required, visibility, edit permission, inheritance mode |
| Attribute option     | Value list entries with order and active flag                                                                                                                                  |
| Attribute value      | Entity reference plus typed value. Optional effective dating and history                                                                                                       |

**Storage question:** typed value columns, JSONB per entity with a definitions table, or EAV. Needs to support filtering, sorting, exports, and rule evaluation efficiently.

## 4. Membership and dues (first pass)

| Entity                       | Notes                                                                                                                                                                                                                                                                                                                                                          |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Membership program / tier    | Owned by an org (national or chapter), name, status, tax treatment, billing timing (prepaid or postpaid), approval required. _Built (E-11):_ `membership_tiers` (key, name, description, tax_treatment, active). Billing timing comes with E-20 and approval stays an org setting (D-124). Sub-orgs may only create levels when their parent allows it (D-123) |
| Term option                  | Per tier: label, duration (or lifetime), price. Fully org-defined. _Built (E-11):_ `tier_terms` (length_count + length_unit day/month/year, or both null for lifetime; price_minor; currency), D-122                                                                                                                                                           |
| Pricing rule                 | _Built (E-19):_ `pricing_rules` per term: conditions on member fields (jsonb), a price or a percentage off, order, active (D-147)                                                                                                                                                                                                                              |
| Membership                   | (person, org, tier, term, status, start, paid-through, source). _Built (E-13a):_ `memberships`, one current row per member profile and org: tier, term, status (pending / active / cancelled / declined), joined_on, paid_through, lifetime (D-131)                                                                                                            |
| Membership event history     | Joined, renewed, lapsed, upgraded, cancelled. _Built:_ append-only `membership_events` (joined / renewed / approved / declined / cancelled) with the period covered and the payment                                                                                                                                                                            |
| Chapter affiliation          | _Built (0030, D-166, D-174):_ `memberships.home_org_id` (the national membership's chapter), `org_member_profiles.home_of` / `left_at` (the chapter's record standing for it), append-only `affiliation_history`; setting `membership.model` chosen once by the national                                                                                       |
| Level link                   | _Built (A4, D-177, migration 0032):_ `membership_tiers.suggested` on the national's level; on a chapter's level `source_tier_id`, `link_mode` (copy / linked), `price_rule` (same / minus_amount / minus_percent) and `price_value`; `tier_terms.source_term_id`                                                                                               |
| Standing                     | Derived state (good standing, grace, lapsed, delinquent). Possibly materialized for query speed. _Built:_ derived on read from paid_through and the grace period (`membership_standing`, `src/modules/membership/standing.ts`), not stored (D-111)                                                                                                             |
| Directory listing            | _Built (E-14):_ `org_member_profiles.directory_listed` (null = the org default), read through `member_directory` (D-139)                                                                                                                                                                                                                                       |
| Member record                | _Built (E-13a):_ `org_member_profiles` may have no login (`user_id` null, source admin / import) for historical members; an invitation claims it (D-116, D-134)                                                                                                                                                                                                |
| Invoice / balance (postpaid) | Amount, due date, status, line items                                                                                                                                                                                                                                                                                                                           |
| Dues policy                  | Per org: grace days, delinquency rules, national control mode for chapter dues (none / optional range / required)                                                                                                                                                                                                                                              |

## 5. Payments and receipts (first pass, can overlap with Membership)

| Entity                | Notes                                                                                                                                                                                                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Gateway connection    | Org, gateway type (Stripe or PayPal), credentials or connected account reference (encrypted), status                                                                                                                                                                                                                                                   |
| Payment / transaction | Receiving org, gateway, gateway reference, payer (person or other), gross, fees, national fee, status, item references. _Built (E-13a):_ `payments` (org, membership, member, payer, purpose join / renew, amount_minor, currency, status, gateway manual / stripe / test, method, received_on, note). Fees and the national fee come with E-12 / E-21 |
| Payment line item     | What was paid for (membership, donation, ticket, award option, add-on), tax treatment, fair-market value                                                                                                                                                                                                                                               |
| Refund                | Linked to payment                                                                                                                                                                                                                                                                                                                                      |
| National fee rule     | Percentage or fixed, applicable item types                                                                                                                                                                                                                                                                                                             |
| Receipt               | Org, payment or manual source, number, template version, rendered content, status (issued, voided, superseded). _Built (E-15):_ `receipts` (number per org and year, frozen snapshot, status, supersedes_id, void reason) and `receipt_counters` (D-140)                                                                                               |
| Receipt template      | Org-owned, inherits from national, versioned. _For now (E-15):_ fixed layout with placeholder tax wording per tax treatment plus the org's `receipts.footer`; templates come with E-36                                                                                                                                                                 |
| Cart / order          | Groups line items. Separate payments per receiving entity                                                                                                                                                                                                                                                                                              |

**Design point:** the **payer** and the **beneficiary** are different concepts (a chapter may pay for a member's award).

## 6. Governance (second pass)

| Entity              | Notes                                                                                                                                                                                                                                                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Board seat template | Defined by national: canonical role, default title, required, count, term length, linked permission set. _Built (E-17):_ `seat_templates` (org, key, title, required, seat_count, suggested term, role_id, scope self / chapters / self_and_chapters, retire not delete, D-141, D-151) |
| Board seat          | Instance in an org, optional custom display title, status (filled, vacant). _Built (E-17):_ derived by `org_board`; custom titles in `seat_title_overrides`                                                                                                                            |
| Seat contact        | _Built (0026):_ `seat_contacts`, a role email per org and seat; none = the officer's own email is shown (D-156)                                                                                                                                                                        |
| Seat term rule      | _Built (E-17):_ `seat_terms`, each org's own term per seat with effective date and by-law reference, append-only (D-142)                                                                                                                                                               |
| Appointment         | (person, seat, start, end, how: appointed, elected). _Built (E-17):_ `appointments` (seat number, starts_on, planned_end, ended_on, reason, the role assignment it created); elections come with E-27                                                                                  |
| Vacancy tracking    | Derived or recorded vacancy start for alerting                                                                                                                                                                                                                                         |
| Report type         | Defined by national, schedule, form                                                                                                                                                                                                                                                    |
| Board report        | Chapter submission, status (draft, submitted, acknowledged, changes requested), due date                                                                                                                                                                                               |
| Oversight view data | Likely derived views over seats, reports, documents. _Built (E-23):_ `org_rollup_members`, `org_rollup_revenue`, `org_rollup_governance` (aggregates over the org's subtree, D-145); `org_overview_stats` for the Overview page (distinct people across the subtree, D-152)            |

## 7. Approval workflow (second pass, shared)

| Entity              | Notes                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Workflow definition | Ordered steps with approver rules, escalation timing, outcome and appeal settings                                           |
| Workflow instance   | Subject (award submission, document, ...), current step, status                                                             |
| Step instance       | Resolved approver(s), status, decision, comment, decided-at, channel (email link or portal), rank-verified flag and by whom |
| Escalation record   | Reason (no eligible approver, no response, manual), target (national)                                                       |
| Batch approval      | Meeting date, approver, set of instances                                                                                    |

## 8. Documents (second pass)

| Entity                      | Notes                                                                        |
| --------------------------- | ---------------------------------------------------------------------------- |
| Document category           | Defined by national, required flag, alert-on-change flag, default visibility |
| Document                    | Org, category, title, tags, current version pointer                          |
| Document version            | Storage key, uploader, effective date, notes                                 |
| Document share / visibility | Admins only, shared with national, members, public                           |
| Document review             | Optional approval status via workflow engine                                 |

## 9. Elections (second pass)

| Entity                   | Notes                                                                                      |
| ------------------------ | ------------------------------------------------------------------------------------------ |
| Election                 | Org, status/lifecycle, voting method (single or ranked), window, quorum, eligibility rules |
| Election position        | Linked to a board seat                                                                     |
| Nomination / candidate   | Nominee, nominator, acceptance, statement                                                  |
| Ballot / vote            | Admin-visible. Voter participation recorded separately where practical                     |
| Result and certification | Immutable once certified, with correction process                                          |

## 10. Awards (third pass)

| Entity                         | Notes                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Award                          | Owner org, name, family and tier order, criteria text, active, payer settings, outcome/appeal settings            |
| Award prerequisite             | Award requires another award                                                                                      |
| Award form                     | Linked form definition                                                                                            |
| Award approval policy          | Link to workflow definition with tier-specific approver rules                                                     |
| Award purchase option / add-on | Name, price, lead time, tax treatment, available-with rules (modeled as products)                                 |
| Award submission               | Award, nominee, nominator, form answers, chapter, status                                                          |
| Award grant                    | Approved award, date, approvals trail reference                                                                   |
| Award order                    | Purchase, payer, options, payment, fulfillment status                                                             |
| Fulfillment record             | Status, production and shipping details, tracking, presentation date. Vendor and inventory references added later |

## 11. Forms (third pass)

| Entity          | Notes                                           |
| --------------- | ----------------------------------------------- |
| Form definition | Owner org, fields, conditional logic, version   |
| Form field      | Type, validation, optional link to an attribute |
| Form submission | Answers (structured), files, submitter, status  |

## 12. Later domains (outline only)

- **Donations and fundraising:** campaigns, designations, recurring gifts, peer-to-peer pages, sponsorships.
- **Events:** event, ticket types, registrations, attendees, check-in, waitlist, capacity, fair-market-value.
- **Corporate:** company account, seats, company admin, corporate tiers.
- **Communications:** templates, segments, sends, delivery events, preferences and consents.
- **Public sites:** pages, navigation, widgets.
- **Accounting export:** chart of accounts, mappings per org.
- **Hosting billing:** plans, usage snapshots, invoices, tenant status.
- **Store (future):** products, variants, inventory, vendors, orders (awards purchase options align to this).

## 13. Design questions to settle before writing schemas

| #   | Question                                                                                                                                                                                              | Leaning                                                                                     |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| A   | **Person identity.** _Resolved:_ person is global to the install and holds only the login identity. Everything else is keyed by (person, org). No cross-org visibility or pre-fill                    | Decided (D-036, D-037)                                                                      |
| B   | **Hierarchy storage.** Closure table, materialized path (ltree), or recursive queries. The region tier is in the model from day one (D-035), so depth is at least platform, national, region, chapter | ltree or closure table, decide against RLS needs                                            |
| C   | **Attribute storage.** _Resolved:_ JSONB validated against definitions. Still prototype indexing, sorting, and export performance                                                                     | Decided (D-065)                                                                             |
| D   | **Settings with inherit/override/locked.** One generic settings table vs typed tables per module                                                                                                      | Generic settings table with typed resolution layer, typed tables for heavy domains          |
| E   | **Standing.** Compute on read or materialize                                                                                                                                                          | Materialize with event-driven refresh, since lists and eligibility checks use it constantly |
| F   | **RLS design.** Policy shape for "my org and its descendants" and for "shared up to national"                                                                                                         | Session variable for current org and access scope, policies use path tests                  |
| G   | **Money.** Integer minor units, currency per payment                                                                                                                                                  | Integer minor units, currency code per row                                                  |
| H   | **Rules storage.** JSON AST validated by Zod, with an evaluator in code                                                                                                                               | JSON AST                                                                                    |
| I   | **Receipt numbering.** Sequence per issuing org and per year                                                                                                                                          | Per org sequence, gap-free where legally relevant                                           |
| J   | **Audit log partitioning.** High volume, append-only                                                                                                                                                  | Time-partitioned table                                                                      |
| K   | **Award options as products** from day one so the future store is an extension                                                                                                                        | Yes, shared product table                                                                   |
