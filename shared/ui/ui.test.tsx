import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import { InvitationPage, invitationRoute, invitationSummary } from "./InvitationPage";
import { OrgSwitcher } from "./OrgSwitcher";
import { switcherApps } from "./SuiteSwitcher";

afterEach(() => {
  cleanup();
  document.cookie = "oah_org=; Max-Age=0; Path=/";
});

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const urls = {
  hub: "https://openapphub.org",
  charter: "https://charter.openapphub.org",
  board: "https://board.openapphub.org",
};

describe("switcherApps", () => {
  it("lists apps with URLs, only when there's somewhere else to go", () => {
    expect(switcherApps("board", urls).map((a) => a.id)).toEqual(["hub", "charter", "board"]);
    expect(switcherApps("board", { board: "https://b.example" })).toEqual([]);
    expect(switcherApps("board", {})).toEqual([]);
  });
});

describe("OrgSwitcher", () => {
  it("opens, switches org (cookie + callback), and closes on Escape with focus back", async () => {
    const onSelect = vi.fn();
    render(
      <OrgSwitcher
        orgs={[
          { id: A, name: "Alpha Association", role: "owner" },
          { id: B, name: "Beta Board", role: "viewer" },
        ]}
        currentOrgId={A}
        onSelect={onSelect}
        createHref="/orgs/new"
      />,
    );
    const trigger = screen.getByRole("button", { name: /Organization: Alpha Association/ });
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Viewer")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Create organization/ }).getAttribute("href")).toBe(
      "/orgs/new",
    );
    fireEvent.click(screen.getByRole("button", { name: /Beta Board/ }));
    expect(onSelect).toHaveBeenCalledWith(B);
    expect(document.cookie).toContain(`oah_org=${B}`);
    expect(screen.queryByText("Viewer")).toBeNull();

    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Viewer")).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});

describe("AppShell drawer", () => {
  it("opens as a dialog, closes on Escape and returns focus to the menu button", () => {
    render(
      <AppShell
        app="ledger"
        nav={[{ label: "Dashboard", href: "/", current: true }]}
        user={{ name: "Mara Rossi", email: "mara@example.org" }}
        orgs={[]}
        currentOrgId={null}
        helpHref="https://docs.openapphub.org/ledger/"
        onSignOut={() => {}}
      >
        <p>content</p>
      </AppShell>,
    );
    const open = screen.getByRole("button", { name: "Open menu" });
    open.focus();
    fireEvent.click(open);
    const dialog = screen.getByRole("dialog", { name: "OpenLedgerApp menu" });
    expect(dialog.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(open);
  });

  it("user menu signs out", () => {
    const onSignOut = vi.fn();
    render(
      <AppShell
        app="hub"
        nav={[]}
        user={{ name: "Mara Rossi", email: "mara@example.org" }}
        orgs={[]}
        currentOrgId={null}
        helpHref="/help"
        onSignOut={onSignOut}
      >
        <p>content</p>
      </AppShell>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Account menu" }));
    expect(screen.getByText("mara@example.org")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Sign out/ }));
    expect(onSignOut).toHaveBeenCalled();
  });
});

describe("invitationRoute", () => {
  it("accepts core and own-app invitations here", () => {
    expect(invitationRoute(null, "hub", "t", urls)).toEqual({ kind: "here" });
    expect(invitationRoute("board", "board", "t", urls)).toEqual({ kind: "here" });
  });
  it("sends other apps' invitations to that app before accepting", () => {
    expect(invitationRoute("charter", "hub", "a/b", urls)).toEqual({
      kind: "redirect",
      url: "https://charter.openapphub.org/invite/a%2Fb",
    });
    expect(invitationRoute("ledger", "hub", "t", urls)).toEqual({
      kind: "elsewhere",
      appName: "OpenLedgerApp",
    });
  });
  it("summarises role and app-only invitations", () => {
    const base = { org_name: "Riverside", email: null, status: "pending" as const };
    expect(invitationSummary({ ...base, role: "admin", app: null })).toBe(
      "You've been invited to join Riverside as an admin.",
    );
    expect(invitationSummary({ ...base, role: null, app: "charter" })).toBe(
      "You've been invited to Riverside in OpenCharterApp.",
    );
  });
});

type Rpc = (fn: string, args: unknown) => Promise<{ data: unknown; error: unknown }>;
function mockClient(rpc: Rpc, user: { email: string } | null) {
  return { rpc: vi.fn(rpc), auth: { getUser: vi.fn(async () => ({ data: { user } })) } } as never;
}
const pending = {
  org_name: "Riverside",
  role: "member",
  app: null,
  email: "m***@example.org",
  status: "pending",
};

describe("InvitationPage", () => {
  const common = {
    token: "tok",
    signInHref: (next: string) => `/login?next=${encodeURIComponent(next)}`,
    continueHref: () => "/",
    urls,
  };

  it("asks signed-out visitors to sign in, coming back here", async () => {
    const client = mockClient(async () => ({ data: [pending], error: null }), null);
    render(<InvitationPage {...common} app="hub" client={client} />);
    const link = await screen.findByRole("link", { name: "Sign in to accept" });
    expect(link.getAttribute("href")).toContain("/login?next=");
    expect(screen.getByText(/join Riverside as a member/)).toBeTruthy();
  });

  it("accepts on click, runs this app's follow-up, sets the org and finishes", async () => {
    const accepted = {
      id: "i1",
      org_id: A,
      role: "member",
      app: "board",
      app_payload: { office: "secretary" },
    };
    const client = mockClient(
      async (fn) =>
        fn === "get_invitation"
          ? { data: [{ ...pending, app: "board" }], error: null }
          : { data: [accepted], error: null },
      { email: "mara@example.org" },
    );
    const onAccepted = vi.fn(async () => {});
    render(<InvitationPage {...common} app="board" client={client} onAccepted={onAccepted} />);
    const join = await screen.findByRole("button", { name: "Join Riverside" });
    await act(async () => fireEvent.click(join));
    expect(await screen.findByText("Welcome to Riverside")).toBeTruthy();
    expect(onAccepted).toHaveBeenCalledWith(accepted, client);
    expect(document.cookie).toContain(`oah_org=${A}`);
  });

  it("if the follow-up fails, says so and retries only the follow-up", async () => {
    const accepted = { id: "i1", org_id: A, role: null, app: "board", app_payload: {} };
    const rpc = vi.fn(async (fn: string) =>
      fn === "get_invitation"
        ? { data: [{ ...pending, role: null, app: "board" }], error: null }
        : { data: [accepted], error: null },
    );
    const client = {
      rpc,
      auth: { getUser: async () => ({ data: { user: { email: "m@example.org" } } }) },
    } as never;
    const onAccepted = vi
      .fn()
      .mockRejectedValueOnce(new Error("seat is taken"))
      .mockResolvedValueOnce(undefined);
    render(<InvitationPage {...common} app="board" client={client} onAccepted={onAccepted} />);
    const join = await screen.findByRole("button", { name: "Join Riverside" });
    await act(async () => fireEvent.click(join));
    expect(await screen.findByText(/seat is taken/)).toBeTruthy();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Try again" })));
    expect(await screen.findByText("Welcome to Riverside")).toBeTruthy();
    expect(rpc.mock.calls.filter(([fn]) => fn === "accept_invitation")).toHaveLength(1);
  });

  it("redirects another app's invitation before accepting", async () => {
    const navigate = vi.fn();
    const client = mockClient(
      async () => ({ data: [{ ...pending, app: "charter" }], error: null }),
      null,
    );
    render(<InvitationPage {...common} app="hub" client={client} navigate={navigate} />);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith("https://charter.openapphub.org/invite/tok"),
    );
    expect(
      (client as unknown as { rpc: { mock: { calls: unknown[][] } } }).rpc.mock.calls,
    ).toHaveLength(1);
  });

  it("explains used, expired and invalid links", async () => {
    const used = mockClient(
      async () => ({ data: [{ ...pending, status: "expired" }], error: null }),
      null,
    );
    render(<InvitationPage {...common} app="hub" client={used} />);
    expect(await screen.findByText("This invitation has expired")).toBeTruthy();
    cleanup();
    const none = mockClient(async () => ({ data: [], error: null }), null);
    render(<InvitationPage {...common} app="hub" client={none} />);
    expect(await screen.findByText("This invitation link isn't valid")).toBeTruthy();
  });
});
