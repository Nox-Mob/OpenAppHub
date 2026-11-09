import { createFileRoute } from "@tanstack/react-router";

// Stripe webhook (SHARED-SPEC §6.2): https://openapphub.org/api/stripe/webhook.
// Verifies the signature, skips events already seen, and writes billing.* with
// the service role. Logs the event id and type only.
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      GET: () => new Response("Method not allowed", { status: 405, headers: { allow: "POST" } }),
      POST: async ({ request }) => {
        const [{ getServiceClient }, core] = await Promise.all([
          import("@/lib/admin.server"),
          import("@/lib/billing-core"),
        ]);
        const result = await core.handleWebhook({
          payload: await request.text(),
          signature: request.headers.get("stripe-signature"),
          service: getServiceClient(),
          config: core.stripeConfigFromEnv(process.env),
        });
        return new Response(result.body, {
          status: result.status,
          headers: { "content-type": "text/plain; charset=utf-8" },
        });
      },
    },
  },
});
