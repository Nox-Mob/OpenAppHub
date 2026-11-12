# OpenLedgerApp documentation

Moved here from the OpenLedgerApp repository on 2026-11-12. Paths like `src/…` and `db/…` refer to that repository (`BLUEPRINT.md` and `CHANGELOG.md` stay there). Suite-wide documents: [`../README.md`](../README.md).

| Document                                                                     | What                                                                                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| [`architecture.md`](architecture.md)                                         | Layers (server functions → services → domain → ports and adapters), status by area, saving changes with their history, backups, sign-in, CI |
| [`desktop.md`](desktop.md)                                                   | The desktop edition (Tauri + SQLite)                                                                                                        |
| [`INTEGRATION.md`](INTEGRATION.md)                                           | Views Ledger offers (`api_budgets`, `api_period_summaries`, `api_tasks`) and what it uses                                                   |
| [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md)                                   | Ledger's move onto the OpenAppHub suite                                                                                                     |
| [`release-checklist.md`](release-checklist.md)                               | Release steps (update `architecture.md`'s "Current as of" line here when releasing)                                                         |
| [`dependencies.md`](dependencies.md), [`accessibility.md`](accessibility.md) | Dependency and accessibility notes                                                                                                          |
| [`epic.md`](epic.md), [`roadmap.md`](roadmap.md)                             | History only: the roadmap is [`../ROADMAP.md`](../ROADMAP.md) (items `L-`)                                                                  |

Suite architecture: [`../architecture.md`](../architecture.md) §15.4. Ledger's tables: [`../database-map.md`](../database-map.md) §9.
