# Database map generator

`regen.sh` rebuilds [`../../database-map.md`](../../database-map.md) from a database built by every repo's migrations:

- `spec.json`: which tables go in which section (a new table must be added here; the script reports any table that isn't).
- `gen.py`: draws each section's Mermaid entity-relationship diagram from the real foreign keys and writes the column lists.
- `template.md`: the hand-written explanations, with `<!--GEN:section-->` markers where the generated parts go. Edit the words here, not in `database-map.md`.
- `assemble.py`: fills the template.

```sh
DATABASE_URL=postgres://postgres:postgres@localhost:5432/suite bash docs/tools/dbmap/regen.sh
```
