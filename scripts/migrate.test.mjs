import { describe, expect, it } from "vitest";
import { checksum, parseArgs, plan } from "./migrate.mjs";

const file = (version, sql = `-- ${version}`) => ({
  file: `${version}.sql`,
  version,
  sql,
  checksum: checksum(sql),
});

describe("migrate.mjs", () => {
  it("parses flags", () => {
    const o = parseArgs(["--seed", "--dry-run", "--skip", "0001_billing.sql", "--skip", "x"]);
    expect(o.seed).toBe(true);
    expect(o.dryRun).toBe(true);
    expect([...o.skip]).toEqual(["0001_billing", "x"]);
    expect(() => parseArgs(["--nope"])).toThrow();
    expect(() => parseArgs(["--skip"])).toThrow();
  });

  it("applies core first, skips recorded files and honours --skip", () => {
    const groups = [
      { key: "core", files: [file("0001_core"), file("0002_core_functions")] },
      { key: "openapphub", files: [file("0001_billing")] },
    ];
    const applied = new Map([["core/0001_core", checksum("-- 0001_core")]]);
    const { steps, changed } = plan(groups, applied, new Set(["0001_billing"]));
    expect(changed).toEqual([]);
    expect(steps.map((s) => [s.key, s.version, s.skipped])).toEqual([
      ["core", "0002_core_functions", false],
      ["openapphub", "0001_billing", true],
    ]);
  });

  it("reports changed checksums", () => {
    const groups = [{ key: "core", files: [file("0001_core", "-- edited")] }];
    const { changed } = plan(groups, new Map([["core/0001_core", "old"]]), new Set());
    expect(changed).toEqual(["core/0001_core.sql"]);
  });
});
