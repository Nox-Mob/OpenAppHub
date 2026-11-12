# User testing guide

What to check by hand in the live app. The automated checks already cover the database rules (`db/tests/`), the screens in isolation (`bun run test`), the backend flows with the demo accounts (`bun run test:smoke`) and the main screens in a real browser (`bun run test:e2e`, docs/testing.md). This guide covers what only a person can judge: whether screens make sense, look right, work on a phone, print well, and say the right thing.

The app has a sidebar on the left: the organization switcher at the top (its last entry, "All organizations…", opens the list of your organizations and Create organization), then the organization's menu with icons, and Account and Sign out at the bottom (D-205, D-206). There's no separate dashboard: each organization's Overview is its dashboard. On a phone the menu is a "Section" dropdown and Account and Sign out are below the page. The organization's menu is: Overview, Members or Directory, Board, Reports, Chapters, and Settings. Settings' pages are listed under it only once you click Settings (on a phone, a second "Settings page" dropdown appears; D-188). They are: (General, Setup, Membership levels, Member fields, Chapter fields, Board settings, Roles, Payments, Audit log). Everything that configures the organization is under Settings; the other pages show information or let you do something (D-185). "Where" lines below use those names.

**Accounts.** Use the demo accounts in [demo-data.md](demo-data.md) (shared password there):

| Short name   | Account                                          | Good for                                                                                                     |
| ------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| **National** | `demo-national@opencharter.test` (Nora National) | Admin of Demo National Association, with a lifetime membership there                                         |
| **Chapter**  | `demo-chapter@opencharter.test` (Chris Chapter)  | Admin of Demo Austin Chapter                                                                                 |
| **Member**   | `demo-member@opencharter.test` (Morgan Member)   | A plain member record in Demo Austin, with no membership yet: good for joining, renewing and the member view |

Use a private browser window for a second account at the same time. Test only in the demo orgs (names start with "Demo"). Smoke and end-to-end runs remove what _they_ create (D-150); avoid editing the demo orgs while one is running. Choices that can't be undone (the membership model) belong in a new demo national, not in Demo National.

**Reporting a problem.** Send the section and step number, the account, what you expected, what happened, and a screenshot. Mention the browser and whether it was a phone-sized window.

**Ticking results.** Copy a section into your notes and mark each step ✅ / ❌.

**Already checked by the browser tests** (D-198). GitHub runs these against the live demo on every push to `BoardUpdates` and `main` and daily (`live.yml`), so these steps only need a person when something looks off, or to judge how they look and read:

