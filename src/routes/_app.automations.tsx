import { createFileRoute } from "@tanstack/react-router";
import { AutomationsScreen } from "@/screens/automations";

export const Route = createFileRoute("/_app/automations")({
  head: () => ({ meta: [{ title: "Automations · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  return <AutomationsScreen user={ctx.user} hub={ctx.hub} />;
}
