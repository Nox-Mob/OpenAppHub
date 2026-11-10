// Billing server functions (SHARED-SPEC §6.2). Each checks the caller's own
// session first; the service role is used only inside billing-core.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const checkoutInput = z.object({
  orgId: z.string().uuid(),
  plan: z.enum(["starter", "suite", "plus"]),
  interval: z.enum(["month", "year"]),
  app: z.enum(["charter", "board", "ledger"]).optional(),
});

async function context() {
  const [{ getSupabaseServerClient }, { getServiceClient }, core, { getRequest }] =
    await Promise.all([
      import("./supabase.server"),
      import("./admin.server"),
      import("./billing-core"),
      import("@tanstack/react-start/server"),
    ]);
  return {
    userClient: getSupabaseServerClient(),
    service: getServiceClient(),
    core,
    config: core.stripeConfigFromEnv(process.env),
    origin: new URL(getRequest().url).origin,
  };
}

export const startCheckout = createServerFn({ method: "POST" })
  .validator(checkoutInput)
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    const c = await context();
    if (!c.userClient) return { error: "This site isn't connected to its database." };
    try {
      return await c.core.createCheckout({ ...c, userClient: c.userClient, ...data });
    } catch (e) {
      if (e instanceof c.core.BillingError) return { error: e.message };
      throw e;
    }
  });

export const openBillingPortal = createServerFn({ method: "POST" })
  .validator(z.object({ orgId: z.string().uuid() }))
  .handler(async ({ data }): Promise<{ url: string } | { error: string }> => {
    const c = await context();
    if (!c.userClient) return { error: "This site isn't connected to its database." };
    try {
      return await c.core.createPortal({ ...c, userClient: c.userClient, orgId: data.orgId });
    } catch (e) {
      if (e instanceof c.core.BillingError) return { error: e.message };
      throw e;
    }
  });

/** Whether checkout can work on this server, and the plans' prices from Stripe. */
export const billingConfigured = createServerFn({ method: "GET" }).handler(async () => {
  const [core, { planAmounts }] = await Promise.all([
    import("./billing-core"),
    import("./stripe/core"),
  ]);
  const secret = process.env["STRIPE_SECRET_KEY"] || null;
  const prices = await core.fetchPlanPrices({ secret });
  const amounts = planAmounts(prices);
  return {
    checkout:
      !!secret && !!process.env["SUPABASE_SERVICE_ROLE_KEY"] && Object.keys(amounts).length > 0,
    prices: amounts,
  };
});

/** The plans' prices for the public landing page (amounts only, no ids). */
export const planPrices = createServerFn({ method: "GET" }).handler(async () => {
  const [core, { planAmounts }] = await Promise.all([
    import("./billing-core"),
    import("./stripe/core"),
  ]);
  return planAmounts(
    await core.fetchPlanPrices({ secret: process.env["STRIPE_SECRET_KEY"] || null }),
  );
});
