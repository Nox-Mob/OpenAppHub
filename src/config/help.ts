// Docs pages linked from the hub (AGENTS step 22, SHARED-SPEC §12.3). Every
// path must exist on docs.openapphub.org (the docs repo's link check covers the
// pages; keep anchors in step with their headings).
import type { HelpMap } from "@shared/docs";

export const HELP = {
  signIn: "hub/accounts/signing-in/",
  gettingStarted: "hub/start/getting-started/",
  members: "hub/accounts/invitations/",
  orgSettings: "hub/accounts/organizations-and-roles/",
  ownership: "hub/accounts/organizations-and-roles/#transferring-ownership",
  account: "hub/accounts/account-settings/",
  audit: "hub/accounts/audit-log/",
  // The plans page replaces this once prices are confirmed.
  billing: "hub/hosting/hosted-vs-self-hosted/",
  export: "hub/data/ownership-and-export/",
  cookies: "hub/data/cookies/",
  troubleshooting: "hub/help/troubleshooting/",
} satisfies HelpMap;

export type HelpKey = keyof typeof HELP;
