# Screens and devices review

The screen-size and accessibility review of OpenAppHub, OpenCharterApp, OpenBoardApp and OpenLedgerApp
(2026-11-14, owner request: "Target iPhones, iPads, and common Android devices. Also check on 720p and
1080p monitors. What works well in some instances doesn't work well in others.").

## In short

- Every page of every app was opened at nine screen sizes, from a 360px Android phone to a 1080p
  monitor, and checked for three things: the page running off the side of the screen, links and
  buttons too small to tap, and the automatic accessibility checks (axe, WCAG 2.2 AA).
- The main problems were a top bar that ran off the screen on small phones and the iPad mini, drop-downs
  and fields with no name in OpenBoardApp, wide rows in OpenLedgerApp and OpenCharterApp, and small tap
  targets everywhere. All are fixed. What's left is listed under [Left as is](#left-as-is).
- To run it again, see [Run it again](#run-it-again).

## Screen sizes

| Name                 | Size (CSS pixels) | Stands for                                  |
| -------------------- | ----------------- | ------------------------------------------- |
| `iphone-se`          | 375 × 667         | iPhone SE, the smallest iPhone still in use |
| `iphone-15`          | 393 × 852         | iPhone 15, 15 Pro, 16                       |
| `iphone-15-pro-max`  | 430 × 932         | iPhone Plus and Pro Max                     |
| `galaxy-s8`          | 360 × 740         | Small Android phones (Galaxy S8 to S23)     |
| `pixel-7`            | 412 × 915         | Pixel and most larger Android phones        |
| `ipad-mini`          | 768 × 1024        | iPad mini, any iPad in portrait             |
| `ipad-air-landscape` | 1180 × 820        | iPad Air or iPad in landscape               |
| `720p`               | 1280 × 720        | Small laptops and 720p monitors             |
| `1080p`              | 1920 × 1080       | 1080p monitors                              |

Phones and iPads are checked as touch screens. Axe runs at `iphone-15` and `1080p`.

## What was checked

1. **Sideways scrolling.** The page must not be wider than the screen. Tables and other wide parts may
   scroll inside their own box, and that box must take keyboard focus so it can be scrolled with the
   arrow keys.
2. **Tap targets.** On touch screens every link and control that isn't part of a sentence must be at
   least 24 × 24 pixels (WCAG 2.2, 2.5.8).
3. **Axe.** WCAG 2.0, 2.1 and 2.2 A and AA rules: names for buttons and fields, valid ARIA, contrast,
   focusable scroll areas and so on.

Pages: all 17 hub screens (through the hub's `/dev/hub` preview), 15 OpenCharterApp pages (dashboard,
organizations, account and every organization section), 12 OpenBoardApp pages and 19 OpenLedgerApp
pages, signed in as the demo owner on staging.

## Found and fixed

| Where                                    | Problem                                                                                                                                                                       | Fix                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Every app's top bar (shared `AppShell`)  | At 360px it was 8px too wide; on the iPad mini, 3px. The menu button was squeezed to 16px wide.                                                                               | The menu, help, notification and account buttons keep their size; only the organization name shrinks (`Dropdown` `className`, `OrgSwitcher` `min-w-0`).    |
| Every app (shared `tailwind.css`)        | Text links, buttons, switches and 13px tick boxes under 24px tall on phones; tick boxes in a list too close together on a computer too.                                       | On touch screens, links, buttons and selects are at least 24px tall and tick boxes 24px. Everywhere, tick boxes are 18px and their row at least 28px tall. |
| Cookie settings (shared `CookieConsent`) | The cookie tables scroll sideways but couldn't be reached with the keyboard.                                                                                                  | The scroll box takes focus and has a name.                                                                                                                 |
| Hub landing page                         | At 360px the app sections were 14px too wide.                                                                                                                                 | `min-w-0` on the grid columns.                                                                                                                             |
| Hub workflow designer                    | A drop place sat inside the list of steps, where only steps may be (axe critical).                                                                                            | The first drop place sits before the list.                                                                                                                 |
| OpenBoardApp, 23 fields and drop-downs   | A visible label that wasn't tied to its field, so screen readers read no name (axe critical).                                                                                 | Each field has a name. Rows in a list say which row ("Role for Jordan Lee", "Status of Order chairs").                                                     |
| OpenBoardApp action items                | The **My tasks / All** tabs pointed at nothing (axe critical).                                                                                                                | Each tab now holds its list.                                                                                                                               |
| OpenBoardApp documents                   | **Upload new version** used a hidden file field: it couldn't be reached with the keyboard.                                                                                    | The field is visually hidden but focusable, and the label shows a focus ring.                                                                              |
| OpenBoardApp committees                  | The delete button was squeezed to 18px; **Remove** was 16px tall and didn't say who.                                                                                          | Fixed sizes; the names say which committee or person.                                                                                                      |
| OpenCharterApp organization page         | **View as member** ran 51–121px off the right side on every phone.                                                                                                            | The title row wraps.                                                                                                                                       |
| OpenCharterApp reports                   | Wide tables couldn't be scrolled with the keyboard.                                                                                                                           | `Table` takes a `scrollLabel`; the three report tables use it.                                                                                             |
| OpenLedgerApp new transaction            | The four kind buttons (Money in, Money out, Transfer, Advanced) ran 42–97px off the side; the advanced lines were 500px wide; the delete-line button had no name and no size. | The buttons wrap and say which one is chosen (`aria-pressed`); the lines scroll in their own box; the delete button is named "Remove line 2".              |
| OpenLedgerApp history                    | The two filters ran 152px off the side at 375px; the table was cut off instead of scrolling.                                                                                  | The filters wrap; the table scrolls in a focusable box.                                                                                                    |
| OpenLedgerApp reports                    | The From and To dates ran 11px off the side at 375px.                                                                                                                         | The row wraps.                                                                                                                                             |
| OpenLedgerApp transactions               | The void button was 16 × 16 with only a tooltip for a name.                                                                                                                   | It is named and at least 32 × 32.                                                                                                                          |

## Left as is

- **Radix drop-downs** keep a 1 × 1 hidden native `<select>` for forms. It is hidden from screen readers
  and never tapped, so the tap-size check lists it but it isn't a problem.
- **Links inside a sentence** keep their text size. WCAG 2.5.8 doesn't cover them.
- **Skip to content** is 1 × 1 until it gets keyboard focus, then full size.
- **The hub designer canvas** needs a mouse or touch to drag steps; every step can also be moved with
  its **Move up** and **Move down** buttons, so it works with a keyboard.
- The automatic checks can't judge everything. Reading order, sensible focus order in dialogs, and
  screen-reader wording were checked by hand on the pages changed in security round 3 (Confirm it's
  you, two-step sign-in, backup codes, recovery email), not on every page.

## Run it again

The script is in [`../tools/screens/`](../tools/screens/). It needs Playwright with Chromium and
axe-core:

```bash
cd docs/tools/screens && npm i --no-save axe-core
```

Then, for the apps on staging (signs in as the public demo owner):

```bash
node docs/tools/screens/audit.js docs/tools/screens/staging-board.json /tmp/screens-board
```

Each run prints one line for every page and screen size with a problem, and saves a screenshot of each
page at each size, with every result in `results.json`. For the hub, start its dev server and point a
targets file at `http://127.0.0.1:4321/dev/hub?screen=<name>`.
