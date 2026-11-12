"""Fill template.md's <!--GEN:id--> markers with generated.md's sections → ../../database-map.md."""
import os, re
D = os.path.dirname(os.path.abspath(__file__))
gen = open(os.path.join(D, "generated.md")).read()
parts = {m.group(1): m.group(2).strip() for m in re.finditer(r"<!--GEN:([a-z-]+)-->\n(.*?)(?=\n\n<!--GEN:|\Z)", gen, re.S)}
out = re.sub(r"<!--GEN:([a-z-]+)-->", lambda m: parts[m.group(1)], open(os.path.join(D, "template.md")).read())
open(os.path.join(D, "..", "..", "database-map.md"), "w").write(out)
print("wrote docs/database-map.md")
