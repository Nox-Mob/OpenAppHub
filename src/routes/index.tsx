import { createFileRoute } from "@tanstack/react-router";
import { Landing } from "@/components/landing/Landing";
import { HubShell } from "@/components/hub/HubShell";
import { SiteFooter, SiteHeader } from "@/components/site";
import { planPrices } from "@/lib/billing";
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
  loader: async ({ context }) => {
    const hub = context.user ? await getHubContext() : null;
    return { hub, prices: hub ? {} : await planPrices() };
  },
  component: HomePage,
});

function HomePage() {
  const { user } = Route.useRouteContext();
  const { hub, prices } = Route.useLoaderData();
  if (!user || !hub) {
    return (
      <div className="flex min-h-screen flex-col">
        <SiteHeader signedIn={false} />
        <Landing prices={prices} />
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
