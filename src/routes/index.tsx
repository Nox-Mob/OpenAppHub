import { createFileRoute } from "@tanstack/react-router";
import { suiteUrls } from "@shared/supabase/hosted";
import { Button } from "@/components/ui/button";
import { Landing } from "@/components/landing/Landing";
import { SiteFooter, SiteHeader } from "@/components/site";
import { APPS } from "@/config/apps";

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
  component: HomePage,
});

function HomePage() {
  const { user } = Route.useRouteContext();
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader signedIn={!!user} />
      {user ? <SignedIn name={user.name ?? user.email ?? "there"} /> : <Landing />}
      <SiteFooter />
    </div>
  );
}

// Placeholder until the suite dashboard (AGENTS step 15).
function SignedIn({ name }: { name: string }) {
  const urls = suiteUrls();
  return (
    <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-12 sm:px-6">
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
    </main>
  );
}
