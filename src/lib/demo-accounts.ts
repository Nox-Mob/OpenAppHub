// The suite demo's two accounts (db/seed/0002_suite_demo.sql). They exist on staging only
// and are reset every 12 hours (.github/workflows/demo-reset.yml), so the password is public
// on purpose. The sign-in buttons show only where VITE_DEMO_LOGIN is "true" (staging).
export const DEMO_PASSWORD_PUBLIC = "OpenAppHubDemo2026";

export const DEMO_ACCOUNTS = [
  {
    email: "demo@demo.openapphub.org",
    label: "Demo account",
    description: "Riverside Community Association, with three months of history in every app.",
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
