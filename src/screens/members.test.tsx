import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: unknown) => ({ error: null })));
vi.mock("@shared/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: () => {} }) }));

import type { AppRoles } from "@/lib/people";
import { AppRolesPanel, NamedRolesPanel, WORKFLOWS_RUN_AS_ORG } from "./members";

afterEach(() => {
  cleanup();
  rpc.mockClear();
});

const members = [
  { user_id: "o", display_name: "Olive Owner", email: "o@x.org", role: "owner" as const },
  { user_id: "b", display_name: "Bob", email: "b@x.org", role: "member" as const },
  { user_id: "c", display_name: "Cy", email: "c@x.org", role: "admin" as const },
];
const treasurer = {
  id: "t",
  name: "Treasurer",
  description: "",
  app_roles: { ledger: "admin" as const, board: "member" as const, charter: "member" as const },
  permissions: { charter: ["payments.view"] },
};
const roles: AppRoles = {
  charter: new Map([["b", "Chapter admin (Post 12)"]]),
  board: new Map([["b", "secretary"]]),
  ledger: new Map<string, string>(),
  overrides: new Map([["ledger:b", "viewer" as const]]),
  resolved: new Map([
    ["charter:b", { role: "member" as const, source: "named" as const }],
    ["board:b", { role: "member" as const, source: "named" as const }],
    ["ledger:b", { role: "viewer" as const, source: "person" as const }],
    ["charter:c", { role: "viewer" as const, source: "fallback" as const }],
    ["board:c", { role: "viewer" as const, source: "fallback" as const }],
    ["ledger:c", { role: "viewer" as const, source: "fallback" as const }],
  ]),
  namedRoleOf: new Map([["b", "t"]]),
  namedRoles: [treasurer],
  permissionTypes: [
    { app: "charter", key: "payments.view", label: "See payments", description: "", sort: 1 },
  ],
  workflowEditors: new Set<string>(),
};

describe("roles in each app", () => {
  it("shows where each role comes from and changes one app only", async () => {
    const changed = vi.fn();
    render(
      <AppRolesPanel orgId="org" members={members} roles={roles} canEdit onChanged={changed} />,
    );
    // Set for Ledger only; Board comes from the named role.
    expect((screen.getByLabelText("Bob in OpenLedgerApp") as HTMLSelectElement).value).toBe(
      "viewer",
    );
    expect((screen.getByLabelText("Bob in OpenBoardApp") as HTMLSelectElement).value).toBe("");
    expect(screen.getAllByText("From Treasurer: Member").length).toBeGreaterThan(0);
    expect((screen.getByLabelText("Bob's named role") as HTMLSelectElement).value).toBe("t");
    // An OpenAppHub admin with nothing set is a viewer in each app, and it says so.
    expect(screen.getAllByText("Not set: viewer").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Secretary")).toBeTruthy();
    expect(screen.getByText("Chapter admin (Post 12)")).toBeTruthy();
    expect(screen.queryByLabelText("Olive Owner in OpenBoardApp")).toBeNull();

    fireEvent.change(screen.getByLabelText("Bob in OpenBoardApp"), { target: { value: "admin" } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_app_role", {
        p_org: "org",
        p_user: "b",
        p_app: "board",
        p_role: "admin",
      }),
    );
    // Back to the named role.
    fireEvent.change(screen.getByLabelText("Bob in OpenLedgerApp"), { target: { value: "" } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_app_role", {
        p_org: "org",
        p_user: "b",
        p_app: "ledger",
        p_role: null,
      }),
    );
    fireEvent.change(screen.getByLabelText("Cy's named role"), { target: { value: "t" } });
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_named_role", {
        p_org: "org",
        p_user: "c",
        p_role: "t",
      }),
    );
    expect(changed).toHaveBeenCalled();
  });

  it("warns that workflows run as the organization before letting someone build them", async () => {
    render(
      <AppRolesPanel orgId="org" members={members} roles={roles} canEdit onChanged={() => {}} />,
    );
    expect(screen.getByText(WORKFLOWS_RUN_AS_ORG)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Bob can build workflows"));
    expect(rpc).not.toHaveBeenCalledWith("grant_automation_editor", expect.anything());
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(WORKFLOWS_RUN_AS_ORG)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Let them build workflows" }));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("grant_automation_editor", {
        p_org: "org",
        p_user: "b",
        p_grant: true,
      }),
    );
  });
});

describe("named roles", () => {
  it("lists them and creates one with a role per app and extra permissions", async () => {
    const changed = vi.fn();
    render(<NamedRolesPanel orgId="org" roles={roles} canEdit onChanged={changed} />);
    expect(screen.getByText("Treasurer")).toBeTruthy();
    expect(
      screen.getByText("OpenCharterApp: Member · OpenBoardApp: Member · OpenLedgerApp: Admin"),
    ).toBeTruthy();
    expect(screen.getByText("Also: See payments")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "New named role" }));
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Awards clerk" } });
    fireEvent.change(screen.getByLabelText("OpenCharterApp"), { target: { value: "member" } });
    fireEvent.click(screen.getByLabelText(/See payments/));
    fireEvent.click(screen.getByRole("button", { name: "Create role" }));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("save_named_role", {
        p_org: "org",
        p_id: null,
        p_name: "Awards clerk",
        p_description: "",
        p_app_roles: { charter: "member" },
        p_permissions: { charter: ["payments.view"] },
      }),
    );
    expect(changed).toHaveBeenCalled();
  });
});
