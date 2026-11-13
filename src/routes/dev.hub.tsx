import { createFileRoute, notFound } from "@tanstack/react-router";
import { HubShell } from "@/components/hub/HubShell";
import type { HubContext } from "@/lib/orgs";
import type { OrgRole } from "@shared/supabase/org";
import { AccountScreen } from "@/screens/account";
import { TemplateGallery, WorkflowEditor } from "@/screens/automations";
import { ApprovalView, type Approval } from "@/screens/approval";
import { templateDefinition, type WorkflowTemplate } from "@/lib/templates";
import { useState } from "react";
import { WorkflowDesigner, type TraceEntry } from "@/screens/designer";
import { walk } from "@/lib/designer";
import { FIXTURE_OVERVIEW } from "@/lib/workflow-fixture";
import { AuditScreen } from "@/screens/audit";
import { BillingScreen } from "@/screens/billing";
import { DashboardScreen } from "@/screens/dashboard";
import { DemoScreen } from "@/screens/demo";
import { AppRolesPanel, InvitePanel, MembersScreen, NamedRolesPanel } from "@/screens/members";
import { FIXTURE_MEMBERS, FIXTURE_ROLES } from "@/lib/roles-fixture";
import { SettingsScreen } from "@/screens/settings";
import { WELCOME_STEPS, WelcomeScreen, type WelcomeStep } from "@/screens/welcome";

// Development-only preview of the signed-in hub screens with sample data, for
// review and browser tests (data calls are answered by the test). 404 in
// production and staging builds.
//   /dev/hub?screen=dashboard|welcome|billing|members|roles|settings|account|audit|demo|workflow|designer|templates|approval&role=owner|admin|member|viewer
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
    defaultOrgId: null,
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
          prices={{
            starter: { month: 500, year: 5000 },
            suite: { month: 1000, year: 10000 },
            plus: { month: 2500, year: 25000 },
          }}
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
      {screen === "roles" ? (
        <div className="space-y-6">
          <AppRolesPanel
            orgId={ORG}
            members={FIXTURE_MEMBERS}
            roles={FIXTURE_ROLES}
            canEdit
            onChanged={() => {}}
          />
          <div className="grid gap-6 lg:grid-cols-2">
            <NamedRolesPanel orgId={ORG} roles={FIXTURE_ROLES} canEdit onChanged={() => {}} />
            <InvitePanel orgId={ORG} invite={fakeInvite} namedRoles={FIXTURE_ROLES.namedRoles} />
          </div>
        </div>
      ) : null}
      {screen === "templates" ? <TemplatesPreview /> : null}
      {screen === "approval" ? <ApprovalPreview /> : null}
      {screen === "designer" ? (
        <WorkflowDesigner
          overview={FIXTURE_OVERVIEW}
          workflow={null}
          onSave={async () => null}
          onCancel={() => {}}
          onTest={async (d) => {
            const trace: TraceEntry[] = [];
            walk(d.steps, (s) =>
              trace.push({
                key: s.id,
                id: s.id,
                name: s.name || s.type,
                type: s.type,
                status: "succeeded",
                detail: s.type === "email" ? "Would email 3 people" : "Done",
              }),
            );
            return { status: "succeeded", trace };
          }}
        />
      ) : null}
      {screen === "workflow" ? (
        <WorkflowEditor
          overview={FIXTURE_OVERVIEW}
          workflow={null}
          onSave={async () => null}
          onCancel={() => {}}
        />
      ) : null}
    </HubShell>
  );
}

/** The template gallery, and the designer a template opens in (nothing is saved). */
function TemplatesPreview() {
  const [t, setT] = useState<WorkflowTemplate | null>(null);
  if (t)
    return (
      <WorkflowDesigner
        overview={FIXTURE_OVERVIEW}
        workflow={null}
        initial={templateDefinition(t)}
        initialName={t.name}
        initialDescription={t.description}
        onSave={async () => null}
        onCancel={() => setT(null)}
      />
    );
  return <TemplateGallery o={FIXTURE_OVERVIEW} onUse={setT} />;
}

/** An approval waiting for an answer (nothing is saved: answering just shows it decided). */
function ApprovalPreview() {
  const [a, setA] = useState<Approval>({
    id: "44444444-4444-4444-8444-444444444444",
    org_name: "Riverside Community Association",
    what: "An award submission from Pat Lee",
    details: "Rank PFC. Requested by the post commander.",
    mode: "all",
    outcome: "pending",
    due_at: "2026-11-20T17:00:00Z",
    created_at: "2026-11-13T09:00:00Z",
    decided_at: null,
    workflow: "Award routing",
    can_answer: true,
    responses: [
      { name: "Mara Rossi", decision: "no answer", comment: "" },
      { name: "Dev Patel", decision: "approved", comment: "Eligible" },
    ],
  });
  return (
    <div className="max-w-2xl space-y-6">
      <ApprovalView
        a={a}
        decide={async () => null}
        onDecided={() =>
          setA({
            ...a,
            outcome: "approved",
            can_answer: false,
            responses: a.responses.map((r) =>
              r.decision === "no answer" ? { ...r, decision: "approved" } : r,
            ),
          })
        }
      />
    </div>
  );
}
