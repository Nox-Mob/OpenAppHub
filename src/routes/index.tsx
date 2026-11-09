import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/landing/Landing";
import { HubShell } from "@/components/hub/HubShell";
import { SiteFooter, SiteHeader } from "@/components/site";
import { getHubContext } from "@/lib/orgs";
import { DashboardScreen } from "@/screens/dashboard";
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
      <DashboardScreen user={user} hub={hub} />
    </HubShell>
  );
}