| Steps                      | What the tests check                                                                                                                                                                                                                                        | Spec                                           |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| §1.2, §1.3                 | A wrong password and an unknown email get the same "Email or password is incorrect."; password reset answers the same whether or not the account exists                                                                                                     | `guide-checks`                                 |
| §1                         | Signed-out visitors are sent to sign in and land back where they were going                                                                                                                                                                                 | `guide-checks`                                 |
| §1.4                       | An invitation link: signed out it asks to sign in, nothing is accepted on opening, another account's accept is refused, a revoked link is unavailable                                                                                                       | `guide-sandbox`                                |
| §1.5, §1.6                 | The account page; privacy and terms links on sign-in, sign-up and the app                                                                                                                                                                                   | `real-use`, `a11y`                             |
| §1.5                       | The default organization opens after signing in; "the list" puts it back                                                                                                                                                                                    | `navigation`                                   |
| §2.1, §2.2, §2.5           | The menu by role; the chapter wizard; creating a national with the model comparison                                                                                                                                                                         | `navigation`, `lifecycle`                      |
| §2b.1, §2b.3, §2b.4, §2b.5 | Only operators are offered a demo org; deleting needs the exact name; a demo chapter can't be deleted on its own                                                                                                                                            | `guide-checks`, `guide-sandbox`                |
| §3.1–3.3                   | A setting locked at the national is read-only at its chapter; a badly formed EIN is refused and nothing is saved; a logo shows at once, and at the chapter                                                                                                  | `guide-sandbox`, `guide-checks`, `guide-admin` |
| §4                         | A role defined at the national is offered at its chapter; the only admin can't be removed                                                                                                                                                                   | `guide-admin`                                  |
| §5                         | A field with 21 choices (the dialog keeps Save reachable); an ordered list used in the member filters; a chapter field locked at the national                                                                                                               | `guide-admin`                                  |
| §6.2, §6.5–6.7             | Adding a level with its price in dollars; suggested levels, linked at 20% less                                                                                                                                                                              | `guide-sandbox`, `levels`                      |
| §6b                        | Settings → Setup shows the setup cards                                                                                                                                                                                                                      | `board-setup`                                  |
| §7.1–7.5                   | Adding a member without an email; recording a membership (Good standing, paid through a year less a day), a renewal from the day after, cancelling; removing from the roster and restoring                                                                  | `guide-sandbox`, `real-use`                    |
| §8.0–8.3, §8.8             | Everyone across chapters; search with the "Showing x of y" count; a saved view surviving a reload; importing a member                                                                                                                                       | `members`, `guide-sandbox`, `real-use`         |
| §9.2                       | The directory shows no email addresses                                                                                                                                                                                                                      | `guide-checks`                                 |
| §10.3                      | Export payments downloads the bookkeeping columns                                                                                                                                                                                                           | `export`                                       |
| §11.1, §11.4               | The join page asks every required question before payment; an application waits for approval, and approving makes them a member                                                                                                                             | `join`, `guide-admin`                          |
| §12b.3                     | A chapter's join page asks someone who isn't a national member to join the national first (step 1 of 2)                                                                                                                                                     | `guide-admin`                                  |
| §13.1, §13.3–13.5          | A recorded payment gets a numbered receipt (`2026-00001` style) with Print; voiding with a reason shows VOID; reissuing links the old receipt to the new one; the receipt footer appears on receipts issued afterwards                                      | `guide-sandbox`, `guide-admin`                 |
| §13b.1–13b.4               | The home-chapter model: picking and changing chapter, the chapter's Members page                                                                                                                                                                            | `lifecycle`                                    |
| §14.0–14.4, §14.8, §14.10  | Members see nothing to configure; adding seats, a required chapter seat shown as vacant with the warning; a bad role email refused; appointing and ending a term with a reason in Past officers; a member whose membership was cancelled can't be appointed | `guide-checks`, `guide-sandbox`, `board-setup` |
| §14a                       | The Share your join page card                                                                                                                                                                                                                               | `real-use`                                     |
| §15.1, §15.4               | The audit log in plain words, each organization seeing only its own                                                                                                                                                                                         | `real-use`, `guide-sandbox`                    |
| §16                        | Every control named, one heading, keyboard sign-in with visible focus                                                                                                                                                                                       | `a11y`                                         |

Still for a person: anything about looks, wording, phones, printing and screen readers; Stripe and real payments (§10, §11.2–§12c, which need a deployed site or a Stripe account); declining an application with a refund (§11, needs a deployed site); paying two-level dues end to end (§12b.4–12b.6); and how logos, receipts, roles and fields look. Approving, two-level dues' first step, receipt reissue and footers, logos, roles and fields are checked for working (above), and still deserve a person's eye.

---

## 1. Sign-in, password reset, invitations

**Where:** `/auth`, the sign-in link on the home page. 0. The browser tab shows the OpenCharterApp logo (a teal tile with a white "C" and a light dot; the same mark as in the sidebar). The home page (top left), the sign-in page, the sidebar and the privacy and terms pages name the app "OpenCharterApp", never "OpenCharter" (D-216).

1. Sign in as **Chapter**. Expect your default organization (Account → Default organization), or your only one, or else the list of your organizations.
2. Sign out, then sign in with a wrong password. Expect "Email or password is incorrect." Nothing should say whether the email exists.
3. "Forgot password?" → enter an email → "Send reset link". Expect a neutral message, whether or not the account exists.
4. As **Chapter**: Demo Austin Chapter → Members → "Invite someone" → "Create invite link". Copy the link and open it in a private window. Expect the invitation page; accepting needs a button press.

5. **Account** (sidebar → Account), as **Member**: your name, email and organizations are shown. **Default organization**: pick an organization, sign out and back in, and expect it to open; pick "The list of my organizations" to put it back. Change your name and save: it shows on your member record at Austin. "Change email" sends a confirmation link to the new address (use a mailbox you control; don't change the demo accounts' emails); the page says so until it's opened. Change the password twice to put it back (`OpenCharterDemo!2026`). A Google sign-in shows no password section. **Google sign-in** (D-212): "Continue with Google" on the sign-in page goes to Google and back to the app signed in, through the app's own Supabase project.
6. **Privacy policy and terms**: the sign-in page, the landing page and the app's footer link to them; "Create an account" says "By creating an account you agree to…", and the join page says "By joining you agree to…". Both pages show the effective date, last-updated date and "Operating organization: OpenAppHub", numbered sections (22 in the terms, 19 in the privacy policy, with 3.1–3.5 under "Information We Collect"), and no placeholder banner. Both end with legal@openapphub.org and support@openapphub.org as email links (the privacy policy also gives the legal address under "Privacy Rights and Requests"); nothing is left in [brackets].

