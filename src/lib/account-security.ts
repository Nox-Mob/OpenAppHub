// OpenAppHub's server functions for account security (core 0019), over the shared steps in
// shared/security/server.ts. Each acts as the signed-in person through their session cookie.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SecurityContext, SecurityResult } from "@shared/security/server";

const reauthAction = z.enum([
  "delete_organization",
  "transfer_ownership",
  "delete_account",
  "recovery_settings",
]);

async function context(): Promise<SecurityContext | null> {
  const [{ getSupabaseServerClient }, { getServiceClient }] = await Promise.all([
    import("./supabase.server"),
    import("./admin.server"),
  ]);
  const userClient = getSupabaseServerClient();
  if (!userClient) return null;
  return {
    userClient,
    adminClient: getServiceClient(),
    app: "hub",
    // Codes and links can't wait for the 5-minute sender. Never throws.
    sendNow: async () => {
      try {
        const { runHubEmail } = await import("./email.server");
        await runHubEmail(process.env as Record<string, string | undefined>);
      } catch {
        // The scheduled sender picks it up instead.
      }
    },
  };
}

const NO_DB: SecurityResult = { error: "This site isn't connected to its database." };

export const sendReauthCode = createServerFn({ method: "POST" })
  .validator(z.object({ action: reauthAction }))
  .handler(async ({ data }): Promise<SecurityResult> => {
    const ctx = await context();
    if (!ctx) return NO_DB;
    const s = await import("@shared/security/server");
    return s.sendReauthCode(ctx, data.action);
  });

export const saveRecoveryEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().max(254).nullable(),
      token: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  )
  .handler(async ({ data }): Promise<SecurityResult> => {
    const ctx = await context();
    if (!ctx) return NO_DB;
    const s = await import("@shared/security/server");
    return s.saveRecoveryEmail(ctx, data.email, data.token);
  });

export const sendRecoveryLink = createServerFn({ method: "POST" }).handler(
  async (): Promise<SecurityResult> => {
    const ctx = await context();
    if (!ctx) return NO_DB;
    const s = await import("@shared/security/server");
    return s.sendRecoveryLink(ctx);
  },
);

export const recoverTwoStep = createServerFn({ method: "POST" })
  .validator(
    z.union([
      z.object({ code: z.string().trim().min(8).max(20) }),
      z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }),
    ]),
  )
  .handler(async ({ data }): Promise<SecurityResult> => {
    const ctx = await context();
    if (!ctx) return NO_DB;
    const s = await import("@shared/security/server");
    return s.recoverTwoStep(ctx, data);
  });
