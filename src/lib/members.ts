// Server functions for the members and account screens. Each acts as the
// signed-in user (cookie session); only the email/deletion step uses the
// service role (SHARED-SPEC §7.2).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { InviteResult } from "./members-core";

const inviteInput = z.object({
  orgId: z.string().uuid(),
  email: z.string().min(3).max(254),
  role: z.enum(["admin", "member", "viewer"]),
  namedRoleId: z.string().uuid().nullable().optional(),
  appRoles: z
    .object({
      charter: z.enum(["admin", "member", "viewer"]).optional(),
      board: z.enum(["admin", "member", "viewer"]).optional(),
      ledger: z.enum(["admin", "member", "viewer"]).optional(),
    })
    .optional(),
});

export const sendInvitation = createServerFn({ method: "POST" })
  .validator(inviteInput)
  .handler(async ({ data }): Promise<InviteResult | { error: string }> => {
    const [{ getSupabaseServerClient }, { getServiceClient }, core, { getRequest }] =
      await Promise.all([
        import("./supabase.server"),
        import("./admin.server"),
        import("./members-core"),
        import("@tanstack/react-start/server"),
      ]);
    const userClient = getSupabaseServerClient();
    if (!userClient) return { error: "This site isn't connected to its database." };
    const { data: auth } = await userClient.auth.getUser();
    if (!auth.user) return { error: "You need to be signed in." };
    const origin = new URL(getRequest().url).origin;
    try {
      return await core.inviteMember({
        userClient,
        adminClient: getServiceClient(),
        ...data,
        origin,
      });
    } catch (e) {
      if (e instanceof core.FriendlyError) return { error: e.message };
      throw e;
    }
  });

export const deleteMyAccount = createServerFn({ method: "POST" })
  .validator(z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }))
  .handler(async ({ data }): Promise<{ ok: true } | { error: string }> => {
    const [{ getSupabaseServerClient }, { getServiceClient }, core] = await Promise.all([
      import("./supabase.server"),
      import("./admin.server"),
      import("./members-core"),
    ]);
    const userClient = getSupabaseServerClient();
    if (!userClient) return { error: "This site isn't connected to its database." };
    try {
      await core.deleteAccount({
        userClient,
        adminClient: getServiceClient(),
        reauthToken: data.token,
      });
      await userClient.auth.signOut();
      return { ok: true };
    } catch (e) {
      if (e instanceof core.FriendlyError) return { error: e.message };
      throw e;
    }
  });
