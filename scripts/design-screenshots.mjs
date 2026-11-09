#!/usr/bin/env node
// Renders the Phase 2 design prototype (docs/design/prototype) to PNGs and
// writes a contrast report. Needs Playwright with Chromium (not a project
// dependency: `npm i -g playwright && npx playwright install chromium`) and
// network access to Google Fonts.
//
//   node scripts/design-screenshots.mjs            # all directions
//   node scripts/design-screenshots.mjs civic      # one direction
//
// Output: docs/design/screenshots/<direction>-<screen>-<desktop|phone>-<light|dark>.png
//         docs/design/contrast.md

/* global document, getComputedStyle -- used inside page.evaluate(), which runs in the browser */
import { mkdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const proto = join(root, "docs/design/prototype");
const outDir = join(root, "docs/design/screenshots");
mkdirSync(outDir, { recursive: true });

const ALL = ["civic", "commons", "record"];
const directions = process.argv.slice(2).length ? process.argv.slice(2) : ALL;
const SCREENS = [
  { name: "dashboard", file: "dashboard.html", app: "ledger", fullPage: true },
  { name: "table", file: "table.html", app: "charter", fullPage: true },
  { name: "dialog", file: "dialog.html", app: "board", fullPage: false },
];
const SHOTS = [
  { view: "desktop", theme: "light", viewport: { width: 1440, height: 900 }, scale: 1 },
  { view: "desktop", theme: "dark", viewport: { width: 1440, height: 900 }, scale: 1 },
  { view: "phone", theme: "light", viewport: { width: 390, height: 844 }, scale: 2 },
];

const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
const browser = await chromium.launch(proxy ? { proxy: { server: proxy } } : {});

async function open(file, params, viewport, scale) {
  const context = await browser.newContext({
    viewport,
    deviceScaleFactor: scale,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();
  const url = `${pathToFileURL(join(proto, file)).href}?${new URLSearchParams(params)}`;
  await page.goto(url, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);
  return { page, context };
}

// Measures contrast on the rendered page: colours are resolved by the browser
// (oklch, color-mix, var()) and read back as sRGB through a canvas.
async function measure(page) {
  return page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const rgb = (color) => {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, 1, 1);
      ctx.fillStyle = color;
      ctx.fillRect(0, 0, 1, 1);
      return Array.from(ctx.getImageData(0, 0, 1, 1).data).slice(0, 3);
    };
    const lum = ([r, g, b]) => {
      const f = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const ratio = (a, b) => {
      const [x, y] = [lum(rgb(a)), lum(rgb(b))].sort((m, n) => n - m);
      return (x + 0.05) / (y + 0.05);
    };
    const probe = (attrs, style) => {
      const el = document.createElement("span");
      Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
      el.textContent = "x";
      Object.assign(el.style, style || {});
      document.body.appendChild(el);
      const cs = getComputedStyle(el);
      const out = { color: cs.color, bg: cs.backgroundColor };
      el.remove();
      return out;
    };
    const v = (name) => probe({}, { color: `var(--${name})` }).color;
    const pairs = [
      ["Text on background", "foreground", "background", 4.5],
      ["Text on card", "card-foreground", "card", 4.5],
      ["Muted text on background", "muted-foreground", "background", 4.5],
      ["Muted text on card", "muted-foreground", "card", 4.5],
      ["Table header (muted on muted)", "muted-foreground", "muted", 4.5],
      ["Primary button", "primary-foreground", "primary", 4.5],
      ["Secondary", "secondary-foreground", "secondary", 4.5],
      ["Error text on card", "destructive", "card", 4.5],
      ["Destructive button", "destructive-foreground", "destructive", 4.5],
      ["Focus ring vs background (UI, 3:1)", "ring", "background", 3],
      ["Input border vs card (UI, 3:1)", "input", "card", 3],
    ];
    const rows = pairs.map(([label, fg, bg, min]) => ({ label, ratio: ratio(v(fg), v(bg)), min }));
    for (const tone of ["success", "warning", "danger", "info", "neutral"]) {
      const b = probe({ class: `badge b-${tone}` });
      rows.push({ label: `Badge: ${tone}`, ratio: ratio(b.color, b.bg), min: 4.5 });
    }
    for (const app of ["hub", "charter", "board", "ledger"]) {
      const a = probe(
        { "data-app": app },
        { color: "var(--app-accent-foreground)", backgroundColor: "var(--app-accent)" },
      );
      rows.push({ label: `Accent ${app}: text on accent`, ratio: ratio(a.color, a.bg), min: 4.5 });
      rows.push({
        label: `Accent ${app}: accent vs background (UI, 3:1)`,
        ratio: ratio(a.bg, v("background")),
        min: 3,
      });
    }
    return rows;
  });
}

const report = [];
for (const direction of directions) {
  for (const theme of ["light", "dark"]) {
    const { page, context } = await open(
      "tokens.html",
      { direction, theme },
      { width: 1280, height: 900 },
      1,
    );
    await page.screenshot({
      path: join(outDir, `${direction}-tokens-${theme}.png`),
      fullPage: true,
    });
    report.push({ direction, theme, rows: await measure(page) });
    await context.close();
  }
  for (const screen of SCREENS) {
    for (const shot of SHOTS) {
      const { page, context } = await open(
        screen.file,
        { direction, theme: shot.theme, app: screen.app },
        shot.viewport,
        shot.scale,
      );
      const file = `${direction}-${screen.name}-${shot.view}-${shot.theme}.png`;
      await page.screenshot({ path: join(outDir, file), fullPage: screen.fullPage });
      await context.close();
      console.log(`wrote ${file}`);
    }
  }
}
await browser.close();

if (directions.length === ALL.length) {
  const lines = [
    "# Contrast report",
    "",
    "Generated by `scripts/design-screenshots.mjs` from the rendered prototype. Text needs 4.5:1;",
    "UI boundaries (focus ring, input borders, accent marks) need 3:1. ✗ marks a miss.",
    "",
  ];
  for (const { direction, theme, rows } of report) {
    lines.push(
      `## ${direction} · ${theme}`,
      "",
      "| Pair | Ratio | Needs | |",
      "|---|---:|---:|---|",
    );
    for (const r of rows)
      lines.push(
        `| ${r.label} | ${r.ratio.toFixed(2)} | ${r.min} | ${r.ratio >= r.min ? "✓" : "✗"} |`,
      );
    lines.push("");
  }
  writeFileSync(join(root, "docs/design/contrast.md"), lines.join("\n"));
  const misses = report.flatMap((d) =>
    d.rows
      .filter((r) => r.ratio < r.min)
      .map((r) => `${d.direction}/${d.theme}: ${r.label} ${r.ratio.toFixed(2)}`),
  );
  console.log(
    misses.length ? `Contrast misses:\n  ${misses.join("\n  ")}` : "All contrast checks pass.",
  );
}
