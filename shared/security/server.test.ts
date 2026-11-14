import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recoverTwoStep, sendReauthCode, type SecurityContext } from "./server";

function setup(opts: { passed: boolean; admin?: boolean }) {
  const calls: string[] = [];
  const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
    calls.push(`rpc:${name}:${JSON.stringify(args)}`);
    if (name === "use_recovery_code" || name === "use_recovery_link")
      return { data: opts.passed, error: null };
    return { data: "backup_code", error: null };
  });
  const userClient = {
    schema: () => ({ rpc }),
    auth: {
      getUser: async () => ({ data: { user: { id: "u1" } } }),
      getSession: async () => ({ data: { session: { access_token: "tok" } } }),
    },
  } as unknown as SupabaseClient;
  const adminClient = {
    auth: {
      admin: {
        mfa: {
          listFactors: vi.fn(async () => {
            calls.push("admin:list");
            return { data: { factors: [{ id: "f1" }] }, error: null };
          }),
          deleteFactor: vi.fn(async ({ id }: { id: string }) => {
            calls.push(`admin:delete:${id}`);
            return { error: null };
          }),
        },
        signOut: vi.fn(async (_t: string, scope: string) => {
          calls.push(`admin:signOut:${scope}`);
          return { error: null };
        }),
      },
    },
  } as unknown as SupabaseClient;
  const sendNow = vi.fn(async () => {
    calls.push("sendNow");
  });
  const ctx: SecurityContext = {
    userClient,
    adminClient: opts.admin === false ? null : adminClient,
    sendNow,
    app: "ledger",
  };
  return { ctx, calls };
}

describe("recoverTwoStep", () => {
  it("removes the authenticator only after the database accepts the code, then signs out other sessions", async () => {
    const { ctx, calls } = setup({ passed: true });
    expect(await recoverTwoStep(ctx, { code: "ABCDE-FGHJK" })).toEqual({ ok: true });
    expect(calls).toEqual([
      'rpc:use_recovery_code:{"p_code":"ABCDE-FGHJK"}',
      "admin:list",
      "admin:delete:f1",
      'rpc:finish_two_step_recovery:{"p_app":"ledger"}',
      "admin:signOut:others",
      "sendNow",
    ]);
  });

  it("touches nothing when the code is wrong", async () => {
    const { ctx, calls } = setup({ passed: false });
    const res = await recoverTwoStep(ctx, { code: "WRONG-CODEX" });
    expect("error" in res && res.error).toMatch(/didn't work/);
    expect(calls.some((c) => c.startsWith("admin:"))).toBe(false);
  });

  it("says plainly when the server has no service-role key", async () => {
    const { ctx, calls } = setup({ passed: true, admin: false });
    const res = await recoverTwoStep(ctx, { token: "a".repeat(64) });
    expect("error" in res && res.error).toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
    expect(calls).toHaveLength(0);
  });
});

describe("sendReauthCode", () => {
  it("tells the database which app is asking, and sends the email straight away", async () => {
    const { ctx, calls } = setup({ passed: true });
    expect(await sendReauthCode(ctx, "delete_account")).toEqual({ ok: true });
    expect(calls).toEqual([
      'rpc:send_reauth_code:{"p_action":"delete_account","p_app":"ledger"}',
      "sendNow",
    ]);
  });
});
