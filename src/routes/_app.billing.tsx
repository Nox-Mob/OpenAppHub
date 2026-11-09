import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useCallback } from "react";
import { billingConfigured, openBillingPortal, startCheckout } from "@/lib/billing";
import { BillingScreen, useRefreshAfterCheckout } from "@/screens/billing";

export const Route = createFileRoute("/_app/billing")({
  validateSearch: (s: Record<string, unknown>): { checkout?: "done" | "cancelled" } =>
    s["checkout"] === "done" || s["checkout"] === "cancelled" ? { checkout: s["checkout"] } : {},
  loader: () => billingConfigured(),
  head: () => ({ meta: [{ title: "Billing · OpenAppHub" }] }),
  component: Page,
});

function Page() {
  const ctx = Route.useRouteContext();
  const { checkout } = Route.useSearch();
  const config = Route.useLoaderData();
  const router = useRouter();
  const refresh = useCallback(() => void router.invalidate(), [router]);
  useRefreshAfterCheckout(checkout === "done", refresh);
  return (
    <BillingScreen
      user={ctx.user}
      hub={ctx.hub}
      checkoutConfigured={config.checkout}
      checkoutResult={checkout}
      actions={{ checkout: startCheckout, portal: openBillingPortal }}
    />
  );
}
