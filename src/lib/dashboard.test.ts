import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  appHref,
  loadDashboard,
  mergeTasks,
  summarizeMembership,
  summarizeMoney,
  thisWeek,
  addDays,
  type DashboardTask,
  type Meeting,
} from "./dashboard";

const urls = {
  board: "https://board.example",
  charter: "https://charter.example/",
  ledger: "https://ledger.example",
};

describe("dashboard data", () => {
  it("links into each app for this organization", () => {
    expect(appHref(urls.board, "/board/tasks", "org")).toBe(
      "https://board.example/board/tasks?org=org",
    );
    expect(appHref(urls.charter, "/orgs/u1?tab=members", "org")).toBe(
      "https://charter.example/orgs/u1?tab=members",
    );
    expect(appHref(urls.ledger, "/templates?x=1", "org")).toBe(
      "https://ledger.example/templates?x=1&org=org",
    );
  });

  it("merges every app's tasks, soonest first, undated last", () => {
    const tasks = mergeTasks(
      {
        board: [
          {
            title: "Send minutes",
            due_date: "2026-11-20",
            meeting_title: "October",
            link: "/board/tasks",
          },
        ],
        charter: [
          {
            kind: "vacant_seat",
            title: "Fill the President seat",
            unit_name: "Chapter A",
            due_on: null,
            link: "/orgs/a?tab=board",
          },
          {
            kind: "join_request",
            title: "Review join request: Morgan",
            unit_name: "Riverside",
            due_on: "2026-11-10",
            link: "/orgs/r?tab=members",
          },
        ],
        ledger: [{ title: "Record Rent", due_on: "2026-11-15", link: "/templates" }],
      },
      urls,
      "org",
    )!;
    expect(tasks.map((t) => t.title)).toEqual([
      "Review join request: Morgan",
      "Record Rent",
      "Send minutes",
      "Fill the President seat",
    ]);
    expect(tasks[2]?.detail).toBe("From October");
    expect(mergeTasks({ board: null, charter: null, ledger: null }, urls, "org")).toBeNull();
    expect(
      mergeTasks({ board: null, charter: null, ledger: null, hub: null }, urls, "org"),
    ).toBeNull();
    expect(mergeTasks({ board: [], charter: null, ledger: null }, urls, "org")).toEqual([]);
  });

  it("adds up the year's money by month", () => {
    const m = summarizeMoney([
      {
        month: "2026-02-01",
        currency: "USD",
        revenue_cents: 30000,
        expense_cents: 50000,
        net_cents: -20000,
      },
      {
        month: "2026-01-01",
        currency: "USD",
        revenue_cents: 120000,
        expense_cents: 45000,
        net_cents: 75000,
      },
    ])!;
    expect([m.revenue, m.expenses, m.net]).toEqual([150000, 95000, 55000]);
    expect(m.months.map((x) => x.month)).toEqual(["2026-01-01", "2026-02-01"]);
    expect(summarizeMoney(null)).toBeNull();
  });

  it("membership: counts, units and officers with holders", () => {
    const m = summarizeMembership(
      [{ current_members: 141, pending_requests: 2, renewals_due: 9 }],
      [{ units: 16 }],
      [
        { title: "President", holder_name: "Alex" },
        { title: "Secretary", holder_name: null },
      ],
    )!;
    expect(m).toEqual({
      current: 141,
      pending: 2,
      renewals: 9,
      units: 16,
      officers: [{ title: "President", holder: "Alex" }],
    });
    expect(summarizeMembership(null, null, null)).toBeNull();
  });

  it("an app that isn't on this database hides its panels", async () => {
    const missing = { data: null, error: { code: "42P01", message: "does not exist" } };
    const chain: Record<string, unknown> = {};
    for (const k of ["select", "eq", "in", "gte", "order", "limit"]) chain[k] = () => chain;
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(missing);
    const client = { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
    expect(await loadDashboard(client, { orgId: "org", userId: "u", urls })).toEqual({
      tasks: null,
      meetings: null,
      decisions: null,
      money: null,
      membership: null,
    });
  });
});

describe("finishing tasks from the hub (S-19)", () => {
  it("offers Done or Skip only where the app says it can be finished here", () => {
    const tasks = mergeTasks(
      {
        board: [
          {
            id: "a1",
            title: "Mine",
            due_date: "2026-11-20",
            link: "/board/tasks",
            completable: true,
          },
          {
            id: "a2",
            title: "Theirs",
            due_date: "2026-11-21",
            link: "/board/tasks",
            completable: false,
          },
        ],
        charter: [
          {
            kind: "join_request",
            title: "Review join request",
            due_on: "2026-11-19",
            link: "/orgs/x?tab=members",
          },
        ],
        ledger: [
          {
            item_id: "t1",
            title: "Record Rent",
            due_on: "2026-11-22",
            link: "/templates",
            completable: true,
          },
        ],
        hub: [{ id: "w1", title: "Order the award", note: "", link: null, due_on: null }],
      },
      urls,
      "org",
    )!;
    const by = (title: string) => tasks.find((t) => t.title === title)!;
    expect(by("Mine").complete).toMatchObject({
      label: "Done",
      schema: "board",
      fn: "complete_action_item",
      args: { p_id: "a1" },
    });
    expect(by("Theirs").complete).toBeUndefined();
    expect(by("Review join request").complete).toBeUndefined();
    expect(by("Record Rent").complete).toMatchObject({
      label: "Skip",
      schema: "ledger",
      fn: "skip_recurring_due",
    });
    expect(by("Record Rent").complete!.confirm).toContain('Skip "Rent" this time?');
    expect(by("Order the award")).toMatchObject({
      app: "hub",
      href: "/automations",
      complete: { fn: "complete_automation_task", args: { p_id: "w1" } },
    });
  });
});

describe("this week (H-03)", () => {
  const task = (title: string, due: string | null): DashboardTask => ({
    app: "board",
    title,
    detail: null,
    due,
    href: "/x",
  });
  const meeting = (id: string, date: string): Meeting => ({
    id,
    title: `Meeting ${id}`,
    meeting_date: date,
    minutes_status: null,
  });

  it("groups meetings and due dates by day for seven days, overdue apart", () => {
    const w = thisWeek(
      [
        task("Late", "2026-11-10"),
        task("Today", "2026-11-13"),
        task("Sunday", "2026-11-15"),
        task("Next week", "2026-11-20"),
        task("Undated", null),
      ],
      [meeting("a", "2026-11-14"), meeting("b", "2026-11-19"), meeting("c", "2026-11-20")],
      "2026-11-13",
    )!;
    expect(w.overdue.map((t) => t.title)).toEqual(["Late"]);
    expect(w.days.map((d) => d.date)).toEqual([
      "2026-11-13",
      "2026-11-14",
      "2026-11-15",
      "2026-11-19",
    ]);
    expect(w.days[1]!.meetings.map((m) => m.id)).toEqual(["a"]);
    expect(w.days.flatMap((d) => d.tasks).map((t) => t.title)).toEqual(["Today", "Sunday"]);
  });

  it("is null with no apps, and empty with nothing coming", () => {
    expect(thisWeek(null, null, "2026-11-13")).toBeNull();
    expect(thisWeek([], [], "2026-11-13")).toEqual({ overdue: [], days: [] });
  });

  it("adds days across months", () => {
    expect(addDays("2026-11-28", 6)).toBe("2026-12-04");
  });
});
