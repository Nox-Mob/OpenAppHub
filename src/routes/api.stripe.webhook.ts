import { createFileRoute } from "@tanstack/react-router";

// Stripe webhook (SHARED-SPEC §6.2): https://openapphub.org/api/stripe/webhook.
// Verifies the signature, skips events already seen, and writes billing.* with
// the service role. Logs the event id and type only.
export const Route = createFileRoute("/api/stripe/webhook")({
  server: {
    handlers: {
      GET: () => new Response("Method not allowed", { status: 405, headers: { allow: "POST" } }),
      POST: async ({ request }) => {
        // Turn away junk before loading anything: no signature, or a body far bigger than any
        // Stripe event.
        if (!request.headers.get("stripe-signature"))
          return new Response("missing signature", { status: 400 });
        if (Number(request.headers.get("content-length") ?? 0) > 1_000_000)
          return new Response("too large", { status: 413 });
        const payload = await request.text();
        if (payload.length > 1_000_000) return new Response("too large", { status: 413 });
        const [{ getServiceClient }, core] = await Promise.all([
          import("@/lib/admin.server"),
          import("@/lib/billing-core"),
        ]);
        const result = await core.handleWebhook({
          payload,
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
