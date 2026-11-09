import { createFileRoute } from "@tanstack/react-router";
import { daysLeft, hasAppAccess } from "@shared/supabase/billing";
import { suiteUrls } from "@shared/supabase/hosted";
import { Landing } from "@/components/landing/Landing";
import { HubShell, NoOrganization, PageHeader } from "@/components/hub/HubShell";
import { SiteFooter, SiteHeader } from "@/components/site";
import { Button } from "@/components/ui/button";
import { APPS } from "@/config/apps";
import { getHubContext, type HubContext } from "@/lib/orgs";
import { ROLE_LABEL, canManage } from "@/lib/roles";
export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "OpenAppHub · Members, meetings and money for nonprofits" },
      {
        name: "description",
        content:
          "Open-source apps for associations, boards and nonprofits: members and dues (OpenCharterApp), board meetings and minutes (OpenBoardApp) and the books (OpenLedgerApp). One account for every app.",
      },
      { property: "og:title", content: "OpenAppHub" },
      {
        property: "og:description",
        content:
          "Run your members, meetings and money in one place. Open source, hosted or self-hosted.",
      },
      { property: "og:type", content: "website" },
    ],
  }),
  loader: ({ context }) => (context.user ? getHubContext() : null),
  component: HomePage,
});

function HomePage() {
  const { user } = Route.useRouteContext();
  const hub = Route.useLoaderData();
  if (!user || !hub) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader signedIn={false} />
        <Landing />
        <SiteFooter />
      </div>
    );
  }
  return (
    <HubShell user={user} hub={hub}>
      <Dashboard name={user.name ?? user.email ?? "there"} hub={hub} />
    </HubShell>
  );
}

// Suite dashboard (AGENTS step 15): each app with an Open link and its access
// state from get_org_billing (nothing shown when billing is off).
function accessLabel(
  hub: HubContext,
  app: (typeof APPS)[number]["id"],
): { text: string; tone: string } | null {
  const b = hub.billing;
  if (!b) return null;
  if (!hasAppAccess(b, app))
    return { text: "Read-only", tone: "bg-destructive/12 text-destructive" };
  if (b.status === "trialing") {
    const d = daysLeft(b.trial_ends_at);
    return {
      text: d === null ? "Free trial" : `Free trial · ${d} ${d === 1 ? "day" : "days"} left`,
      tone: "bg-info/12 text-info",
    };
  }
  return { text: "In your plan", tone: "bg-success/12 text-success" };
}

function Dashboard({ name, hub }: { name: string; hub: HubContext }) {
  const org = hub.orgs.find((o) => o.id === hub.currentOrgId);
  const urls = suiteUrls();
  return (
    <>
      <PageHeader
        title={`Welcome, ${name}`}
        description={
          org ? `${org.name} · ${ROLE_LABEL[org.role]}` : "Let's get your organization set up."
        }
      />
      {!org ? (
        <NoOrganization />
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your apps</h2>
          <ul className="grid gap-4 md:grid-cols-3">
            {APPS.map((app) => {
              const url = urls[app.id];
              const access = accessLabel(hub, app.id);
              return (
                <li
                  key={app.id}
                  data-app={app.id}
                  className="flex flex-col rounded-lg border bg-card p-5 shadow-sm"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="inline-flex items-center gap-2 font-semibold">
                      <span className="grid size-7 place-items-center rounded-md bg-app-accent text-xs font-bold text-app-accent-foreground">
                        {app.short[0]}
                      </span>
                      {app.name}
                    </p>
                    {access ? (
                      <span
                        className={`rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${access.tone}`}
                      >
                        {access.text}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{app.tagline}</p>
                  {url ? (
                    <Button asChild variant="outline" size="sm" className="mt-4 self-start">
                      <a href={url}>Open {app.short}</a>
                    </Button>
                  ) : (
                    <p className="mt-4 text-xs text-muted-foreground">Coming to OpenAppHub soon.</p>
                  )}
                </li>
              );
            })}
          </ul>
          <h2 className="mt-8 mb-3 text-sm font-semibold text-muted-foreground">
            Your organization
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/members">{canManage(hub.role) ? "Members and invitations" : "Members"}</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/settings">Organization settings</a>
            </Button>
            {canManage(hub.role) ? (
              <Button asChild variant="outline" size="sm">
                <a href="/audit">Audit log</a>
              </Button>
            ) : null}
          </div>
        </>
      )}
    </>
  );
}
