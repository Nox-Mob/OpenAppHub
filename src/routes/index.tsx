import { createFileRoute, useRouter } from "@tanstack/react-router";
import { docsUrl } from "@shared/docs";
import { suiteUrls } from "@shared/supabase/hosted";
import { AppShell } from "@shared/ui/AppShell";
import { Button } from "@/components/ui/button";
import { Landing } from "@/components/landing/Landing";
import { SiteFooter, SiteHeader } from "@/components/site";
import { APPS } from "@/config/apps";
import { signOut } from "@/lib/auth-client";
import { getOrgContext } from "@/lib/orgs";
import { RouterLink } from "@/lib/router-link";

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
  loader: ({ context }) => (context.user ? getOrgContext() : null),
  component: HomePage,
});

function HomePage() {
  const { user } = Route.useRouteContext();
  const orgContext = Route.useLoaderData();
  const router = useRouter();
  if (!user) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader signedIn={false} />
        <Landing />
        <SiteFooter />
      </div>
    );
  }
  return (
    <AppShell
      app="hub"
      nav={[{ label: "Dashboard", href: "/", current: true, icon: <DashboardIcon /> }]}
      user={{ name: user.name, email: user.email }}
      orgs={orgContext?.orgs ?? []}
      currentOrgId={orgContext?.currentOrgId ?? null}
      onSelectOrg={() => void router.invalidate()}
      helpHref={docsUrl("hub/")}
      onSignOut={() => void signOut()}
      LinkComponent={RouterLink}
    >
      <SignedIn name={user.name ?? user.email ?? "there"} />
    </AppShell>
  );
}

function DashboardIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path d="M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z" />
    </svg>
  );
}

// Placeholder until the suite dashboard (AGENTS step 15).
function SignedIn({ name }: { name: string }) {
  const urls = suiteUrls();
  return (
    <>
      <h1 className="text-2xl font-semibold tracking-tight">Welcome, {name}</h1>
      <p className="mt-2 text-muted-foreground">
        You're signed in. Organizations, members and billing are coming next.
      </p>
      <ul className="mt-10 grid gap-4 sm:grid-cols-3">
        {APPS.map((app) => {
          const url = urls[app.id];
          return (
            <li key={app.id} data-app={app.id} className="rounded-lg border bg-card p-5 shadow-sm">
              <p className="inline-flex items-center gap-2 font-semibold">
                <span className="grid size-6 place-items-center rounded-md bg-app-accent text-xs font-bold text-app-accent-foreground">
                  {app.short[0]}
                </span>
                {app.name}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">{app.tagline}</p>
              {url ? (
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <a href={url}>Open</a>
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </>
  );
}
