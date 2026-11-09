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

/** Whether checkout can work on this server (prices and key configured). */
export const billingConfigured = createServerFn({ method: "GET" }).handler(async () => {
  const { parsePriceMap } = await import("./stripe/core");
  return {
    checkout:
      !!process.env["STRIPE_SECRET_KEY"] &&
      !!process.env["SUPABASE_SERVICE_ROLE_KEY"] &&
      !!parsePriceMap(process.env["STRIPE_PRICE_MAP"]),
  };
});
