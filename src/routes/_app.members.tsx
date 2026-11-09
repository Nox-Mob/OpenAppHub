import { createFileRoute } from "@tanstack/react-router";
import { MembersScreen } from "@/screens/members";

export const Route = createFileRoute("/_app/members")({
  head: () => ({ meta: [{ title: "Members · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  return <MembersScreen user={ctx.user} hub={ctx.hub} />;
}
