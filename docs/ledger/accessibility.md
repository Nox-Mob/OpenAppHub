# Accessibility notes

These notes say how well OpenLedgerApp works for people who use a keyboard, a screen reader, or other tools. The last full check was for v0.0.6, on 2026-10-09.

## What we checked

- **Automatic scan.** We ran axe-core on every page, in both light and dark mode. It found no problems (v0.0.5).
- **Keyboard only.** From the dashboard, the Tab key moves in this order: **Skip to content**, the organization switcher, each link in the side menu from top to bottom, then **Terms** and **Privacy**. Every button and field shows a clear outline when it has focus.
- **Forms.** Every field has a label. The two-step sign-in code field tells phones it's a one-time code, so they can fill it in for you.
- **Two-step sign-in (2026-11-14).** The shared code screen (`TwoStepGate`) has a labeled code box that brings up the number keypad on phones, and screen readers read its errors out loud.

## Still to do

A person needs to do a full screen reader check with VoiceOver (Mac) or NVDA (Windows) of these screens:

1. signing in, including the two-step code;
2. adding a new transaction;
3. importing a bank file;
4. reconciling against a bank statement.
