// The suite demo's accounts (db/seed/0003_suite_demo_v2.sql). They exist on staging only
// and are reset every 12 hours (.github/workflows/demo-reset.yml), so the password is public
// on purpose. The sign-in buttons show only where VITE_DEMO_LOGIN is "true" (staging).
export const DEMO_PASSWORD_PUBLIC = "OpenAppHubDemo2026";

export const DEMO_ACCOUNTS = [
  {
    email: "demo@demo.openapphub.org",
    label: "Demo account",
    description: "Riverside Community Association: a neighbourhood association, in every app.",
  },
  {
    email: "national@demo.openapphub.org",
    label: "National demo",
    description:
      "Northstar Veterans League: a national with four posts, in every app; Post 7 runs its own board.",
  },
  {
    email: "test@demo.openapphub.org",
    label: "Test account",
    description: "Signed in, no organization and no data: try things as a new customer.",
  },
] as const;

export function demoLoginEnabled(): boolean {
  return import.meta.env.VITE_DEMO_LOGIN === "true";
}
