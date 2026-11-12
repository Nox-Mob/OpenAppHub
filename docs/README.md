# OpenAppHub suite documentation

Every internal document for the suite lives here: the hub, OpenCharterApp, OpenBoardApp and OpenLedgerApp. The apps' repositories keep only their code, a README, `AGENTS.md`, and a pointer back here (plus the vendored `SHARED-SPEC.md`).

**User guides** (for the people who use the apps) are a separate site: [docs.openapphub.org](https://docs.openapphub.org), from `Nox-Mob/OpenAppHub-docs`.

## Start here

| If you want to…                              | Read                                                                                                                                              |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Understand how the whole suite fits together | [`architecture.md`](architecture.md): hosting, modes, sign-in, the database, data between apps, billing, email, chapters, deploys (with diagrams) |
| See every table and how they connect         | [`database-map.md`](database-map.md): one diagram per domain (billing, email, members, meetings, books…), every column, and "follow a question"   |
| Understand the automation engine             | [`automation-engine.md`](automation-engine.md): kinds, each organization's choices, the panel, Board's reminders, and the later parts             |
| Know what's done and what's next             | [`ROADMAP.md`](ROADMAP.md): every epic for every app (S suite, H hub, C Charter, B Board, L Ledger) with what each needs first                    |
| Follow the rules every repo shares           | [`SHARED-SPEC.md`](SHARED-SPEC.md): the suite contract (schemas, modes, auth, billing, secrets, shared code, deploys, demo, definition of done)   |
| Set up or check secrets                      | [`SECRETS.md`](SECRETS.md): every Worker and GitHub secret and where it stands                                                                    |
| Run migrations or see the migration history  | [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md): the hub's notes and the order on a fresh database                                                     |
| Start as the owner                           | [`START-HERE.md`](START-HERE.md): the original setup pack (what only the owner can do)                                                            |
| Work on the design system                    | [`design/README.md`](design/README.md), `shared/design/DESIGN.md` in the hub repo, [`design/contrast.md`](design/contrast.md)                     |
| See what the hub publishes to apps           | [`INTEGRATION.md`](INTEGRATION.md)                                                                                                                |

## By app

Paths inside an app's documents (`src/…`, `db/…`, `scripts/…`) refer to that app's own repository.

### OpenAppHub (this repository)

| Document                                   | What                                                                    |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| [`architecture.md`](architecture.md) §15.1 | The hub's routes, screens and server pieces                             |
| [`INTEGRATION.md`](INTEGRATION.md)         | What the hub offers and reads                                           |
| [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md) | The hub's migration notes and the suite's status table                  |
| [`SECRETS.md`](SECRETS.md)                 | Secrets                                                                 |
| [`design/`](design/)                       | Design system research, prototypes, screenshots, contrast checks, audit |
| `shared/README.md` (repo root)             | Shared code: what's in it and every version                             |
| [`tools/dbmap/`](tools/dbmap/)             | The generator behind `database-map.md`                                  |

### OpenCharterApp → [`charter/`](charter/)

| Document                                                                                         | What                                                                                                  |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [`charter/README.md`](charter/README.md)                                                         | Charter's own index: vision, scope, how its docs fit together                                         |
| [`charter/architecture.md`](charter/architecture.md)                                             | Charter's architecture: modular monolith, engines, tenancy, payments, approvals, automation inventory |
| [`charter/data-domains.md`](charter/data-domains.md)                                             | Data domains                                                                                          |
| [`charter/tables.md`](charter/tables.md)                                                         | Every Charter table, its links and write paths                                                        |
| [`charter/setup-engine.md`](charter/setup-engine.md)                                             | The guided setup engine                                                                               |
| [`charter/decisions.md`](charter/decisions.md)                                                   | Decision log (D-001 …)                                                                                |
| [`charter/INTEGRATION.md`](charter/INTEGRATION.md)                                               | Views, RPCs and sync Charter offers and uses                                                          |
| [`charter/MIGRATION-NOTES.md`](charter/MIGRATION-NOTES.md)                                       | Charter's suite migration notes                                                                       |
| [`charter/instructions.md`](charter/instructions.md)                                             | Coding instructions for Charter                                                                       |
| [`charter/testing.md`](charter/testing.md), [`charter/user-testing.md`](charter/user-testing.md) | Tests; user-testing script (exact on-screen words)                                                    |
| [`charter/demo-data.md`](charter/demo-data.md)                                                   | The staging demo (Riverside, Northstar Veterans League)                                               |
| [`charter/security-review.md`](charter/security-review.md)                                       | Security, accessibility and performance review                                                        |
| [`charter/risks-and-open-questions.md`](charter/risks-and-open-questions.md)                     | Risks and open questions                                                                              |
| [`charter/glossary.md`](charter/glossary.md)                                                     | Glossary                                                                                              |
| [`charter/plans/`](charter/plans/)                                                               | Release and review plans                                                                              |
| [`charter/epic.md`](charter/epic.md), [`charter/roadmap.md`](charter/roadmap.md)                 | History only (superseded by [`ROADMAP.md`](ROADMAP.md))                                               |

### OpenBoardApp → [`board/`](board/)

See [`board/README.md`](board/README.md): architecture, integration, migration notes; epic and roadmap kept for history.

### OpenLedgerApp → [`ledger/`](ledger/)

See [`ledger/README.md`](ledger/README.md): architecture, desktop edition, integration, migration notes, release checklist, dependencies, accessibility; epic and roadmap kept for history.

## Keeping docs current

- **A change updates its docs in the same round.** Code lives in each app's repository; its docs live here, so an app change that needs a doc change comes with a companion pull request here (Charter's CI asks for docs or tests with code changes).
- **Schema change?** Regenerate [`database-map.md`](database-map.md) (`docs/tools/dbmap/regen.sh`) and update the app's `INTEGRATION.md` if a view or RPC changed.
- **New or finished epic?** Update [`ROADMAP.md`](ROADMAP.md) (one copy for the whole suite).
- **Architecture changed?** Update [`architecture.md`](architecture.md) and the app's own architecture document.
- Diagrams are Mermaid (they render on GitHub); every diagram has a plain-language description under it.
