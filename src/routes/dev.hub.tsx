import { createFileRoute, notFound } from "@tanstack/react-router";
import { HubShell } from "@/components/hub/HubShell";
import type { HubContext } from "@/lib/orgs";
import type { OrgRole } from "@shared/supabase/org";
import { AccountScreen } from "@/screens/account";
import { AuditScreen } from "@/screens/audit";
import { DemoScreen } from "@/screens/demo";
import { MembersScreen } from "@/screens/members";
import { SettingsScreen } from "@/screens/settings";

// Development-only preview of the signed-in hub screens with sample data, for
// review and browser tests (data calls are answered by the test). 404 in
// production and staging builds.
//   /dev/hub?screen=members|settings|account|audit|demo&role=owner|admin|member|viewer
const ORG = "11111111-1111-4111-8111-111111111111";

export const Route = createFileRoute("/dev/hub")({
  validateSearch: (s: Record<string, unknown>) => ({
    screen: typeof s["screen"] === "string" ? s["screen"] : "members",
    role: (["owner", "admin", "member", "viewer"].includes(String(s["role"]))
      ? s["role"]
      : "owner") as OrgRole,
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: Preview,
});

function Preview() {
  const { screen, role } = Route.useSearch();
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
  const props = { user, hub };
  const fakeInvite = (async ({ data }: { data: { email: string } }) =>
    data.email.startsWith("existing")
      ? { link: "http://localhost:3000/invite/0123456789abcdef", email: "existing" as const }
      : { link: "http://localhost:3000/invite/fedcba9876543210", email: "sent" as const }) as never;
  return (
    <HubShell user={user} hub={hub}>
      {screen === "settings" ? <SettingsScreen {...props} /> : null}
      {screen === "account" ? <AccountScreen {...props} /> : null}
      {screen === "audit" ? <AuditScreen {...props} /> : null}
      {screen === "demo" ? <DemoScreen {...props} /> : null}
      {screen === "members" ? <MembersScreen {...props} invite={fakeInvite} /> : null}
    </HubShell>
  );
}
