import { createFileRoute } from "@tanstack/react-router";
import { AuditScreen } from "@/screens/audit";

export const Route = createFileRoute("/_app/audit")({
  head: () => ({ meta: [{ title: "Audit log · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  return <AuditScreen user={ctx.user} hub={ctx.hub} />;
}
