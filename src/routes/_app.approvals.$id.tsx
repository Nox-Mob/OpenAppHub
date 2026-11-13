import { createFileRoute } from "@tanstack/react-router";
import { ApprovalScreen } from "@/screens/approval";

export const Route = createFileRoute("/_app/approvals/$id")({
  head: () => ({ meta: [{ title: "Approval · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const { id } = Route.useParams();
  return <ApprovalScreen id={id} />;
}
