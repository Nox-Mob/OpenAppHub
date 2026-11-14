// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { TwoStepGate } from "./TwoStep";

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
