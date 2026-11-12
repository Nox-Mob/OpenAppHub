import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const rpc = vi.hoisted(() => vi.fn(async (_fn: string, _args: unknown) => ({ error: null })));
vi.mock("@shared/supabase/client", () => ({ getSupabaseBrowserClient: () => ({ rpc }) }));
vi.mock("@tanstack/react-router", () => ({ useRouter: () => ({ invalidate: () => {} }) }));

import { AppRolesPanel } from "./members";

afterEach(cleanup);

const members = [
  { user_id: "o", display_name: "Olive Owner", email: "o@x.org", role: "owner" as const },
  { user_id: "b", display_name: "Bob", email: "b@x.org", role: "member" as const },
];
const roles = {
  charter: new Map([["b", "Chapter admin (Post 12)"]]),
  board: new Map([["b", "secretary"]]),
  ledger: new Map<string, string>(),
  overrides: new Map([["ledger:b", "viewer" as const]]),
  workflowEditors: new Set<string>(),
};

describe("roles in each app", () => {
  it("shows each person's role per app and changes one app only", async () => {
    const changed = vi.fn();
    render(
      <AppRolesPanel orgId="org" members={members} roles={roles} canEdit onChanged={changed} />,
    );
    expect((screen.getByLabelText("Bob in OpenLedgerApp") as HTMLSelectElement).value).toBe(
      "viewer",
    );
    expect((screen.getByLabelText("Bob in OpenBoardApp") as HTMLSelectElement).value).toBe(
      "member",
    );
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
    fireEvent.click(screen.getByLabelText("Bob can build workflows"));
    await vi.waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("grant_automation_editor", {
        p_org: "org",
        p_user: "b",
        p_grant: true,
      }),
    );
    expect(changed).toHaveBeenCalled();
  });
});