**Also try:** opening the same invite link a second time after accepting (it should say it's used).

## 2. Organizations and chapters

**Where:** the list of your organizations (switcher → All organizations…), org page, Chapters.

1. As **National**, open Demo National Association. Expect a menu on the left (a "Section" dropdown on a phone): Overview, Members, Board, Reports, Chapters, Settings (no Directory: admins have Members), and under Settings: General, Setup, Membership levels, Member fields, Chapter fields, Roles, Payments, Audit log. As **Chapter** (Austin) expect the same without Chapters, with Reports showing only Austin. As **Member** expect only Overview, Directory and Board (and Chapters at a national).
2. Chapters → "Add chapter". The wizard asks, step by step:
   - **Name and type.** Try a region too: it skips the chapter steps.
   - **Chapter details:** the national's chapter fields, e.g. Charter date. Required ones are checked.
   - **Chapter admin:** an email to invite as admin, or blank.
   - **Required officers:** only if the national has required seats for chapters (Board or Board setup). An email per seat, or blank.

   After "Create", you see the invitation links to copy, and "Open …" goes to the new chapter. Expect it in the Chapters list and the org switcher; its Board shows the required seats as **Vacant**.

3. Open an officer's invitation link in a private window and accept it. Then appoint that person on the chapter's Board (they need a membership in good standing first, unless the rule is off).
4. Open the new chapter. Expect "← Demo National Association" at the top.
5. **Creating a national** (switcher → All organizations… → Create organization, type National; tick "demo" if you're an operator): step 2 is **How membership works**. Both models are shown side by side, each with joining, dues, chapters, changing chapter, "A good fit if" and an example. "Create" is refused until you pick one or "Decide later". Pick one and check Settings → General says it's chosen and can't be changed; with "Decide later", Settings → General still offers the choice. A standalone organization has no such step.

**Also try:** a chapter name with accents or an apostrophe, and check the suggested web address (slug); a bad email (it stops before anything is created); the same email for the admin and an officer (one invitation).

## 2b. Demo organizations (for QA)

**Where:** switcher → All organizations… → Create organization; the new org's Settings → General.

1. As **National** (a platform operator), create an organization and tick **This is a demo organization**. It shows a **Demo** badge on its page and in the list of your organizations.
2. Run setup from scratch in it: Membership setup, Board setup, add chapters (they're demo too: the wizard says "Demo, like …"), turn on test payments, join, pay.
3. In a private window, sign in as an account that isn't an operator: the demo checkbox doesn't appear when creating an org.
4. As the demo org's admin: Settings → General → **Delete this demo organization**. "Delete for good" stays disabled until you type the exact name. After deleting you land on the list of your organizations and the org and its chapters are gone; the accounts you used still sign in.
5. A production org's Settings never shows the delete section, and a demo chapter's doesn't either (delete from the top).

**Also try:** creating a chapter under a production national: no demo option there.

## 3. Settings, locks, tax profile, logo

**Where:** Settings → General.

1. As **National**, lock a setting (e.g. grace period). As **Chapter**, open Austin → Settings. Expect it read-only with "Locked by a parent organization".
2. Tax profile: enter a legal name and EIN (`12-3456789`) → "Save tax profile". A wrong format should show "EIN must look like 12-3456789".
3. Logo: upload a PNG at the national. Austin shows the national logo unless it uploads its own (and the national allows it).

4. **Wording in the separate model** (Demo National): the dues rules read "Do chapters sell their own memberships?" (No: chapters use your levels and dues / Each chapter may choose / Yes: every chapter sells its own) and "Chapter members also need a membership with you". Board rules (renaming seats, extra seats, officers in good standing) are no longer here; they're on Settings → Board settings.

**Also try:** a large image; an SVG.

## 4. Roles

**Where:** Settings → Roles.

1. As **National**, "Add role" (e.g. "Newsletter editor" with "See member profiles"). As **Chapter**, check that Austin can use it.
2. Assign a role to a member, then remove it. The last admin of the national can't be removed.
3. As **Chapter**, try to create a role with a permission you don't hold. It shouldn't be offered.

## 5. Member and chapter fields

**Where:** Settings → Member fields / Chapter fields.

1. "Add field" with a choice list of 20+ options. Expect the dialog to scroll while the title and Save stay visible.
2. Make an ordered list (e.g. Rank E-1…E-9) and use it later in the member filters ("at least").
3. Lock a chapter field (e.g. Charter date) at the national. As **Chapter**, Austin → Settings → Chapter fields shows it read-only.

## 6. Membership setup and levels

**Where:** Settings → Setup (Membership setup card); Settings → Membership levels.

1. As **National**, open setup and walk through every step. "Review and apply" should show what changes.
2. Membership levels: "Add level" with two terms (1 year, Lifetime). Prices show in dollars.
3. An org with only one level shows it as "Membership" without needing a name.
   - As **National**, Settings → Membership levels opens with **How membership works here**: the model, approval, the grace period and the rules for chapters, matching Membership setup, with links to change them. In a home-chapter national (Test-Demo) it names the at-large chapter and there's no "Suggest to chapters".

4. **Prices by member fields** (a setup step, after the levels): add a rule "Senior rate" for the 1-year term, "Rank is one of E-7, E-8, E-9", price $20.00. Review shows it; apply. Settings → Membership levels shows the rule under that term. Run setup again: the rule is filled in; change the price to $18.00 and apply. There's still one rule, now $18.00.
5. **Suggested levels** (separate-memberships model; Demo National uses it): as **National**, on a level press "Suggest to chapters" (it then says "Stop suggesting").
6. As **Chapter**, Austin → Membership levels: the national's level shows "Suggested for you" and "Start from this level". The dialog explains **Copy it** (your own level, change it freely, later national changes don't affect it) and **Link to it** (follows the national's name, terms and retirement). Choose Link, "A percentage less", 20: "Your prices" previews each term 20% less, kept within the national's price range. "Link this level".
7. The chapter's level says "Linked to Demo National Association's …: 20% less than …" and has Price and "Make it our own", but no Edit. As **National**, change that level's 1-year price: Austin's linked price follows. Retire the national level: Austin's linked level is retired too.
8. As **Chapter**, "Make it our own" (asks to confirm; can't be undone): the level becomes editable and no longer follows the national. Try **Copy** on another suggested level: it is editable at once.

**Also try:** run setup a second time and change one answer. Only that change should be listed. A chapter whose national doesn't allow chapter levels sees no "Start from this level".

## 6b. Setup hub and Board setup

**Where:** Settings → Setup (cards), then each card's button.

1. As **National**, Settings → Setup shows **Membership setup**, **Board setup** and **Connect payments**. "Connect payments" opens Settings → Payments and says "Done" once test payments are on.
2. Board setup → **Officer seats**: tick President and Treasurer; set President to "Every chapter", required, 2 years; add "Chaplain" for the national itself. A third choice "<national> and every chapter" appears; pick it for Secretary and check both the national's and Austin's Board list Secretary.
3. **Officer rules**: turn off "May chapters add their own seats?".
4. **Terms from your by-laws**: for Treasurer, tick "set our own term", 3 years, today, "Bylaws Art. II". Review the summary, then "Apply setup".
5. Board: the seats are there with the right terms. Run Board setup again and apply without changes; nothing new appears in each seat's term history.
6. Run Board setup again and change President from "Every chapter" to "Demo National Association and every chapter", then apply. President now appears on the national's Board too. Changing it back to "itself" is refused, with a clear message, while a chapter has a president.
7. As **Chapter**, Austin → Board setup: there's no seats step (the national manages seats). Set Austin's own term for President with a by-law reference and apply. Austin's Board shows it; Demo Dallas still shows the suggested term.

**Also try:** the browser Back button and a page reload in the middle of a flow (your answers are kept as a draft); a phone-sized window for the seat list.

## 7. Members, payments recorded by hand, standing

**Where:** Members, member details.

1. As **National**, "Add member" without an email. Expect "Contact (no login yet)".
2. Open the member → "Record membership", 1 year, paid by check. Expect the standing to be Good, "Paid through" one year minus a day, and a History entry with the payment.
3. Record a renewal. Expect it to start the day after the current paid-through date.
4. Cancel the membership ("Cancel this membership now?"). History shows it.

5. **Remove from roster** (needs migration 0037): open a member you added → "Remove from roster…", give a reason → "Remove …". They leave the list, their membership shows as cancelled in the history, and any seat they held ends. At the bottom of the Members page, "Show 1 removed from the roster" lists them with **Restore**; restoring brings them back (record a new membership to make them current again). You can't remove yourself or someone with a role given on Settings → Roles. In the home-chapter model, a chapter record can't be removed (move the member from the national); removing the national record takes them off the chapter too.

**Also try:** a historical member with a start date years ago; check the standing (Grace or Lapsed) and "expires in".

## 8. Finding and exporting members

**Where:** Members toolbar. 0. As **National**, the Members page opens on "Everyone in Demo National Association and below": members of Austin and Dallas are listed with an Organization column and their email, including anyone who opted out of the directory. Their rows have "Open" (goes to that chapter's Members page). "Export CSV" works here too (see step 5). Switch to "Only Demo National Association" for roles and Details. As **Chapter** (Austin) only Austin's members are listed and there's no switch. Admins have no Directory item.

1. Search by part of a name or email, with and without accents.
2. Filter by standing, level, a member field, and "Expiring within 30 / 60 / 90 days". Check the "Showing x of y" count.
3. "Save this view", reload, and click the saved view.
4. "Export CSV". Open the file in Excel and Google Sheets: accents, dates and empty cells look right, and there are no formulas. The Audit log shows the export.
5. **Everyone view export** (as **National**, "Everyone in … and below"): the file has an Organization column. Members who opted out of their chapter's directory are left out unless "Include … who opted out" is ticked, and each chapter's own default applies to its rows. The Audit log entry says it covered the organization and the orgs below.
6. **Columns**: "Columns" lists the member fields; tick Rank and Branch. They appear as columns; reload and they're still there (remembered for you in this browser, per organization). Untick to hide.
7. **National standing** (separate model, where the national requires its own membership): as **Chapter**, Austin's Members page has a column named after the national, showing each member's national standing next to the chapter one. In the home-chapter model this column doesn't appear (standing is already the national's).

8. **Import members** (needs migration 0037), as **Chapter** at Austin: "Import members" → "Download a template", fill in three people (one with a level and paid-through date, one with "Lifetime" and no paid-through date, one with only a name), save as CSV and choose it. The columns are matched from the headings (change any that are wrong; Rank and other member fields are offered). "Check the file" lists problems by row number (try a date like 05/01/2020, a level that doesn't exist, the same email twice) and saves nothing. With no problems, "Import 3 members" adds them; open one to see the level, dates and fields. Import the same file again: "3 already here (they'll be updated)", and nobody is duplicated. The Audit log shows the import. In the home-chapter model, import at the national, with a Chapter column; chapters have no Import button.

**Also try:** a member who opted out of the directory. The export leaves them out unless "Include … who opted out" is ticked, if your national allows it.

## 9. Directory and privacy

**Where:** Directory (members only; admins have the Members page instead); Overview → "Show me in the member directory".

1. As **Member**, turn the switch off. Use "View as member" as **Chapter**: the Directory no longer lists them. Out of the preview, the Members page still lists them with "Not in directory".
2. The Directory never shows email addresses, only fields marked "show in directory".

## 10. Payments and test payments

**Where:** Settings → Payments (demo orgs only).

1. As **National**, "Use test payments (demo only)". Expect the "Test mode" badge and a join page link.
2. Read the Stripe connection instructions and the webhook address. Are they clear enough for a treasurer?

3. **Export payments**: pick a date range and "Export CSV". Open it in Excel or Sheets: one row per paid or refunded payment, amounts as numbers, refunds and net, receipt numbers. As **National**, tick "Include every organization below" and check chapters' payments appear. The Audit log shows the export.

**Stripe in test mode** (any org, needs a free Stripe account):

1. In Stripe (test mode): Developers → API keys → create a restricted key with "Checkout Sessions: write" (or use the `sk_test_…` secret key). Developers → Webhooks → add an endpoint at the address shown on the Payments page, with the events listed there; copy its signing secret (`whsec_…`).
2. Paste both on the Payments page. Expect "Stripe (test mode)".
3. Join at the org's join page and pay with Stripe's test card 4242 4242 4242 4242 (any future date, any CVC). Stripe returns you to the app's own address (never "localhost"), and the return page confirms the payment.
4. Try it once with a wrong webhook signing secret: the return page should still confirm the payment, by asking Stripe directly (D-158). Refunds still need the webhook.

## 11. Joining online

**Where:** `/join/demo-national`. Also try it at phone width (the browser's device toolbar, about 390 px wide).

1. Signed out, open the page. Pick a level and term, and sign in as **Member** when asked. "About you" asks every required field, including **Rank**; paying without it is refused ("Rank is required").
2. On the test checkout, try each button in turn: Card declined, Insufficient funds, Cancel. Each should return a clear message, and no membership is created.
3. Then "Card accepted". You come back to the app's own address (not "localhost"). Expect the return page to wait, then confirm. If approval is required, the application is pending.
4. As **National**: Members → Applications → Approve. As **Member**, "Your membership" shows Good standing and the receipt.
5. "Accepted, slow confirmation": the return page should keep waiting politely, then confirm.

**Also try:** "Decline" on a paid application. The member is refunded (test) and the history says so.

## 12. Renewing

**Where:** Overview → Your membership.

1. As **Member** (after joining in §11), "Renew online (…)" and pay with "Card accepted". Paid-through moves forward by one term from the old date, not from today.

## 12b. Two-level dues (national and chapter)

**Where:** Demo National → Membership setup ("Rules for your chapters"), then `/join/demo-austin`.

1. As **National**, run Membership setup. Turn on "Must chapter members also be members of your organization?". Set a chapter price range, e.g. lowest $10, highest $30. Apply.
2. As **Chapter**, Austin → Membership levels: the range is shown. Try a term priced at $50; it's refused with the range.
3. In a private window, open `/join/demo-austin` signed out. It mentions two payments. Sign in as an account that isn't a national member. Expect "Step 1 of 2: Demo National Association dues" and a "Join … first" button.
4. Pay the national dues with "Card accepted". The return page offers "Continue to step 2: chapter dues". Follow it: "Step 2 of 2", then pay the chapter's dues.
5. If the national approves new members, the chapter application waits. As **Chapter**, try to approve it first; it says the national membership isn't active yet. Approve at the national, then at the chapter.
6. Settings → Payments at each org: one payment and one receipt each.

**Also try:** "No chapter dues" (turn off "May chapters create their own membership levels?"): Austin's join page sends people to the national.

## 12c. Pricing rules (price by member fields)

**Where:** Settings → Membership levels → click a term (e.g. "1 year · $50.00").

1. As the admin of the org that owns the level, add a rule: condition "Rank is at least E-5", "they pay" $30. Add another: "Veteran is yes", a 20% discount. Reorder with "Order" if needed. The list reads in plain words, and the term shows "· 2 pricing rules".
2. Open the join page signed out: the term says the price can depend on your answers.
3. Sign in and answer Rank E-5: the pay button shows $30.00. Change to E-2 with Veteran yes: $40.00. With neither: the usual price.
4. Pay with the test card. The payment and the receipt show the rule's price.
5. As a member whose Rank is stored, "Your membership" → "Renew online" shows your price.
6. Retire a rule: it greys out and stops applying.

**Also try:** a chapter rule priced outside the national's range (refused); a rule with no conditions (applies to everyone).

## 13. Receipts

**Where:** Settings → Payments → Receipt column; Your membership → Your receipts; member History.

1. Open a receipt: number (`2026-00001` style), legal name, EIN, payer, items, amount, method, tax wording, footer, logo.
2. "Print": check the print preview. It fits one page and the buttons don't print.
3. As **National**, "Void" with a reason. The receipt shows VOID.
4. "Reissue" (after correcting the tax profile). The old receipt says "Replaced by …" and links to the new one.
5. Settings → General → Receipt footer: set a thank-you text, then record a new payment. The new receipt shows it; old ones don't change.

**Can't test yet:** the tax wording is a placeholder until a CPA or attorney reviews it (R-07). Emailing receipts waits for E-08.

## 13b. National membership with a home chapter

**Where:** creating a national, Settings → General ("How membership works"), the join pages, the Overview, a chapter's Members page.
Use a _new_ demo national for this (§2 step 5, then add two chapters, levels and test payments): the choice can't be undone, so don't try it on Demo National.

1. Choose "National membership with a home chapter" when creating it (or later on Settings → General, which shows the same comparison and asks you to confirm). Settings → General then says it can't be changed; pick one chapter as the at-large chapter (for example an "online chapter").
2. Open a chapter's join page: it sends you to the national's page with that chapter preselected. The national's join page shows "Your chapter" (at-large chapter first, "None for now" last).
3. Join as a member with a chapter. After paying, the national's Overview shows "Your chapter: …" and the chapter's Members page lists you with your national level and standing ("This is the member's national membership" in Details).
4. Change chapter from the Overview. The old chapter no longer lists you; the new one does. If you held a seat in the old chapter, it ended with "changed chapter".
5. Chapters have no **Membership levels** page in this model (members belong to the national), and adding one through the API is refused.
6. **Settings that don't apply are gone** (D-184). At the national, Settings → General has no "How new members of your chapters are accepted", "Chapters may create their own membership levels", "Chapter members also need a membership with you" or chapter dues rules; it still has approval and the grace period for the national's own members. At a chapter, Settings → General has no approval or grace period.
7. **Setup**: at the national, Membership setup's "Rules for your chapters" asks only about chapter logos; at a chapter, Membership setup has no levels or "Joining and renewals" step, and the review says members join the national.
8. The comparison when creating a national names no real organization as an example.

## 14. Board

**Where:** Board (who holds each seat, appointing and ending terms) and Settings → Board settings (seat terms, contact emails, titles, the seats an org defines and the board rules). Nothing on the Board page changes how the board is set up (D-185). 0. As **National** or **Chapter**, the Board page has "Change board settings" (admins only), which opens Settings → Board settings. As **Member**, there's no such button and no Board settings in the menu.

1. As **National**, Settings → Board settings: "Add seat" → President, "Every chapter below…", required, suggested term 2 years. Add a national-only seat too (e.g. Treasurer, linked to a role).
2. As **Chapter**, Austin → Board: President shows **Vacant**, and the warning lists it.
3. Settings → Board settings → President → "Change term": 1 year, today's date, by-law reference "Bylaws Art. IV §2". Expect "Term: 1 year (Bylaws Art. IV §2, since …)" and an entry in "Term history".
4. "Appoint" a member in good standing. The dialog shows when the term ends. Try a lapsed member too; it should be refused with a clear message.
5. Change the term again (2 years). Answer "Apply to current officers?" with OK. The holder's end date moves.
6. Austin → Settings → Board settings → "Rename here": call President "Commander" in Austin. The national's own view still says President.
7. For a seat with a linked role: after appointing, the person appears with that role in Roles. After "End term", the role is gone (unless they also had it by hand).
8. Past officers lists the ended term with the reason.

9. **The national and every chapter**: as **National**, Settings → Board settings → "Add seat" → Vice President, Used by "Demo National Association and every chapter below it". It appears on the national's Board _and_ on Austin's, and each fills its own. Edit the seat and change "Used by" to "Every chapter below…": refused with a clear message while the national has someone in it; after "End term" at the national, it saves and the seat leaves the national's Board.

10. **Contact email**: as **Chapter**, Austin → Settings → Board settings → President → "Contact email". Choose "A role email for this seat", enter `President@DemoAustin.xyz` and save: the seat shows the address there, and the Board page shows "Contact: president@demoaustin.xyz (role email)". Try `not-an-email` (refused). Switch back to "The officer's sign-in email": the Board page then shows the president's own email address (the one they sign in with) as the contact, never just a description. A seat held by someone with no email on record says so; a vacant one says "nobody yet". As **Member**, Austin's Overview → "Board and who to contact" shows the role email for President instead of the president's own email, and the officer's own email for seats without one. Give a vacant seat a role email: it's listed as "Vacant" with that email.

**Also try:** as **National**, turn off "Chapters may rename the board seats you define" under Settings → Board settings → Board rules, then try "Rename here" in Austin.
Also: edit a seat and set "No role" and a suggested term of "No fixed term"; and "Change term" to "No fixed term". Both should save (fixed 2026-11-02).

## 14a. Overview

**Where:** Overview.

1. As **National**: "At a glance" shows Current members, Chapters, Average members per chapter, Lifetime members (with "N other current members · X% lifetime" and a bar), New in the last 30 days, Waiting for approval, Renewals due in 30 days, Revenue this year and Vacant required seats. A person in both the national and a chapter counts once. "See each chapter on the Reports page" opens Reports.
2. As **Chapter**, Austin: the same tiles for Austin only, without Chapters or the average.
   - **Share your join page** (admins, below the tiles): the join page address with Copy and Open. At an org without connected payments it adds "Online joining opens once payments are connected" with a link to Settings → Payments.
3. As **Member**: no numbers. Instead:
   - **Actions needed**: e.g. "Your membership ends on … (in N days)" with Renew, "Complete your profile: …" if a required field the member may edit is empty, "Your term as … ends on …" for a seat ending within 30 days, or "You're all set".
   - **Your profile**: name, email and member fields (no admin-only fields). "Edit" shows only the fields members may change; save and reload.
   - **Your roles and seats**: seats held here with dates, and roles.
   - **Board and who to contact**: the general email from Settings → General (or the national's, marked with its name), then the officers by seat, each with the seat's role email or, if it has none, the officer's own email. Vacant seats appear only if they have a role email.
   - **Your chapter** (home-chapter model, at the national): see §13b.
   - **National membership** (separate model, at a chapter whose national requires its own membership): if the member's national membership is missing or lapsed, "Actions needed" says so with "Join or renew Demo National Association"; if it's waiting for approval, it says that instead.
   - "Your membership" and the directory choice as before.
4. **View as member**: as **National**, click "View as member" next to the org name. The menu shrinks to Overview, Directory, Board (and Chapters), a banner explains it's a preview, and the Overview shows your own member cards. Switch sections; the preview stays on until "Exit member view".

## 14b. Reports

**Where:** Demo National → Reports.

1. **Members:** one row per organization (chapters indented under the national) and a Total row. "Members" counts people with a current membership (good standing or grace), not everyone on the Members page: an administrator without a membership isn't counted. In a home-chapter national, the Total equals the national's own row (each member is also listed in their chapter, and counted once). Creating a chapter doesn't add you to its Members page. The standing bar shows good / grace / lapsed / pending; hovering a segment shows the count and share.
2. **Revenue:** defaults to this year so far. Change the dates. Test payments aren't counted; a partly refunded payment shows the refund and the net amount.
3. **Boards:** required seats with nobody in them are listed per chapter; "Terms past their end" counts officers still serving after their planned end.
4. "Export CSV" on each section: open the files in Excel or Sheets, then check the Audit log shows each export.
5. As **Chapter**, open Austin → Reports: one row, Austin only, described as "Austin, as of today." Opening Demo National's Reports as Chapter isn't possible. As **Member**, there's no Reports item.

**Also try:** dark mode (the standing colors should still read clearly); a phone-sized window (the tables scroll sideways).

## 15. Audit log

**Where:** Settings → Audit log.

1. Each entry reads like "8:53:23 PM, Nora National modified Board settings · President", grouped under the day, newest first. Below it, a small table shows each changed field's Previous and Current value (for example Title: President → Emperor Elect). Rename a seat on Settings → Board settings and check it appears that way. Until migration 0037 is applied, people show as "Someone" and some records as "a seat"; afterwards, names show.
2. One save is one entry: apply Membership setup and the entry says "applied Membership setup" with "Show N more changes in this save". Saving a setup draft doesn't appear.
3. Filter by person and by area; "Show older changes" loads more.
4. Each organization sees only its own log: the national's doesn't show Austin's changes, and Austin's doesn't show the national's.
5. Nothing in the app offers to edit or delete log entries.

---

## 16. Accessibility, phones and large rosters

The end-to-end suite already checks control names, headings, page language and keyboard sign-in (`e2e/a11y.spec.ts`). By hand, before a release:

1. **Keyboard only** (no mouse): sign in, join from a join page through to the payment step, run Membership setup, filter and export on Members, appoint an officer on Board. Focus is always visible, nothing is skipped or trapped, dialogs close with Escape and return focus to the button that opened them.
2. **Contrast**: in light and dark themes, text, badges (standing, "Demo", "Linked to …"), muted helper text and disabled buttons are readable. Use the browser's contrast checker on anything that looks faint.
3. **Zoom and phones**: at 200% zoom and a phone-sized window, every page works without sideways scrolling except wide tables, which scroll inside their card.
4. **Screen reader** (VoiceOver or NVDA): the join page and checkout read in order, form errors are announced, and toasts are read out.
5. **Large rosters**: a national with thousands of members is checked by `bun run test:perf` (docs/testing.md). By hand, the Members page of a chapter with more than 1,000 members (none in the demo data yet) should list all of them.

## Not testable yet

- Every email: invitations, confirmations, receipts and reminders (E-08, the first update after the MVP). Admins copy links for now.
- Local dues for chapters in the home-chapter model, postpaid dues and invoices (E-20).
- Per-org web addresses (E-07), custom domains (E-22) and PayPal (E-21).
- Real money: Stripe works in test mode with an org's own Stripe account (§10); live mode is the same path with live keys.

## Keeping this guide current

Every feature change updates its section here in the same commit, and new features add a section.
