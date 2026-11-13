import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import {
  NotificationBell,
  NotificationSettings,
  notificationHref,
  timeAgo,
  type NotificationItem,
  type NotificationSetting,
} from "./Notifications";

afterEach(cleanup);

type Call = { fn: string; args: unknown };
function fakeClient(
  handlers: Record<string, (args: unknown) => { data?: unknown; error?: unknown }>,
) {
  const calls: Call[] = [];
  const client = {
    schema: () => ({
      rpc: async (fn: string, args?: unknown) => {
        calls.push({ fn, args });
        const h = handlers[fn];
        const r = h ? h(args) : { data: null };
        return { data: r.data ?? null, error: r.error ?? null };
      },
    }),
  } as unknown as SupabaseClient;
  return { client, calls };
}

const item = (over: Partial<NotificationItem>): NotificationItem => ({
  id: 1,
  org_id: "o",
  org_name: "Riverside",
  kind: "people.joined",
  kind_label: "Someone joined",
  title: "Bob joined",
  body: "",
  link: "/members",
  link_app: "hub",
  created_at: new Date().toISOString(),
  read_at: null,
  ...over,
});

describe("notification links and times", () => {
  it("stays in the app, goes to another app of the suite, or has no link", () => {
    const urls = { hub: "https://openapphub.org", board: "https://board.openapphub.org" };
    expect(notificationHref({ link: "/members", link_app: "hub" }, "hub", urls)).toEqual({
      href: "/members",
      external: false,
    });
    expect(notificationHref({ link: "/billing", link_app: "hub" }, "board", urls)).toEqual({
      href: "https://openapphub.org/billing",
      external: true,
    });
    expect(notificationHref({ link: "/x", link_app: "ledger" }, "board", urls)).toBeNull();
    expect(
      notificationHref({ link: "https://evil.example", link_app: "hub" }, "hub", urls),
    ).toBeNull();
  });

  it("says how long ago", () => {
    const now = new Date("2026-11-13T12:00:00Z");
    expect(timeAgo("2026-11-13T11:59:30Z", now)).toBe("just now");
    expect(timeAgo("2026-11-13T11:55:00Z", now)).toBe("5 min ago");
    expect(timeAgo("2026-11-13T09:00:00Z", now)).toBe("3 h ago");
    expect(timeAgo("2026-11-12T09:00:00Z", now)).toBe("yesterday");
    expect(timeAgo("2026-11-10T09:00:00Z", now)).toBe("3 days ago");
  });
});

describe("the bell", () => {
  it("shows the unread count, lists the latest and marks them read", async () => {
    const { client, calls } = fakeClient({
      unread_notification_count: () => ({ data: 2 }),
      my_notifications: () => ({
        data: [
          item({ id: 1 }),
          item({ id: 2, title: "Payment failed", link_app: "hub", read_at: null }),
        ],
      }),
    });
    render(<NotificationBell client={client} app="hub" settingsHref="/account" urls={{}} />);
    const bell = await screen.findByRole("button", { name: "Notifications (2 unread)" });
    fireEvent.click(bell);
    expect(await screen.findByText("Bob joined")).toBeTruthy();
    expect(screen.getByText("Choose what you get")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark all read" }));
    await waitFor(() => expect(calls.some((c) => c.fn === "mark_notifications_read")).toBe(true));
    expect(await screen.findByRole("button", { name: "Notifications" })).toBeTruthy();
  });

  it("hides itself on a database without notifications", async () => {
    const { client } = fakeClient({
      unread_notification_count: () => ({ error: { code: "PGRST202", message: "not found" } }),
    });
    const { container } = render(<NotificationBell client={client} app="board" urls={{}} />);
    await waitFor(() => expect(container.querySelector("button")).toBeNull());
  });
});

describe("settings", () => {
  const row = (over: Partial<NotificationSetting>): NotificationSetting => ({
    kind: "people.joined",
    app: "hub",
    label: "Someone joined",
    description: "Someone accepted an invitation.",
    audience: "The owner",
    email_category: "org_activity",
    in_app: true,
    email: true,
    customized: false,
    by_default: true,
    default_in_app: true,
    default_email: true,
    may_turn_on: true,
    ...over,
  });

  it("saves each choice and goes back to the defaults", async () => {
    const { client, calls } = fakeClient({
      notification_settings: () => ({
        data: [
          row({}),
          row({
            kind: "billing.payment_failed",
            label: "A payment didn't go through",
            by_default: false,
            in_app: false,
            email: false,
          }),
        ],
      }),
    });
    render(<NotificationSettings client={client} />);
    const email = await screen.findByLabelText("Someone joined: by email");
    fireEvent.click(email);
    await waitFor(() =>
      expect(calls.find((c) => c.fn === "set_notification_preference")?.args).toEqual({
        p_kind: "people.joined",
        p_in_app: true,
        p_email: false,
      }),
    );
    expect(screen.getByText(/You can turn it on for yourself/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use the defaults" }));
    await waitFor(() =>
      expect(calls.some((c) => c.fn === "reset_notification_preference")).toBe(true),
    );
  });
});
