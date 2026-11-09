import { mkdtempSync, readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { check } from "./check-shared.mjs";
import { plan, sync } from "./sync-shared.mjs";

function fakeApp() {
  const dir = mkdtempSync(join(tmpdir(), "oah-app-"));
  writeFileSync(
    join(dir, "package.json"),
    `{\n    "name": "fake-app",\n    "version": "1.0.0"\n}\n`,
  );
  return dir;
}

describe("sync-shared", () => {
  it("plans shared code, core SQL, the runner, the checker and the spec, without tests", () => {
    const rels = plan().map(([, rel]) => rel);
    expect(rels).toContain("shared/VERSION");
    expect(rels).toContain("shared/ui/AppShell.tsx");
    expect(rels).toContain("db/core/0001_core.sql");
    expect(rels).toContain("scripts/migrate.mjs");
    expect(rels).toContain("scripts/check-shared.mjs");
    expect(rels).toContain("docs/SHARED-SPEC.md");
    expect(rels.some((r) => r.includes(".test."))).toBe(false);
  });

  it("copies, sets oahShared (keeping indentation) and writes a manifest the checker accepts", () => {
    const app = fakeApp();
    const { version, previous, changes } = sync(app);
    expect(previous).toBeNull();
    expect(changes.added.length).toBeGreaterThan(10);
    const pkgText = readFileSync(join(app, "package.json"), "utf8");
    expect(JSON.parse(pkgText).oahShared).toBe(version);
    expect(pkgText).toContain('\n    "oahShared"');
    expect(existsSync(join(app, "shared/ui/ssr.test.tsx"))).toBe(false);
    expect(check(app)).toEqual([]);

    const again = sync(app);
    expect(again.changes.added).toEqual([]);
    expect(again.changes.updated).toEqual([]);
  });

  it("removes files the hub no longer has, and the checker catches hand edits", () => {
    const app = fakeApp();
    sync(app);
    mkdirSync(join(app, "shared/old"), { recursive: true });
    writeFileSync(join(app, "shared/old/gone.ts"), "export {}");
    writeFileSync(join(app, "db/core/9999_stale.sql"), "select 1;");
    const { changes } = sync(app);
    expect(changes.removed.sort()).toEqual(["db/core/9999_stale.sql", "shared/old/gone.ts"]);
    expect(existsSync(join(app, "shared/old/gone.ts"))).toBe(false);

    writeFileSync(join(app, "shared/format.ts"), "// edited in the app\n");
    expect(check(app).join("\n")).toContain("shared/format.ts was changed here");
  });

  it("dry run changes nothing and refuses the hub itself", () => {
    const app = fakeApp();
    const { changes } = sync(app, { dryRun: true });
    expect(changes.added.length).toBeGreaterThan(10);
    expect(existsSync(join(app, "shared"))).toBe(false);
    expect(JSON.parse(readFileSync(join(app, "package.json"), "utf8")).oahShared).toBeUndefined();
    expect(() => sync(process.cwd())).toThrow(/into itself/);
  });
});
