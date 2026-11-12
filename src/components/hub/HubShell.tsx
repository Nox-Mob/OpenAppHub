// The hub's signed-in frame: the shared AppShell with the hub's menu.
import { useRouter, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { docsUrl } from "@shared/docs";
import { AppShell, type NavItem } from "@shared/ui/AppShell";
import type { SessionUser } from "@/lib/session";
import type { HubContext } from "@/lib/orgs";
import { signOut } from "@/lib/auth-client";
import { canManage } from "@/lib/roles";
import { RouterLink } from "@/lib/router-link";

const icon = (d: string) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d={d} />
  </svg>
);
const ICONS = {
  dashboard: icon("M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z"),
  members: icon(
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8",
  ),
  settings: icon(
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 14H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 10 3.1V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.9 1.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0 1.2 2.9H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z",
  ),
  automations: icon("M13 2 3 14h9l-1 8 10-12h-9l1-8Z"),
  audit: icon("M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h6"),
  billing: icon("M2 5h20v14H2zM2 10h20M6 15h4"),
  demo: icon("M12 2 2 7l10 5 10-5-10-5ZM2 17l10 5 10-5M2 12l10 5 10-5"),
};

export function HubShell({
  user,
  hub,
  children,
}: {
  user: SessionUser;
  hub: HubContext;
  children: ReactNode;
}) {
  const router = useRouter();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const item = (label: string, href: string, i: ReactNode): NavItem => ({
    label,
    href,
    icon: i,
    current: href === "/" ? path === "/" : path.startsWith(href),
  });
  const nav: NavItem[] = [item("Dashboard", "/", ICONS.dashboard)];
  if (hub.currentOrgId) {
    nav.push(item("Members", "/members", ICONS.members));
    nav.push(item("Automations", "/automations", ICONS.automations));
    nav.push(item("Settings", "/settings", ICONS.settings));
    if (canManage(hub.role)) nav.push(item("Audit log", "/audit", ICONS.audit));
    if (hub.billing) nav.push(item("Billing", "/billing", ICONS.billing));
  }
  if (hub.demoTools) nav.push(item("Demo organizations", "/admin/demo", ICONS.demo));
  return (
    <AppShell
      app="hub"
      nav={nav}
      user={{ name: user.name, email: user.email }}
      orgs={hub.orgs}
      currentOrgId={hub.currentOrgId}
      onSelectOrg={() => void router.invalidate()}
      orgCreateHref="/orgs/new"
      orgManageHref="/settings"
      billing={hub.billing}
      canManageBilling={canManage(hub.role)}
      billingHref="/billing"
      helpHref={docsUrl("hub/")}
      accountHref="/account"
      onSignOut={() => void signOut()}
      LinkComponent={RouterLink}
    >
      {children}
    </AppShell>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Panel({
  title,
  description,
  children,
  tone,
  id,
}: {
  id?: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  tone?: "danger";
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-20 rounded-lg border bg-card p-5 shadow-sm ${tone === "danger" ? "border-destructive/40" : ""}`}
      aria-label={title}
    >
      <h2 className={`text-base font-semibold ${tone === "danger" ? "text-destructive" : ""}`}>
        {title}
      </h2>
      {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function NoOrganization() {
  return (
    <Panel
      title="Set up your organization"
      description="Name your association, board or nonprofit, choose its time zone and currency, and invite the people who run it with you. It takes about two minutes."
    >
      <a
        href="/welcome"
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground"
      >
        Get started
      </a>
      <p className="mt-4 text-sm text-muted-foreground">
        Were you invited to someone else's organization? Open the invitation link they emailed you.
      </p>
    </Panel>
  );
}
