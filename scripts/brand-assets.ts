#!/usr/bin/env node
// Writes an app's logo files from shared/brand/marks.ts (run by hand when the marks change):
//
//   node scripts/brand-assets.ts <app id> <app checkout>    e.g. charter ../opencharterapp
//   node scripts/brand-assets.ts hub .
//
// Into <checkout>/public/:
//   favicon.svg, favicon.ico (16, 32, 48 px), apple-touch-icon.png (180 px, square: iOS rounds it)
//   brand/<app>-logo.svg and brand/<app>-logo-<size>.png   the tile; transparent outside its corners
//   brand/<app>-glyph.svg and brand/<app>-glyph-<size>.png the mark alone, on transparency
// PNG sizes: 16, 32, 48, 64, 128, 180, 192, 256, 512, 1024. Needs Playwright's Chromium.
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import process from "node:process";
import { markSvg } from "../shared/brand/marks.ts";
import type { AppId } from "../shared/supabase/hosted.ts";

const SIZES = [16, 32, 48, 64, 128, 180, 192, 256, 512, 1024];
const APPS: AppId[] = ["hub", "charter", "board", "ledger"];

/** An .ico holding PNG images (supported by every current browser). */
export function ico(pngs: { size: number; data: Buffer }[]): Buffer {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entries = pngs.map(({ size, data }) => {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    return e;
  });
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

async function main() {
  const [app, dir] = process.argv.slice(2) as [AppId | undefined, string | undefined];
  if (!app || !APPS.includes(app) || !dir) {
    console.error("Usage: node scripts/brand-assets.ts <hub|charter|board|ledger> <app checkout>");
    process.exit(1);
  }
  const pub = join(resolve(dir), "public");
  const brand = join(pub, "brand");
  mkdirSync(brand, { recursive: true });

  const { chromium } = createRequire(import.meta.url)("playwright");
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const png = async (svg: string, size: number): Promise<Buffer> => {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">` +
        svg.replace("<svg ", `<svg width="${size}" height="${size}" style="display:block" `) +
        `</body></html>`,
    );
    return page.screenshot({ omitBackground: true, type: "png" });
  };

  const tile = markSvg(app, "tile");
  const glyph = markSvg(app, "glyph");
  writeFileSync(join(pub, "favicon.svg"), `${tile}\n`);
  writeFileSync(join(brand, `${app}-logo.svg`), `${tile}\n`);
  writeFileSync(join(brand, `${app}-glyph.svg`), `${glyph}\n`);
  for (const size of SIZES) {
    writeFileSync(join(brand, `${app}-logo-${size}.png`), await png(tile, size));
    writeFileSync(join(brand, `${app}-glyph-${size}.png`), await png(glyph, size));
  }
  // One at a time: they share the page.
  const small: { size: number; data: Buffer }[] = [];
  for (const size of [16, 32, 48]) small.push({ size, data: await png(tile, size) });
  writeFileSync(join(pub, "favicon.ico"), ico(small));
  writeFileSync(
    join(pub, "apple-touch-icon.png"),
    await png(markSvg(app, "tile", { square: true }), 180),
  );
  await browser.close();
  console.log(`Wrote ${app}'s logo files to ${pub}`);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
