// Screen-size and accessibility audit (docs/design/devices.md).
// Usage: node docs/tools/screens/audit.js <targets.json> <outdir>
// targets.json: { login?: {url, email, password}, pages: [{name, url}] }
// Needs Playwright with Chromium, and axe-core: `npm i --no-save axe-core` in this folder or any
// folder above it.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const AXE = fs.readFileSync(
  require.resolve("axe-core/axe.min.js", { paths: [__dirname, process.cwd()] }),
  "utf8",
);
const VIEWPORTS = [
  { name: "iphone-se", width: 375, height: 667, mobile: true },
  { name: "iphone-15", width: 393, height: 852, mobile: true },
  { name: "iphone-15-pro-max", width: 430, height: 932, mobile: true },
  { name: "galaxy-s8", width: 360, height: 740, mobile: true },
  { name: "pixel-7", width: 412, height: 915, mobile: true },
  { name: "ipad-mini", width: 768, height: 1024, mobile: true },
  { name: "ipad-air-landscape", width: 1180, height: 820, mobile: true },
  { name: "720p", width: 1280, height: 720, mobile: false },
  { name: "1080p", width: 1920, height: 1080, mobile: false },
];
(async () => {
  const cfg = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  const out = process.argv[3];
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch();
  let storage;
  if (cfg.login) {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();
    await p.goto(cfg.login.url, { waitUntil: "networkidle" });
    await p.getByLabel(/email/i).first().fill(cfg.login.email);
    await p
      .getByLabel(/password/i)
      .first()
      .fill(cfg.login.password);
    await p
      .getByRole("button", { name: /sign in/i })
      .first()
      .click();
    await p.waitForTimeout(6000);
    storage = await ctx.storageState();
    await ctx.close();
  }
  const results = [];
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      isMobile: vp.mobile && vp.width < 1000,
      hasTouch: vp.mobile,
      deviceScaleFactor: 1,
      ...(storage ? { storageState: storage } : {}),
    });
    // Hide the cookie banner by pre-setting consent.
    await ctx.addInitScript(() => {
      try {
        document.cookie =
          "oah_consent=" +
          encodeURIComponent(
            JSON.stringify({ v: 1, preferences: false, at: new Date().toISOString() }),
          ) +
          "; path=/";
      } catch {}
    });
    for (const pg of cfg.pages) {
      const page = await ctx.newPage();
      let error = null;
      try {
        await page.goto(pg.url, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(1500);
        if (pg.click) {
          await page
            .getByRole("button", { name: pg.click })
            .first()
            .click({ timeout: 5000 })
            .catch(() => {});
          await page.waitForTimeout(800);
        }
      } catch (e) {
        error = String(e.message).slice(0, 120);
      }
      const m = await page.evaluate(
        ({ mobile }) => {
          const vw = document.documentElement.clientWidth;
          const sw = document.documentElement.scrollWidth;
          const inScroller = (el) => {
            for (let p = el.parentElement; p; p = p.parentElement) {
              const s = getComputedStyle(p);
              if (/(auto|scroll|hidden)/.test(s.overflowX) && p.scrollWidth > p.clientWidth + 1)
                return true;
            }
            return false;
          };
          const wide = [];
          for (const el of document.querySelectorAll("body *")) {
            const r = el.getBoundingClientRect();
            if (r.width === 0 || r.height === 0) continue;
            if (getComputedStyle(el).position === "fixed") continue;
            if (r.right > vw + 1 && !inScroller(el))
              wide.push(
                `${el.tagName.toLowerCase()}.${(el.className && typeof el.className === "string" ? el.className : "").split(" ").slice(0, 3).join(".")} "${(el.textContent || "").trim().slice(0, 40)}" right=${Math.round(r.right)}`,
              );
          }
          const small = [];
          if (mobile)
            for (const el of document.querySelectorAll(
              "a[href], button, input:not([type=hidden]), select, [role=button], [role=tab], [role=checkbox], [role=switch]",
            )) {
              const r = el.getBoundingClientRect();
              if (r.width === 0 || r.height === 0) continue;
              const st = getComputedStyle(el);
              if (st.visibility === "hidden" || el.classList.contains("sr-only")) continue;
              if (
                (r.width < 24 || r.height < 24) &&
                !(el.tagName === "A" && getComputedStyle(el).display === "inline")
              )
                small.push(
                  `${el.tagName.toLowerCase()} "${(el.getAttribute("aria-label") || el.textContent || "").trim().slice(0, 30)}" ${Math.round(r.width)}x${Math.round(r.height)}`,
                );
            }
          return {
            overflow: sw > vw + 1 ? sw - vw : 0,
            wide: wide.slice(0, 8),
            small: [...new Set(small)].slice(0, 10),
            smallCount: small.length,
          };
        },
        { mobile: vp.mobile },
      );
      let axe = [];
      if (vp.name === "iphone-15" || vp.name === "1080p") {
        await page.addScriptTag({ content: AXE });
        axe = await page.evaluate(async () => {
          const r = await window.axe.run(document, {
            resultTypes: ["violations"],
            runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"] },
          });
          return r.violations.map(
            (v) => `${v.impact} ${v.id} (${v.nodes.length}): ${v.nodes[0]?.target?.join(" ")}`,
          );
        });
      }
      const shot = path.join(out, `${pg.name}--${vp.name}.png`);
      await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
      results.push({ page: pg.name, vp: vp.name, error, ...m, axe });
      await page.close();
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, "results.json"), JSON.stringify(results, null, 1));
  for (const r of results) {
    const issues = [];
    if (r.error) issues.push("ERROR " + r.error);
    if (r.overflow) issues.push(`overflow ${r.overflow}px: ${r.wide.slice(0, 3).join(" | ")}`);
    if (r.smallCount)
      issues.push(`small targets ${r.smallCount}: ${r.small.slice(0, 4).join(" | ")}`);
    if (r.axe.length) issues.push(`axe: ${r.axe.join(" || ")}`);
    if (issues.length) console.log(`${r.page} @ ${r.vp}: ${issues.join("  ##  ")}`);
  }
  console.log("done", results.length);
})();
