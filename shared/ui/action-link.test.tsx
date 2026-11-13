import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { ActionLinkPage, actionLinkProblem, openHref, type ActionLinkInfo } from "./ActionLink";

afterEach(cleanup);

type Call = { schema: string; fn: string; args: unknown };
function fake(user: boolean, info: ActionLinkInfo, failWith?: string) {
  const calls: Call[] = [];
  const client = {
    auth: { getUser: async () => ({ data: { user: user ? { id: "u" } : null } }) },
    schema: (schema: string) => ({
      rpc: async (fn: string, args: unknown) => {
        calls.push({ schema, fn, args });
        if (fn === "action_link") return { data: info, error: null };
        if (fn === "consume_action_link") return { data: true, error: null };
        return { data: null, error: failWith ? { message: failWith } : null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const ready: ActionLinkInfo = {
  state: "ready",
  label: "Approve",
  what: "An award submission from Pat is pending your approval",
  org_name: "Riverside",
  open_link: "/approvals/1",
  open_app: "hub",
  expires_at: "2026-11-20T00:00:00Z",
  rpc: { schema: "public", fn: "decide_approval", args: { p_id: "1", p_decision: "approved" } },
  comment_arg: "p_comment",
};

describe("the confirm page", () => {
  it("asks to sign in first, and does nothing", async () => {
    const { client, calls } = fake(false, ready);
    render(
      <ActionLinkPage
        client={client}
        token="t"
        app="hub"
        signInHref={(n) => `/login?next=${n}`}
        urls={{}}
      />,
    );
    expect(await screen.findByRole("heading", { name: "Sign in to continue" })).toBeTruthy();
    expect(calls).toEqual([]);
  });

  it("says what will happen, and only acts when confirmed, with the comment", async () => {
    const { client, calls } = fake(true, ready);
    render(
      <ActionLinkPage client={client} token="t" app="hub" signInHref={() => "/login"} urls={{}} />,
    );
    expect(await screen.findByRole("heading", { name: ready.what! })).toBeTruthy();
    expect(screen.getByText(/Nothing has happened yet/)).toBeTruthy();
    expect(calls.map((c) => c.fn)).toEqual(["action_link"]);
    fireEvent.change(screen.getByLabelText("Comment (optional)"), { target: { value: " Fine " } });
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByText("Done")).toBeTruthy();
    expect(calls[1]).toEqual({
      schema: "public",
      fn: "decide_approval",
      args: { p_id: "1", p_decision: "approved", p_comment: "Fine" },
    });
    expect(calls[2]!.fn).toBe("consume_action_link");
  });

  it("keeps the link when the app says no, and shows why", async () => {
    const { client, calls } = fake(true, ready, "This was already decided (approved).");
    render(
      <ActionLinkPage client={client} token="t" app="hub" signInHref={() => "/login"} urls={{}} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    await waitFor(() => expect(calls.some((c) => c.fn === "consume_action_link")).toBe(false));
  });

  it("explains links that can't be used, and offers the app", () => {
    expect(actionLinkProblem({ state: "expired" })).toMatch(/expired/);
    expect(actionLinkProblem({ state: "other_person" })).toMatch(/someone else/);
    expect(actionLinkProblem({ state: "not_allowed", org_name: "Riverside" })).toMatch(
      /^Riverside doesn't allow/,
    );
    expect(actionLinkProblem(ready)).toBeNull();
    expect(
      openHref({ state: "used", open_link: "/members", open_app: "charter" }, "hub", {
        charter: "https://c.example",
      }),
    ).toBe("https://c.example/members");
    expect(openHref({ state: "used", open_link: "/x", open_app: "hub" }, "hub", {})).toBe("/x");
  });

  it("refuses a function name it doesn't expect", async () => {
    const bad = { ...ready, rpc: { schema: "auth", fn: "users", args: {} } };
    const { client, calls } = fake(true, bad);
    render(
      <ActionLinkPage client={client} token="t" app="hub" signInHref={() => "/login"} urls={{}} />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(calls.map((c) => c.fn)).toEqual(["action_link"]);
  });
});
