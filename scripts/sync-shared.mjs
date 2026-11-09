#!/usr/bin/env node
// Copies the hub's canonical shared code into an app checkout (SHARED-SPEC §8).
//
//   node scripts/sync-shared.mjs ../OpenBoardApp            # sync
//   node scripts/sync-shared.mjs ../OpenBoardApp --dry-run  # show what would change
//
// Copies (mirrors: files removed here are removed there too):
//   shared/**              → <app>/shared/        (tests stay in the hub)
//   db/core/*.sql          → <app>/db/core/
//   scripts/migrate.mjs    → <app>/scripts/migrate.mjs
//   scripts/check-shared.mjs → <app>/scripts/check-shared.mjs
//   docs/SHARED-SPEC.md    → <app>/docs/SHARED-SPEC.md
// Writes <app>/shared/MANIFEST.json (sha256 of every copied file) and sets
// "oahShared" in <app>/package.json to shared/VERSION.
// In the app, `node scripts/check-shared.mjs` (run by its CI) fails if any copied
// file was edited by hand or the version doesn't match.
// Then open a PR in the app titled "chore: sync shared vX.Y.Z".

import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HUB = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const isTest = (p) => /\.test\.(ts|tsx|mjs|js)$/.test(p);

function walk(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");
const posix = (p) => p.split(sep).join("/");

/** The files to copy, as [source, relative target path]. */
export function plan(hub = HUB) {
  const files = [];
  for (const f of walk(join(hub, "shared"))) {
    const rel = posix(relative(hub, f));
    if (!isTest(rel) && !rel.endsWith("MANIFEST.json")) files.push([f, rel]);
  }
  for (const f of walk(join(hub, "db/core"))) {
    if (f.endsWith(".sql")) files.push([f, posix(relative(hub, f))]);
  }
  files.push([join(hub, "scripts/migrate.mjs"), "scripts/migrate.mjs"]);
  files.push([join(hub, "scripts/check-shared.mjs"), "scripts/check-shared.mjs"]);
  files.push([join(hub, "docs/SHARED-SPEC.md"), "docs/SHARED-SPEC.md"]);
  return files.sort((a, b) => a[1].localeCompare(b[1]));
}

/** Mirrored folders: anything in them that the hub no longer has is removed. */
const MIRRORED = ["shared", "db/core"];

export function sync(target, { dryRun = false, hub = HUB } = {}) {
  const root = resolve(target);
  if (root === resolve(hub)) throw new Error("Refusing to sync the hub into itself.");
  if (!existsSync(join(root, "package.json"))) {
    throw new Error(`${root} has no package.json; is it an app checkout?`);
  }
  const version = readFileSync(join(hub, "shared/VERSION"), "utf8").trim();
  const files = plan(hub);
  const wanted = new Set(files.map(([, rel]) => rel));
  const changes = { added: [], updated: [], removed: [], unchanged: 0 };
  const manifest = {};

  for (const [src, rel] of files) {
    const data = readFileSync(src);
    manifest[rel] = sha256(data);
    const dest = join(root, rel);
    if (!existsSync(dest)) changes.added.push(rel);
    else if (sha256(readFileSync(dest)) !== manifest[rel]) changes.updated.push(rel);
    else {
      changes.unchanged++;
      continue;
    }
    if (!dryRun) {
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, data);
    }
  }

  for (const folder of MIRRORED) {
    for (const f of walk(join(root, folder))) {
      const rel = posix(relative(root, f));
      if (rel === "shared/MANIFEST.json" || wanted.has(rel)) continue;
      changes.removed.push(rel);
      if (!dryRun) rmSync(f);
    }
  }

  const pkgPath = join(root, "package.json");
  const pkgText = readFileSync(pkgPath, "utf8");
  const pkg = JSON.parse(pkgText);
  const previous = pkg.oahShared ?? null;
  if (!dryRun) {
    const indent = /^(\s+)"/m.exec(pkgText)?.[1] ?? "  ";
    pkg.oahShared = version;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, indent)}\n`);
    writeFileSync(
      join(root, "shared/MANIFEST.json"),
      `${JSON.stringify({ version, files: manifest }, null, 2)}\n`,
    );
  }
  return { version, previous, changes };
}

function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const target = args.find((a) => !a.startsWith("--"));
  if (!target || args.includes("--help")) {
    console.log("Usage: node scripts/sync-shared.mjs <app checkout> [--dry-run]");
    process.exit(target ? 0 : 1);
  }
  const { version, previous, changes } = sync(target, { dryRun });
  const tag = dryRun ? " (dry run)" : "";
  console.log(`shared ${previous ?? "(none)"} → ${version}${tag}`);
  for (const f of changes.added) console.log(`  add     ${f}`);
  for (const f of changes.updated) console.log(`  update  ${f}`);
  for (const f of changes.removed) console.log(`  remove  ${f}`);
  console.log(`  ${changes.unchanged} unchanged`);
  if (!dryRun) console.log(`\nNext: open a PR in the app titled "chore: sync shared v${version}".`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
