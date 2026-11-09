import { createFileRoute } from "@tanstack/react-router";
import { SettingsScreen } from "@/screens/settings";

export const Route = createFileRoute("/_app/settings")({
  head: () => ({ meta: [{ title: "Organization settings · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  return <SettingsScreen user={ctx.user} hub={ctx.hub} />;
}
