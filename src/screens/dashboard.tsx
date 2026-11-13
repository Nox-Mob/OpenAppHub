import type { ScreenProps } from "./types";
import { AppLogo } from "@shared/ui/AppLogo";
import { daysLeft, hasAppAccess } from "@shared/supabase/billing";
import { appOrgUrl } from "@shared/apps";
import { suiteUrls } from "@shared/supabase/hosted";
import { setCurrentOrg } from "@shared/supabase/org";
import { HelpLink } from "@shared/ui/HelpLink";
import { HELP } from "@/config/help";
import { NoOrganization, PageHeader } from "@/components/hub/HubShell";
import { SetupChecklist } from "@/components/hub/SetupChecklist";
import { DashboardPanels, PanelChooser } from "@/components/hub/Dashboard";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { useEffect, useState } from "react";
import { loadDashboardPrefs, type PanelId } from "@/lib/dashboard";
import { Button } from "@/components/ui/button";
import { APPS } from "@/config/apps";
import type { HubContext } from "@/lib/orgs";
import { ROLE_LABEL, canManage } from "@/lib/roles";

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

export function DashboardScreen({ user, hub }: ScreenProps) {
  const name = user.name ?? user.email ?? "there";
  const org = hub.orgs.find((o) => o.id === hub.currentOrgId);
  const urls = suiteUrls();
  const [hidden, setHidden] = useState<PanelId[]>([]);
  const [choosing, setChoosing] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  useEffect(() => {
    const client = getSupabaseBrowserClient();
    if (!client) return;
    let live = true;
    void loadDashboardPrefs(client).then((p) => {
      if (live) setHidden(p.hidden);
    });
    return () => {
      live = false;
    };
  }, []);
  async function choose(next: PanelId[]) {
    setHidden(next);
    const client = getSupabaseBrowserClient();
    if (!client) return;
    const { error } = await client.rpc("hub_set_dashboard_panels", { p_hidden: next });
    setSaveError(error ? error.message : null);
  }
  return (
    <>
      <PageHeader
        title={`Welcome, ${name}`}
        description={
          org
            ? `${org.name}${org.parent ? ` (chapter of ${org.parent.name})` : ""} · ${ROLE_LABEL[org.role]}`
            : "Let's get your organization set up."
        }
        actions={
          org ? (
            <Button
              variant="outline"
              size="sm"
              aria-expanded={choosing}
              onClick={() => setChoosing((c) => !c)}
            >
              {choosing ? "Done" : "Choose panels"}
            </Button>
          ) : undefined
        }
      />
      {!org ? (
        <NoOrganization />
      ) : (
        <>
          {canManage(hub.role) ? <SetupChecklist orgId={org.id} /> : null}
          {choosing ? (
            <div className="mb-6">
              <PanelChooser hidden={hidden} onChange={(h) => void choose(h)} />
              {saveError ? (
                <p role="alert" className="mt-2 text-sm text-destructive">
                  {saveError}
                </p>
              ) : null}
            </div>
          ) : null}
          <DashboardPanels
            orgId={org.id}
            userId={user.id}
            urls={urls}
            hidden={hidden}
            timeZone={hub.prefs.timeZone}
          />
          {!hidden.includes("apps") ? (
            <>
              <h2 className="mb-3 text-sm font-semibold text-muted-foreground">Your apps</h2>
              <ul className="grid gap-4 md:grid-cols-3">
                {/* A chapter's own organization is for its board; membership stays with the national. */}
                {APPS.filter((app) => !org.parent || app.id === "board").map((app) => {
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
                          <AppLogo app={app.id} size={28} />
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
                          <a
                            href={appOrgUrl(app.id, url, org.id)}
                            onClick={() => setCurrentOrg(org.id)}
                          >
                            Open {app.short}
                          </a>
                        </Button>
                      ) : (
                        <p className="mt-4 text-xs text-muted-foreground">
                          Coming to OpenAppHub soon.
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
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
            <Button asChild variant="outline" size="sm">
              <a href="/account">Your account</a>
            </Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2">
            <HelpLink path={HELP.gettingStarted}>Getting started guide</HelpLink>
            <HelpLink path={HELP.export}>Your data and exports</HelpLink>
            <HelpLink path={HELP.troubleshooting}>Troubleshooting</HelpLink>
          </div>
        </>
      )}
    </>
  );
}
