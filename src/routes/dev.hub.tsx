import { createFileRoute, notFound } from "@tanstack/react-router";
import { HubShell } from "@/components/hub/HubShell";
import type { HubContext } from "@/lib/orgs";
import type { OrgRole } from "@shared/supabase/org";
import { AccountScreen } from "@/screens/account";
import { AuditScreen } from "@/screens/audit";
import { BillingScreen } from "@/screens/billing";
import { DashboardScreen } from "@/screens/dashboard";
import { DemoScreen } from "@/screens/demo";
import { MembersScreen } from "@/screens/members";
import { SettingsScreen } from "@/screens/settings";
import { WELCOME_STEPS, WelcomeScreen, type WelcomeStep } from "@/screens/welcome";

// Development-only preview of the signed-in hub screens with sample data, for
// review and browser tests (data calls are answered by the test). 404 in
// production and staging builds.
//   /dev/hub?screen=dashboard|welcome|billing|members|settings|account|audit|demo&role=owner|admin|member|viewer
//   &step=organization|region|team|apps (welcome)  &billing=trialing|expired|active|past_due|canceling&configured=1  &orgs=0 (no organization yet)
const ORG = "11111111-1111-4111-8111-111111111111";

export const Route = createFileRoute("/dev/hub")({
  validateSearch: (s: Record<string, unknown>) => ({
    screen: typeof s["screen"] === "string" ? s["screen"] : "members",
    role: (["owner", "admin", "member", "viewer"].includes(String(s["role"]))
      ? s["role"]
      : "owner") as OrgRole,
    step: ((WELCOME_STEPS as readonly string[]).includes(String(s["step"]))
      ? s["step"]
      : "organization") as WelcomeStep,
    orgs: s["orgs"] === "0" || s["orgs"] === 0 ? 0 : 2,
    billing: typeof s["billing"] === "string" ? s["billing"] : "",
    configured: s["configured"] === true || s["configured"] === "1" || s["configured"] === 1,
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: Preview,
});

function Preview() {
  const { screen, role, step, orgs, billing, configured } = Route.useSearch();
  const user = {
    id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    email: "mara@example.org",
    name: "Mara Rossi",
  };
  const hub: HubContext = {
    orgs: [
      { id: ORG, name: "Riverside Community Association", slug: "riverside", role },
      {
        id: "22222222-2222-4222-8222-222222222222",
        name: "Lakeside Rowing Club",
        slug: "lakeside",
        role: "viewer",
      },
    ],
    currentOrgId: ORG,
    role,
    billing: null,
    demoTools: true,
    prefs: { timeZone: "America/Toronto", currency: "CAD" },
  };
  const DAY = 86_400_000;
  const sample: Record<string, HubContext["billing"]> = {
    trialing: {
      plan_id: null,
      status: "trialing",
      apps: ["charter", "board", "ledger"],
      trial_ends_at: new Date(Date.now() + 12 * DAY).toISOString(),
      current_period_end: null,
      cancel_at_period_end: false,
    },
    expired: {
      plan_id: null,
      status: "expired",
      apps: ["charter", "board", "ledger"],
      trial_ends_at: new Date(Date.now() - DAY).toISOString(),
      current_period_end: null,
      cancel_at_period_end: false,
    },
    active: {
      plan_id: "starter",
      status: "active",
      apps: ["board"],
      trial_ends_at: null,
      current_period_end: "2026-12-09T12:00:00Z",
      cancel_at_period_end: false,
    },
    past_due: {
      plan_id: "suite",
      status: "past_due",
      apps: ["charter", "board", "ledger"],
      trial_ends_at: null,
      current_period_end: "2026-12-09T12:00:00Z",
      cancel_at_period_end: false,
    },
    canceling: {
      plan_id: "suite",
      status: "active",
      apps: ["charter", "board", "ledger"],
      trial_ends_at: null,
      current_period_end: "2026-12-09T12:00:00Z",
      cancel_at_period_end: true,
    },
  };
  if (billing && sample[billing]) hub.billing = sample[billing];
  if (orgs === 0) Object.assign(hub, { orgs: [], currentOrgId: null, role: null });
  const props = { user, hub };
  const fakeInvite = (async ({ data }: { data: { email: string } }) =>
    data.email.startsWith("existing")
      ? { link: "http://localhost:3000/invite/0123456789abcdef", email: "existing" as const }
      : { link: "http://localhost:3000/invite/fedcba9876543210", email: "sent" as const }) as never;
  return (
    <HubShell user={user} hub={hub}>
      {screen === "dashboard" ? <DashboardScreen {...props} /> : null}
      {screen === "billing" ? (
        <BillingScreen
          {...props}
          checkoutConfigured={configured}
          actions={{
            checkout: (async () => ({ url: "/dev/hub?screen=billing&checkout=1" })) as never,
            portal: (async () => ({ url: "/dev/hub?screen=billing&portal=1" })) as never,
          }}
        />
      ) : null}
      {screen === "welcome" ? <WelcomeScreen {...props} step={step} invite={fakeInvite} /> : null}
      {screen === "settings" ? <SettingsScreen {...props} /> : null}
      {screen === "account" ? <AccountScreen {...props} /> : null}
      {screen === "audit" ? <AuditScreen {...props} /> : null}
      {screen === "demo" ? <DemoScreen {...props} /> : null}
      {screen === "members" ? <MembersScreen {...props} invite={fakeInvite} /> : null}
    </HubShell>
  );
}
