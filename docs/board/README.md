# OpenBoardApp documentation

Moved here from the OpenBoardApp repository on 2026-11-12. Paths like `src/…` and `db/…` refer to that repository. Suite-wide documents: [`../README.md`](../README.md).

| Document                                         | What                                                                                                                                                          |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`architecture.md`](architecture.md)             | Layers (screens → data facade → cloud adapter → database guards), where rules live, tenancy, live voting and official records, files and packets, exports, CI |
| [`INTEGRATION.md`](INTEGRATION.md)               | Views Board offers (`api_meetings`, `api_decisions`, `api_action_items`), `add_report_to_meeting`, the officer sync with Charter                              |
| [`MIGRATION-NOTES.md`](MIGRATION-NOTES.md)       | Board's move onto the OpenAppHub suite                                                                                                                        |
| [`epic.md`](epic.md), [`roadmap.md`](roadmap.md) | History only: the roadmap is [`../ROADMAP.md`](../ROADMAP.md) (items `B-`)                                                                                    |

Suite architecture: [`../architecture.md`](../architecture.md) §15.3. Board's tables: [`../database-map.md`](../database-map.md) §8.
