# Suite design directions (Phase 2)

## Decision (2026-11-09): "Civic, slightly warm"

The owner chose **Civic, made slightly warmer** (less warm than Commons), with a **grayer dark
mode** than the proposals. It's now the suite's design system: [`shared/design/`](../../shared/design/)
and [`DESIGN.md`](../../shared/design/DESIGN.md). The screenshots below render the real
`shared/design/tokens.css` (`?direction=suite` in the prototype). The three original proposals
follow for the record.

![Chosen tokens, light](screenshots/suite-tokens-light.png)

| Desktop, light                                     | Desktop, dark                                     | Phone                                            |
| -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| ![](screenshots/suite-dashboard-desktop-light.png) | ![](screenshots/suite-dashboard-desktop-dark.png) | ![](screenshots/suite-dashboard-phone-light.png) |
| ![](screenshots/suite-table-desktop-light.png)     | ![](screenshots/suite-table-desktop-dark.png)     | ![](screenshots/suite-table-phone-light.png)     |
| ![](screenshots/suite-dialog-desktop-light.png)    | ![](screenshots/suite-dialog-desktop-dark.png)    | ![](screenshots/suite-dialog-phone-light.png)    |

Dark tokens: [suite-tokens-dark.png](screenshots/suite-tokens-dark.png). Contrast: all pass
([contrast.md](contrast.md)). Phones, tablets and monitors: [devices.md](devices.md).

---

## The proposals

SHARED-SPEC §9 asked for 2–3 distinct directions. These were the three.

Each direction is **only a tokens file** ([`prototype/tokens/`](prototype/tokens/)): colour (light
and dark), fonts, type scale, radius, elevation and density. The sample screens use the same markup
for all three, so what you see is what a token swap does.

Before designing, I audited what the three apps use today: [AUDIT.md](AUDIT.md).

### At a glance

|                | A · Civic                                  | B · Commons                                     | C · Record                                     |
| -------------- | ------------------------------------------ | ----------------------------------------------- | ---------------------------------------------- |
| Feel           | clear, calm, institutional                 | warm, friendly, for volunteers                  | the official record: paper and ink             |
| Neutrals       | cool grey-blue                             | warm white / charcoal                           | paper / near-black                             |
| Primary (hub)  | ink navy                                   | charcoal                                        | black ink                                      |
| Fonts          | Inter (everything), JetBrains Mono         | Bricolage Grotesque headings, Figtree text      | Source Serif 4 headings, Source Sans 3 text    |
| Radius         | 6px                                        | 12px, pill badges                               | 2px                                            |
| Elevation      | borders, faint shadows                     | soft layered shadows, no card borders           | none (hairline rules); dialogs only            |
| Density        | compact (36px controls, 44px rows)         | roomy (42px controls, 52px rows)                | compact (36px controls, 40px rows)             |
| Charter accent | teal                                       | terracotta                                      | oxblood                                        |
| Board accent   | violet                                     | plum                                            | deep blue                                      |
| Ledger accent  | green                                      | sea green                                       | forest                                         |
| Best for       | data-heavy screens; the most "safe" choice | approachability; people who log in once a month | minutes, ledgers and print; strong identity    |
| Risk           | can feel generic                           | lower density: tables show fewer rows           | serif + sharp corners can feel formal or dated |

All three pass the contrast checks in light and dark: [contrast.md](contrast.md).

### Sample screens

Every direction shows the same three screens: a **dashboard** (Ledger accent, trial banner), a
**data table** (Charter members) and a **form dialog** (Board, with a validation error and the
keyboard focus ring on the main button). Desktop is 1440px wide; the phone is 390px, where the
sidebar becomes a drawer, tables become cards and dialogs become bottom sheets.

#### A · Civic

![Civic tokens](screenshots/civic-tokens-light.png)

| Desktop, light                                     | Desktop, dark                                     | Phone                                            |
| -------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------ |
| ![](screenshots/civic-dashboard-desktop-light.png) | ![](screenshots/civic-dashboard-desktop-dark.png) | ![](screenshots/civic-dashboard-phone-light.png) |
| ![](screenshots/civic-table-desktop-light.png)     | ![](screenshots/civic-table-desktop-dark.png)     | ![](screenshots/civic-table-phone-light.png)     |
| ![](screenshots/civic-dialog-desktop-light.png)    | ![](screenshots/civic-dialog-desktop-dark.png)    | ![](screenshots/civic-dialog-phone-light.png)    |

Dark tokens: [civic-tokens-dark.png](screenshots/civic-tokens-dark.png)

#### B · Commons

![Commons tokens](screenshots/commons-tokens-light.png)

