import { createFileRoute } from "@tanstack/react-router";
import { WELCOME_STEPS, WelcomeScreen, type WelcomeStep } from "@/screens/welcome";

export const Route = createFileRoute("/_app/welcome")({
  validateSearch: (s: Record<string, unknown>): { step: WelcomeStep } => ({
    step: (WELCOME_STEPS as readonly string[]).includes(String(s["step"]))
      ? (s["step"] as WelcomeStep)
      : "organization",
  }),
  head: () => ({ meta: [{ title: "Get set up · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  const { step } = Route.useSearch();
  return <WelcomeScreen user={ctx.user} hub={ctx.hub} step={step} />;
}
