"""Generate database-map sections (mermaid erDiagram + column tables) from the TSV dumps."""
import collections, csv, sys, os

D = os.path.dirname(os.path.abspath(__file__))

def tsv(name):
    with open(os.path.join(D, name)) as f:
        return [l.rstrip("\n").split("\t") for l in f if l.strip()]

cols = collections.defaultdict(list)
for s, t, c, pos, typ, nullable, default in tsv("cols.tsv"):
    cols[(s, t)].append((c, typ, nullable == "YES", default))
pks = collections.defaultdict(set)
for s, t, c in tsv("pks.tsv"):
    pks[(s, t)].add(c)
uniq = collections.defaultdict(list)
for s, t, c in tsv("uniq.tsv"):
    uniq[(s, t)].append(c)
fks = collections.defaultdict(list)  # (s,t) -> [(cols, rs, rt, deltype)]
for s, t, c, rs, rt, dt in tsv("fks.tsv"):
    fks[(s, t)].append((c, rs, rt, dt))
comments = {(s, t): c for s, t, c in tsv("comments.tsv")}

TYPE = {
    "timestamp with time zone": "timestamptz", "timestamp without time zone": "timestamp",
    "character varying": "varchar", "character": "char", "double precision": "float8",
    "boolean": "bool", "integer": "int", "bigint": "bigint", "smallint": "int2",
}
DEL = {"c": "cascade", "n": "set null", "r": "restrict", "a": "no action", "d": "set default"}

def ent(s, t):
    return f"{s}_{t}"

def mtype(typ):
    t = TYPE.get(typ, typ).replace(" ", "_").replace("[]", "_array")
    return t

def diagram(tables, external=()):
    """tables: list of (schema, table) drawn with their key columns."""
    tset = set(tables)
    out = ["```mermaid", "erDiagram"]
    rels = []
    refs = set()
    for st in tables:
        fkcols = {}
        for c, rs, rt, dt in fks.get(st, []):
            for cc in c.split(","):
                fkcols[cc] = (rs, rt)
            refs.add((rs, rt))
            nullable = any(x[2] for x in cols[st] if x[0] in c.split(","))
            unique = c in uniq.get(st, []) or set(c.split(",")) == pks.get(st, set())
            left = "|o" if unique else "}o"
            right = "o|" if nullable else "||"
            rels.append(f'    {ent(*st)} {left}--{right} {ent(rs, rt)} : "{c}"')
        out.append(f"    {ent(*st)} {{")
        for c, typ, nullable, default in cols[st]:
            keys = []
            if c in pks.get(st, set()):
                keys.append("PK")
            if c in fkcols:
                keys.append("FK")
            if c in uniq.get(st, []) and "PK" not in keys:
                keys.append("UK")
            interesting = keys or c in ("name", "title", "status", "type", "kind", "role", "email",
                                        "amount_minor", "amount_cents", "meeting_date", "due_date",
                                        "key", "template", "category", "slug", "starts_on", "ended_on",
                                        "start_date", "end_date", "transaction_date", "frequency", "next_due",
                                        "outcome", "plan_id", "apps", "office", "position", "person_name")
            if interesting:
                out.append(f"        {mtype(typ)} {c} {','.join(keys)}".rstrip())
        out.append("    }")
    for rs, rt in sorted(refs - tset):
        if (rs, rt) in external or True:
            out.append(f"    {ent(rs, rt)} {{")
            for c in sorted(pks.get((rs, rt), {"id"})):
                out.append(f"        uuid {c} PK")
            out.append("    }")
    out += sorted(set(rels))
    out.append("```")
    return "\n".join(out)

def columns_table(tables):
    out = []
    for st in tables:
        s, t = st
        desc = comments.get(st, "")
        out.append(f"<details><summary><code>{s}.{t}</code>{' — ' + desc if desc else ''} ({len(cols[st])} columns)</summary>\n")
        out.append("| Column | Type | Null | Default | Key / reference |")
        out.append("|---|---|---|---|---|")
        fkmap = {}
        for c, rs, rt, dt in fks.get(st, []):
            for cc in c.split(","):
                fkmap[cc] = f"→ `{rs}.{rt}` (on delete {DEL.get(dt, dt)})"
        for c, typ, nullable, default in cols[st]:
            key = []
            if c in pks.get(st, set()):
                key.append("PK")
            if c in uniq.get(st, []):
                key.append("unique")
            if c in fkmap:
                key.append(fkmap[c])
            d = default.replace("|", "\\|")
            if len(d) > 40:
                d = d[:37] + "…"
            out.append(f"| `{c}` | {typ} | {'yes' if nullable else ''} | {('`' + d + '`') if d else ''} | {' '.join(key)} |")
        multi = [u for u in uniq.get(st, []) if "," in u]
        if multi:
            out.append(f"\nUnique together: {'; '.join('(' + u.replace(',', ', ') + ')' for u in multi)}.")
        out.append("\n</details>\n")
    return "\n".join(out)

def all_tables(schema):
    return sorted(t for (s, t) in cols if s == schema)

if __name__ == "__main__":
    import json
    spec = json.load(open(sys.argv[1]))
    used = set()
    parts = []
    for sec in spec:
        tables = [tuple(x.split(".")) for x in sec["tables"]]
        missing = [x for x in tables if x not in cols]
        if missing:
            raise SystemExit(f"unknown tables {missing}")
        used |= set(tables)
        parts.append(f"<!--GEN:{sec['id']}-->\n" + diagram(tables) + "\n\n" + columns_table(tables))
    left = sorted(set(cols) - used)
    print("\n\n".join(parts))
    if left:
        sys.stderr.write("NOT MAPPED: " + ", ".join(f"{s}.{t}" for s, t in left) + "\n")
