import { createFileRoute } from "@tanstack/react-router";
import { AccountScreen } from "@/screens/account";

export const Route = createFileRoute("/_app/account")({
  head: () => ({ meta: [{ title: "Your account · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  return <AccountScreen user={ctx.user} hub={ctx.hub} />;
}
