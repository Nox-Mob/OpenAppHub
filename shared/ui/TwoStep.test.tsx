// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { OrgTwoStepPanel, TwoStepGate } from "./TwoStep";

function client(levels: { currentLevel: string; nextLevel: string }) {
  return {
    auth: {
      mfa: { getAuthenticatorAssuranceLevel: vi.fn(async () => ({ data: levels, error: null })) },
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    },
  } as unknown as SupabaseClient;
}

describe("TwoStepGate", () => {
  it("shows the app when no code is needed", async () => {
    render(
      <TwoStepGate client={client({ currentLevel: "aal1", nextLevel: "aal1" })}>
        <p>the app</p>
      </TwoStepGate>,
    );
    await waitFor(() => expect(screen.getByText("the app")).toBeTruthy());
  });

  it("asks for the code when the account has two-step sign-in and the session hasn't used it", async () => {
    render(
      <TwoStepGate client={client({ currentLevel: "aal1", nextLevel: "aal2" })}>
        <p>the app</p>
      </TwoStepGate>,
    );
    await waitFor(() => expect(screen.getByText("One more step")).toBeTruthy());
    expect(screen.queryByText("the app")).toBeNull();
    expect(screen.getByLabelText(/6-digit code/)).toBeTruthy();
  });

  it("shows the app once the session used the code", async () => {
    render(
      <TwoStepGate client={client({ currentLevel: "aal2", nextLevel: "aal2" })}>
        <p>the app</p>
      </TwoStepGate>,
    );
    await waitFor(() => expect(screen.getByText("the app")).toBeTruthy());
  });
});

describe("TwoStepGate recovery link", () => {
  it("offers the way back in when a recovery page is given", async () => {
    render(
      <TwoStepGate
        client={client({ currentLevel: "aal1", nextLevel: "aal2" })}
        recoverHref="/recover"
      >
        <p>the app</p>
      </TwoStepGate>,
    );
    const link = await screen.findByText("Can't use your authenticator app?");
    expect(link.getAttribute("href")).toBe("/recover");
  });
});

function orgClient(settings: Record<string, unknown>) {
  const rpc = vi.fn(async (name: string) =>
    name === "org_security_settings"
      ? { data: settings, error: null }
      : { data: null, error: null },
  );
  return { client: { schema: () => ({ rpc }) } as unknown as SupabaseClient, rpc };
}

describe("OrgTwoStepPanel", () => {
  it("shows the three levels with the current one chosen", async () => {
    const { client: c } = orgClient({
      mfa_required: "admins",
      can_change: true,
      admins_without: 0,
      members_without: 3,
    });
    render(<OrgTwoStepPanel client={c} orgId="o1" />);
    const admins = (await screen.findByLabelText(
      /Required for the owner and admins/,
    )) as HTMLInputElement;
    expect(admins.checked).toBe(true);
    expect((screen.getByLabelText(/Required for everyone/) as HTMLInputElement).checked).toBe(
      false,
    );
    expect(screen.getByText(/3 people haven't set it up yet/)).toBeTruthy();
  });

  it("warns before locking out people who haven't set it up, and saves", async () => {
    const { client: c, rpc } = orgClient({
      mfa_required: "off",
      can_change: true,
      admins_without: 1,
      members_without: 2,
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<OrgTwoStepPanel client={c} orgId="o1" />);
    fireEvent.click(await screen.findByLabelText(/Required for everyone/));
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("2 people haven't set up"));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_org_mfa_level", { p_org: "o1", p_level: "everyone" }),
    );
    confirm.mockRestore();
  });

  it("can't be changed by people who aren't the owner or an admin", async () => {
    const { client: c } = orgClient({
      mfa_required: "off",
      can_change: false,
      admins_without: 0,
      members_without: 0,
    });
    render(<OrgTwoStepPanel client={c} orgId="o1" />);
    expect(((await screen.findByLabelText(/Not required/)) as HTMLInputElement).disabled).toBe(
      true,
    );
    expect(screen.getByText("The owner and admins change this.")).toBeTruthy();
  });
});
