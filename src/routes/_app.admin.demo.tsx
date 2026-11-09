import { createFileRoute } from "@tanstack/react-router";
import { DemoScreen } from "@/screens/demo";

export const Route = createFileRoute("/_app/admin/demo")({
  head: () => ({
    meta: [{ title: "Demo organizations · OpenAppHub" }, { name: "robots", content: "noindex" }],
  }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  return <DemoScreen user={ctx.user} hub={ctx.hub} />;
}
