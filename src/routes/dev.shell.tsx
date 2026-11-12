import { createFileRoute, notFound } from "@tanstack/react-router";
import { docsUrl } from "@shared/docs";
import type { OrgBilling } from "@shared/supabase/billing";
import type { AppId } from "@shared/supabase/hosted";
import { AppShell } from "@shared/ui/AppShell";
import { EmailPreferencesPanel, EmailServerPanel } from "@shared/ui/EmailSettings";
import { HelpLink } from "@shared/ui/HelpLink";

// Development-only preview of the shared AppShell for screenshots and review:
//   /dev/shell?app=board&billing=trial|ending|readonly|pastdue|none
//   /dev/shell?app=board&screen=email   the self-hosted email settings (S-16)
// Returns 404 in production and staging builds.
const ORGS = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Riverside Community Association",
    role: "owner",
  },
  { id: "22222222-2222-4222-8222-222222222222", name: "Lakeside Rowing Club", role: "viewer" },
];

const DAY = 86_400_000;
function billingFor(kind: string): OrgBilling | null {
  const base: OrgBilling = {
    plan_id: null,
    status: "trialing",
    apps: [],
    trial_ends_at: new Date(Date.now() + 12 * DAY).toISOString(),
    current_period_end: null,
    cancel_at_period_end: false,
  };
  switch (kind) {
    case "trial":
      return base;
    case "ending":
      return { ...base, trial_ends_at: new Date(Date.now() + 2 * DAY).toISOString() };
    case "readonly":
      return {
        ...base,
        status: "expired",
        trial_ends_at: new Date(Date.now() - DAY).toISOString(),
      };
    case "pastdue":
      return {
        ...base,
        status: "past_due",
        plan_id: "suite",
        apps: ["charter", "board", "ledger"],
      };
    default:
      return null;
  }
}

const NAV: Record<AppId, string[]> = {
  hub: ["Dashboard", "Members", "Billing"],
  charter: ["Overview", "Members", "Chapters", "Payments", "Reports"],
  board: ["Overview", "Meetings", "Tasks", "Documents", "Members"],
  ledger: ["Dashboard", "Transactions", "Accounts", "Budgets", "Reports"],
};

export const Route = createFileRoute("/dev/shell")({
  validateSearch: (s: Record<string, unknown>) => ({
    app: (["hub", "charter", "board", "ledger"].includes(String(s["app"]))
      ? s["app"]
      : "board") as AppId,
    billing: typeof s["billing"] === "string" ? s["billing"] : "trial",
    screen: s["screen"] === "email" ? "email" : "",
  }),
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({ meta: [{ name: "robots", content: "noindex" }] }),
  component: ShellPreview,
});

function ShellPreview() {
  const { app, billing, screen } = Route.useSearch();
  const nav = NAV[app].map((label, i) => ({
    label,
    href: `#${label.toLowerCase()}`,
    current: i === 1,
  }));
  return (
    <AppShell
      app={app}
      nav={nav}
      navFooter={[{ label: "Settings", href: "#settings" }]}
      user={{ name: "Mara Rossi", email: "mara@example.org" }}
      orgs={ORGS}
      currentOrgId={ORGS[0]!.id}
      orgCreateHref="#create"
      orgManageHref="#settings"
      billing={billingFor(billing)}
      canManageBilling
      billingHref="#billing"
      helpHref={docsUrl(`${app}/`)}
      accountHref="#account"
      onSignOut={() => {}}
    >
      {screen === "email" ? (
        <div className="mx-auto max-w-3xl space-y-6">
          <h1 className="text-2xl font-semibold tracking-tight">Email</h1>
          <EmailPreferencesPanel client={null} />
          <EmailServerPanel
            load={async () => ({
              canEdit: true,
              source: "smtp-settings",
              host: "smtp.fastmail.com",
              port: 587,
              security: "starttls",
              username: "board@riverside.org",
              hasPassword: true,
              fromAddress: "board@riverside.org",
              fromName: "Riverside Board",
              replyTo: "",
              serverReady: true,
            })}
            save={async () => {}}
            test={async () => ({
              ok: true,
              message: "Sent to mara@riverside.org. Check your inbox.",
            })}
          />
        </div>
      ) : null}
      <div className={screen ? "hidden" : "flex flex-wrap items-end justify-between gap-4"}>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{nav[1]?.label}</h1>
          <p className="mt-1 text-sm text-muted-foreground">Shared AppShell preview · {app}</p>
        </div>
        <HelpLink path={`${app}/`}>How this works</HelpLink>
      </div>
      <div className={screen ? "hidden" : "mt-6 grid gap-4 sm:grid-cols-3"}>
        {[1, 2, 3].map((n) => (
          <div key={n} className="h-28 rounded-lg border bg-card shadow-sm" />
        ))}
      </div>
      <div className={screen ? "hidden" : "mt-4 h-72 rounded-lg border bg-card shadow-sm"} />
    </AppShell>
  );
}