| Desktop, light                                       | Desktop, dark                                       | Phone                                              |
| ---------------------------------------------------- | --------------------------------------------------- | -------------------------------------------------- |
| ![](screenshots/commons-dashboard-desktop-light.png) | ![](screenshots/commons-dashboard-desktop-dark.png) | ![](screenshots/commons-dashboard-phone-light.png) |
| ![](screenshots/commons-table-desktop-light.png)     | ![](screenshots/commons-table-desktop-dark.png)     | ![](screenshots/commons-table-phone-light.png)     |
| ![](screenshots/commons-dialog-desktop-light.png)    | ![](screenshots/commons-dialog-desktop-dark.png)    | ![](screenshots/commons-dialog-phone-light.png)    |

Dark tokens: [commons-tokens-dark.png](screenshots/commons-tokens-dark.png)

#### C · Record

![Record tokens](screenshots/record-tokens-light.png)

| Desktop, light                                      | Desktop, dark                                      | Phone                                             |
| --------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| ![](screenshots/record-dashboard-desktop-light.png) | ![](screenshots/record-dashboard-desktop-dark.png) | ![](screenshots/record-dashboard-phone-light.png) |
| ![](screenshots/record-table-desktop-light.png)     | ![](screenshots/record-table-desktop-dark.png)     | ![](screenshots/record-table-phone-light.png)     |
| ![](screenshots/record-dialog-desktop-light.png)    | ![](screenshots/record-dialog-desktop-dark.png)    | ![](screenshots/record-dialog-phone-light.png)    |

Dark tokens: [record-tokens-dark.png](screenshots/record-tokens-dark.png)

## Common to every direction (now in DESIGN.md)

These hold whichever direction you pick; they go into `shared/design/DESIGN.md`.

**Money:** `$1,234.56`; negatives `-$1,234.56`, shown in the destructive colour in money columns
only. Always two decimals, US-style grouping, currency symbol from the org's currency. Right-aligned
with tabular figures. Stored as `bigint` cents (§2). One helper, `formatMoney(cents, currency)`, in
`shared/`; it replaces Ledger's `formatCents` and Charter's ad-hoc `toFixed(2)`.

**Dates:** `Nov 9, 2026`; with time `Nov 9, 2026, 2:30 PM`, in the org's time zone. Never the
browser's locale default (today the apps differ: `11/9/2026`, `2026-11-09`…). Exports and file
names use ISO `2026-11-09`. One helper, `formatDate(value, { time?, timeZone })`.

**Layout:** `AppShell` with a left sidebar and a top bar (SuiteSwitcher, OrgSwitcher, Help, user
menu); `BillingBanner` under the top bar. Below 768px: sidebar → drawer, tables → cards, dialogs →
bottom sheets, page actions → full width.

**Accent use:** the app accent marks identity only: brand mark, active nav item, selected tab,
selected choice, chart series, OrgSwitcher dot. Buttons use the neutral `--primary` in every app,
so the hub and the apps behave alike and accents never carry meaning. Status uses
`--success`, `--warning`, `--destructive` and `--info` with a dot, never colour alone.

**Accessibility:** text ≥ 4.5:1 and UI boundaries (input borders, focus ring, accent marks) ≥ 3:1,
checked automatically for every token pair in light and dark. Visible focus ring (`--ring`),
labels on every field, errors linked with `aria-describedby`.

**Dark mode:** follows the system, toggle in the user menu (the `.dark` class).

**Tokens added to the shadcn set:** `--success`, `--warning`, `--info`, `--app-accent`,
`--app-accent-foreground`, `--font-sans`/`--font-display`/`--font-mono`, `--shadow-sm|md|lg`,
`--control-h`, `--row-h`, `--space-card`, `--badge-radius`, `--heading-weight`, `--heading-tracking`.

## What happens next

1. Done: the chosen tokens are `shared/design/tokens.css`, the Tailwind mapping and preset, and `DESIGN.md` (step 6).
2. Next: shared UI is built on them: `AppShell`, `SuiteSwitcher`, `OrgSwitcher`, `BillingBanner`,
   `HelpLink`, `InvitationPage` (step 7), and `shared/VERSION` goes to `1.0.0`.
3. Each app restyles in its own PRs, with before/after screenshots and no behaviour changes (§9).

## Regenerating

The prototype is static HTML in [`prototype/`](prototype/): open `prototype/dashboard.html?direction=commons&theme=dark`
in a browser to try any combination (`direction` = `suite` (chosen) | `civic` | `commons` | `record`, `theme`,
`app` = `hub` | `charter` | `board` | `ledger`). To re-render every screenshot and the contrast report:

```bash
node scripts/design-screenshots.mjs
```

It needs Playwright with Chromium and access to Google Fonts. The prototype is a review aid only;
it isn't shipped.
