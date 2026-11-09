import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { HubShell } from "@/components/hub/HubShell";
import { getHubContext } from "@/lib/orgs";

// Signed-in pages: redirect to sign-in (coming back here) when signed out,
// and load the organization context once for every page below.
export const Route = createFileRoute("/_app")({
  beforeLoad: async ({ context, location }) => {
    if (!context.user) throw redirect({ to: "/login", search: { next: location.href } });
    return { user: context.user, hub: await getHubContext() };
  },
  component: AppLayout,
});

function AppLayout() {
  const { user, hub } = Route.useRouteContext();
  return (
    <HubShell user={user} hub={hub}>
      <Outlet />
    </HubShell>
  );
}
