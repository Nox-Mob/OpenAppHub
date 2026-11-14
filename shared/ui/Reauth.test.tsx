// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// The background sign-in client: records what it was asked to do.
const temp = {
  signInWithPassword: vi.fn(),
  challengeAndVerify: vi.fn(),
  rpc: vi.fn(),
  signOut: vi.fn(async () => ({ error: null })),
};
vi.mock("../supabase/client", () => ({
  createReauthClient: () => ({
    auth: {
      signInWithPassword: temp.signInWithPassword,
      signOut: temp.signOut,
      mfa: { challengeAndVerify: temp.challengeAndVerify },
    },
    schema: () => ({ rpc: temp.rpc }),
  }),
}));

import { ReauthDialog, needsReauth } from "./Reauth";

function mainClient(opts: { hasPassword: boolean; factor: boolean }) {
  const rpc = vi.fn(async () => ({ data: "b".repeat(64), error: null }));
  const challengeAndVerify = vi.fn(async () => ({ error: null }));
  const c = {
    auth: {
      getUser: async () => ({
        data: {
          user: {
            email: "ann@example.org",
            identities: opts.hasPassword ? [{ provider: "email" }] : [{ provider: "google" }],
          },
        },
      }),
      mfa: {
        listFactors: async () => ({
          data: { totp: opts.factor ? [{ id: "f1", status: "verified" }] : [] },
        }),
        challengeAndVerify,
      },
    },
    schema: () => ({ rpc }),
  } as unknown as SupabaseClient;
  return { c, rpc, challengeAndVerify };
}

beforeEach(() => {
  temp.signInWithPassword.mockReset().mockResolvedValue({ error: null });
  temp.challengeAndVerify.mockReset().mockResolvedValue({ error: null });
  temp.rpc.mockReset().mockResolvedValue({ data: "a".repeat(64), error: null });
  temp.signOut.mockClear();
});

describe("ReauthDialog", () => {
  it("checks the password with a background sign-in and hands over the pass", async () => {
    const { c } = mainClient({ hasPassword: true, factor: false });
    const onConfirmed = vi.fn();
    render(
      <ReauthDialog
        client={c}
        action="delete_organization"
        open
        description="Delete it."
        onConfirmed={onConfirmed}
        onClose={() => {}}
      />,
    );
    fireEvent.change(await screen.findByLabelText("Your password"), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("a".repeat(64)));
    expect(temp.signInWithPassword).toHaveBeenCalledWith({
      email: "ann@example.org",
      password: "pw",
    });
    expect(temp.rpc).toHaveBeenCalledWith("begin_reauth", { p_action: "delete_organization" });
    // The background session ends straight away.
    expect(temp.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  it("asks for the authenticator code too when the account has one", async () => {
    const { c } = mainClient({ hasPassword: true, factor: true });
    const onConfirmed = vi.fn();
    render(
      <ReauthDialog
        client={c}
        action="transfer_ownership"
        open
        description="Hand it over."
        onConfirmed={onConfirmed}
        onClose={() => {}}
      />,
    );
    fireEvent.change(await screen.findByLabelText("Your password"), { target: { value: "pw" } });
    const confirm = screen.getByRole("button", { name: "Confirm" }) as HTMLButtonElement;
    expect(confirm.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/authenticator app/), { target: { value: "123456" } });
    fireEvent.click(confirm);
    await waitFor(() => expect(onConfirmed).toHaveBeenCalled());
    expect(temp.challengeAndVerify).toHaveBeenCalledWith({ factorId: "f1", code: "123456" });
  });

  it("says so when the password is wrong, and makes no pass", async () => {
    temp.signInWithPassword.mockResolvedValue({ error: { message: "Invalid login credentials" } });
    const { c } = mainClient({ hasPassword: true, factor: false });
    const onConfirmed = vi.fn();
    render(
      <ReauthDialog
        client={c}
        action="delete_account"
        open
        description="Delete your account."
        onConfirmed={onConfirmed}
        onClose={() => {}}
      />,
    );
    fireEvent.change(await screen.findByLabelText("Your password"), { target: { value: "nope" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(await screen.findByText("That password isn't right.")).toBeTruthy();
    expect(temp.rpc).not.toHaveBeenCalled();
    expect(onConfirmed).not.toHaveBeenCalled();
  });

  it("emails a code to people who sign in with Google", async () => {
    const { c, rpc } = mainClient({ hasPassword: false, factor: false });
    const sendCode = vi.fn(async () => null);
    const onConfirmed = vi.fn();
    render(
      <ReauthDialog
        client={c}
        action="delete_account"
        open
        description="Delete your account."
        sendCode={sendCode}
        onConfirmed={onConfirmed}
        onClose={() => {}}
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Email me a code" }));
    await waitFor(() => expect(sendCode).toHaveBeenCalledWith("delete_account"));
    fireEvent.change(await screen.findByLabelText(/we emailed/), { target: { value: "654321" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    await waitFor(() => expect(onConfirmed).toHaveBeenCalledWith("b".repeat(64)));
    expect(rpc).toHaveBeenCalledWith("begin_reauth", {
      p_action: "delete_account",
      p_code: "654321",
    });
    expect(temp.signInWithPassword).not.toHaveBeenCalled();
  });

  it("recognizes the database's confirm-it's-you errors", () => {
    expect(needsReauth({ hint: "reauthenticate", message: "x" })).toBe(true);
    expect(needsReauth({ message: "For your safety, confirm it's you first." })).toBe(true);
    expect(needsReauth({ message: "Only the owner can delete this organization." })).toBe(false);
  });
});
