import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  boardSummary,
  charterSummary,
  isMissing,
  ledgerSummary,
  loadSummary,
} from "./app-summaries";

describe("dashboard summaries (S-03)", () => {
  it("Board: the next scheduled meeting and the latest decision", () => {
    const lines = boardSummary(
      [
        { title: "Later", meeting_date: "2026-12-10", status: "scheduled" },
        { title: "Regular Board Meeting", meeting_date: "2026-11-20", status: "scheduled" },
        { title: "Yesterday", meeting_date: "2026-11-10", status: "scheduled" },
      ],
      [{ motion_text: "Adopt the budget", outcome: "carried" }],
      "2026-11-12",
    );
    expect(lines).toEqual([
      { label: "Next meeting", value: "Regular Board Meeting, Nov 20, 2026" },
      { label: "Latest decision", value: "Adopt the budget (carried)" },
    ]);
    expect(boardSummary([], [], "2026-11-12").map((l) => l.value)).toEqual([
      "None scheduled",
      "None yet",
    ]);
  });

  it("Charter: the top unit's officers, and units when there are chapters", () => {
    const seats = ["President", "Secretary", "Treasurer", "Vice President"].map((title, i) => ({
      unit_id: "org",
      title,
      holder_name: `Person ${i + 1}`,
    }));
    const lines = charterSummary(seats, 16, "org");
    expect(lines[0]).toEqual({ label: "Units", value: "16 (with chapters)" });
    expect(lines[1]?.value).toBe(
      "President: Person 1, Secretary: Person 2, Treasurer: Person 3, and 1 more",
    );
    expect(charterSummary([], 1, "org")).toEqual([{ label: "Officers", value: "None recorded" }]);
  });

  it("Ledger: this year's money in, out and net in the org's currency", () => {
    const lines = ledgerSummary([
      { currency: "USD", revenue_cents: 120000, expense_cents: 45000, net_cents: 75000 },
      { currency: "USD", revenue_cents: 30000, expense_cents: 50000, net_cents: -20000 },
    ]);
    expect(lines.map((l) => l.value)).toEqual(["$1,500.00", "$950.00", "+$550.00"]);
    expect(ledgerSummary([])[0]?.value).toBe("No transactions yet");
  });

  it("a missing view or schema means the app isn't here", async () => {
    expect(
      isMissing({ code: "42P01", message: 'relation "board.api_meetings" does not exist' }),
    ).toBe(true);
    expect(
      isMissing({ code: "PGRST106", message: "The schema must be one of the following" }),
    ).toBe(true);
    expect(isMissing({ code: "XX000", message: "boom" })).toBe(false);
    const missing = { data: null, error: { code: "42P01", message: "does not exist" } };
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "gte", "order", "limit"]) chain[m] = () => chain;
    chain["then"] = (resolve: (v: unknown) => unknown) => resolve(missing);
    const client = { schema: () => ({ from: () => chain }) } as unknown as SupabaseClient;
    expect(await loadSummary(client, "ledger", "org")).toBeNull();
    expect(await loadSummary(client, "board", "org")).toBeNull();
  });
});
