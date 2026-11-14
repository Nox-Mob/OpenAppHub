// Server functions for account security (core 0019). Each acts as the signed-in person through
// their session cookie. The service role is used only to send the security email straight away
// (codes and links can't wait for the 5-minute sender) and to remove an authenticator during a
// recovery the database has just approved (SHARED-SPEC §7.2).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

type Result = { ok: true } | { error: string };

const reauthAction = z.enum([
  "delete_organization",
  "transfer_ownership",
  "delete_account",
  "recovery_settings",
]);

async function context() {
  const [{ getSupabaseServerClient }, { getServiceClient }] = await Promise.all([
    import("./supabase.server"),
    import("./admin.server"),
  ]);
  return { userClient: getSupabaseServerClient(), adminClient: getServiceClient() };
}

/** Sends what's waiting in the outbox now, so a code arrives in seconds. Never throws. */
async function sendNow(): Promise<void> {
  try {
    const { runHubEmail } = await import("./email.server");
    await runHubEmail(process.env as Record<string, string | undefined>);
  } catch {
    // The 5-minute sender picks it up instead.
  }
}

function friendly(message: string | undefined): string {
  return message || "That didn't work. Try again.";
}

export const sendReauthCode = createServerFn({ method: "POST" })
  .validator(z.object({ action: reauthAction }))
  .handler(async ({ data }): Promise<Result> => {
    const { userClient } = await context();
    if (!userClient) return { error: "This site isn't connected to its database." };
    const { error } = await userClient.rpc("send_reauth_code", { p_action: data.action });
    if (error) return { error: friendly(error.message) };
    await sendNow();
    return { ok: true };
  });

export const saveRecoveryEmail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      email: z.string().trim().max(254).nullable(),
      token: z.string().regex(/^[0-9a-f]{64}$/),
    }),
  )
  .handler(async ({ data }): Promise<Result> => {
    const { userClient } = await context();
    if (!userClient) return { error: "This site isn't connected to its database." };
    const { error } = await userClient.rpc("set_recovery_email", {
      p_email: data.email || null,
      p_reauth: data.token,
    });
    if (error) return { error: friendly(error.message) };
    await sendNow();
    return { ok: true };
  });

export const sendRecoveryLink = createServerFn({ method: "POST" }).handler(
  async (): Promise<Result> => {
    const { userClient } = await context();
    if (!userClient) return { error: "This site isn't connected to its database." };
    const { error } = await userClient.rpc("send_recovery_link");
    if (error) return { error: friendly(error.message) };
    await sendNow();
    return { ok: true };
  },
);

/**
 * Turn off two-step sign-in with a backup code or a recovery link. The database checks the code
 * or link first (as the signed-in person); only then does the service role remove the
 * authenticator, and the database records it and emails the person.
 */
export const recoverTwoStep = createServerFn({ method: "POST" })
  .validator(
    z.union([
      z.object({ code: z.string().trim().min(8).max(20) }),
      z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) }),
    ]),
  )
  .handler(async ({ data }): Promise<Result> => {
    const { userClient, adminClient } = await context();
    if (!userClient) return { error: "This site isn't connected to its database." };
    if (!adminClient) return { error: "Recovery isn't available on this server." };
    const { data: auth } = await userClient.auth.getUser();
    const user = auth.user;
    if (!user) return { error: "Sign in with your password first." };

    const { data: passed, error } =
      "code" in data
        ? await userClient.rpc("use_recovery_code", { p_code: data.code })
        : await userClient.rpc("use_recovery_link", { p_token: data.token });
    if (error) return { error: friendly(error.message) };
    if (passed !== true)
      return {
        error:
          "code" in data
            ? "That backup code didn't work. Check it and try again (each code works once)."
            : "That link has expired or was already used. Ask for a new one.",
      };

    const { data: factors, error: listError } = await adminClient.auth.admin.mfa.listFactors({
      userId: user.id,
    });
    if (listError) return { error: "Two-step sign-in couldn't be turned off. Try again later." };
    for (const f of factors?.factors ?? []) {
      const { error: delError } = await adminClient.auth.admin.mfa.deleteFactor({
        id: f.id,
        userId: user.id,
      });
      if (delError) return { error: "Two-step sign-in couldn't be turned off. Try again later." };
    }
    const { error: finishError } = await userClient.rpc("finish_two_step_recovery");
    if (finishError) return { error: friendly(finishError.message) };
    // End every other session on the account: if someone else was signed in, they're out.
    const { data: session } = await userClient.auth.getSession();
    if (session.session?.access_token)
      await adminClient.auth.admin
        .signOut(session.session.access_token, "others")
        .catch(() => undefined);
    await sendNow();
    return { ok: true };
  });
