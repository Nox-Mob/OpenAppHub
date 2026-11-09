# Design audit: Charter, Board and Ledger (2026-11-09)

Phase 2, step 5 (SHARED-SPEC §9). This is what the three apps use today, read from their `main`
branches, so the new design language covers all of it. Counts are imports outside `components/ui/`.

## 1. Look today

|                    | OpenCharterApp                                   | OpenBoardApp                                  | OpenLedgerApp                                 |
| ------------------ | ------------------------------------------------ | --------------------------------------------- | --------------------------------------------- |
| Background         | warm cream `oklch(0.96 0.014 85)`                | warm cream `oklch(0.972 0.008 95)`            | near-white (app), cream (website)             |
| Primary            | deep green `oklch(0.36 0.07 162)`                | green `oklch(0.44 0.07 165)`                  | green `oklch(0.40 0.075 165)`                 |
| Fonts              | Fraunces (display) + Public Sans                 | Libre Baskerville + IBM Plex Sans + Plex Mono | Libre Baskerville + IBM Plex Sans + Plex Mono |
| Radius             | 6px                                              | 8px                                           | 8px                                           |
| Dark mode          | tokens defined                                   | tokens defined                                | tokens + `ThemeToggle`                        |
| Hard-coded colours | **24 Tailwind palette classes, 4 hex** (must go) | none                                          | none                                          |
| Extra tokens       | —                                                | `--success`, `--warning`                      | `.tnum` utility, website variant              |

The three are close (cream, green, serif headings) but not shared. None is the reference (§0.1).

## 2. Components in use

All three ship the full shadcn/ui kit (46 files), but use only part of it:

| Component                                                    |   Charter |     Board | Ledger | Notes for the system                                                      |
| ------------------------------------------------------------ | --------: | --------: | -----: | ------------------------------------------------------------------------- |
| Button                                                       |        52 |        27 |     14 | Ledger also hand-rolls primary buttons with utility classes               |
| Input                                                        |        30 |        17 |      1 | Ledger uses plain `<input>` with utilities                                |
| Label                                                        |        28 |        15 |      1 |                                                                           |
| Select                                                       |        23 |         9 |      — | Ledger uses native `<select>`                                             |
| Badge                                                        |        19 |         5 |      — | status badges (below)                                                     |
| Dialog                                                       |        14 |         5 |      1 | form dialogs are the main editing pattern in Charter                      |
| Alert dialog                                                 |         — |         2 |      1 | destructive confirms                                                      |
| Table                                                        |         7 |         — |      — | Board and Ledger hand-roll `<table>`                                      |
| Switch / Checkbox / Radio group                              | 6 / 6 / 3 | — / 2 / — |      — | settings, consent, choices                                                |
| Textarea                                                     |         3 |         6 |      — | minutes, notes                                                            |
| Tabs                                                         |         — |         3 |      — | meeting workspace (Agenda, Attendance, Motions, Minutes, Packet, Actions) |
| Tooltip, Toggle, Skeleton, Sheet, Separator, Sonner (toasts) |    1 each |    1 each | 1 each | shared shell pieces                                                       |
| Progress                                                     |         2 |         — |      — | setup wizard                                                              |
| Slider, Dropdown menu, Chart (Recharts)                      |         — |         — | 1 each | Ledger dashboard and terms sliders                                        |

Unused everywhere (candidates to drop from the vendored kit): accordion, aspect-ratio, breadcrumb,
calendar, carousel, collapsible, command, context-menu, drawer (only via sheet), hover-card,
input-otp, menubar, navigation-menu, pagination, popover, resizable, scroll-area, toggle-group.

## 3. App-level patterns

| Pattern                    | Where                                                                                                                                                                                                                           | What the system needs                                                                          |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| **App shell**              | all three: 256px left sidebar `md:flex`; Charter and Board show a top bar and horizontal nav strip below 768px; Ledger shows the sidebar only                                                                                   | One `AppShell`: sidebar + top bar; drawer below 768px (§9)                                     |
| **Org switcher**           | Ledger (`OrgSwitcher`), Charter (orgs page)                                                                                                                                                                                     | Top-bar `OrgSwitcher`                                                                          |
| **Page states**            | `PageStates` in Board (Empty 44, Loading 35, Error 13) and Ledger (Empty 20, Loading 31, Error 29); Charter uses Skeleton                                                                                                       | Shared empty / loading / error states                                                          |
| **Status badges**          | Board `StatusBadge` (16 statuses: draft, scheduled, in progress, completed, approved, carried, failed, tabled…); Charter `StandingBadge` (good, grace, lapsed, pending, cancelled, declined); all mapped onto 4 shadcn variants | Semantic badge tones: neutral, info, success, warning, danger, outline                         |
| **Data tables**            | Charter members directory, roster toolbar, payments; Board audit log, tasks; Ledger transactions, reconcile, budgets                                                                                                            | Table with toolbar (search, filters), right-aligned tabular numbers, row actions, phone layout |
| **Form dialogs**           | Charter (add member, record membership, pricing rules, tier editor, attributes), Board (save as template), Ledger (restore archive)                                                                                             | Dialog with labelled fields, inline errors, footer actions; full-width sheet on phones         |
| **Wizards**                | Charter setup `flow-wizard` / `step-frame`, Ledger onboarding                                                                                                                                                                   | Step frame with progress                                                                       |
| **Dashboards / cards**     | Ledger `DashboardCards`, `CashChart`; Charter `org-overview`, reports                                                                                                                                                           | Stat cards, one chart style, chart colours from tokens                                         |
| **Tabs workspace**         | Board meeting page, Charter org page (`org-nav`)                                                                                                                                                                                | Tabs that scroll horizontally on phones                                                        |
| **Legal / document pages** | `LegalPage` / `LegalDocument` in all three; Board minutes and packets (print/PDF)                                                                                                                                               | Long-form prose style and print styles                                                         |
| **Toasts**                 | Sonner in all three                                                                                                                                                                                                             | Themed through tokens                                                                          |
| **Marketing site**         | Ledger `WebsiteShell`, landing pages in all three                                                                                                                                                                               | Landing layout (hosted mode removes app landings; the hub keeps one)                           |

## 4. Money and dates today

|                 | Charter                                                             | Board                                                                 | Ledger                                                                   |
| --------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Money           | `Intl.NumberFormat("en-US", {style:"currency"})`, some `toFixed(2)` | —                                                                     | `formatCents()` → `$1,234.56`, `-$1,234.56`, `+$` with `sign` (107 uses) |
| Dates           | `toLocaleDateString()` (browser locale)                             | `toLocaleDateString()`, `"en-CA"` (ISO-like), `Intl.DateTimeFormat()` | `toLocaleString()`, `dateStyle: "medium"`, time-zone aware               |
| Tabular figures | 3 files                                                             | 2 files                                                               | 5 files (`.tnum`)                                                        |

Dates vary with the browser's locale and differ between apps. The proposal fixes one money format
and one date format for the suite ([README](README.md#common-to-every-direction)).

## 5. Accessibility notes

- Charter's 24 hard-coded colour classes bypass dark mode and contrast tokens.
- Focus rings come from shadcn defaults (`ring`) in all three; hand-rolled Ledger buttons lack `focus-visible` styles.
- Phone navigation differs per app (nav strip vs. sidebar only); the shared drawer fixes that.
