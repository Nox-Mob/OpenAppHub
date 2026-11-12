import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AutomationsPanel,
  describeParam,
  parseNumberList,
  paramsFromDraft,
  type Automation,
  type ParamSpec,
} from "./Automations";

afterEach(cleanup);

const schema: Record<string, ParamSpec> = {
  days_before: {
    type: "int_list",
    label: "Days before",
    min: 0,
    max: 60,
    max_items: 3,
    unit: "days",
  },
  overdue: { type: "bool", label: "When overdue" },
  hours: { type: "int", label: "Hours", min: 1, max: 24 },
};

const meeting: Automation = {
  kind: "board.meeting_reminders",
  app: "board",
  name: "Meeting reminders",
  description: "Emails each board member before a meeting.",
  category: "reminders",
  enabled: true,
  params: { days_before: [7, 1] },
  is_default: true,
  default_enabled: true,
  default_params: { days_before: [7, 1] },
  params_schema: { days_before: schema["days_before"]! },
  updated_at: null,
  last_run_at: null,
  last_summary: null,
};

function fakeClient(rows: Automation[]) {
  const rpc = vi.fn((fn: string) =>
    Promise.resolve(
      fn === "list_automations" ? { data: rows, error: null } : { data: null, error: null },
    ),
  );
  return { client: { schema: () => ({ rpc }) } as unknown as SupabaseClient, rpc };
}

describe("automation settings", () => {
  it("reads and checks what people type", () => {
    expect(parseNumberList("7, 1")).toEqual([7, 1]);
    expect(parseNumberList("14 3")).toEqual([14, 3]);
    expect(parseNumberList("7, x")).toBeNull();
    expect(parseNumberList(" ")).toBeNull();
    expect(
      paramsFromDraft(schema, {
        text: { days_before: "3, 14", hours: "5" },
        bools: { overdue: true },
      }),
    ).toEqual({
      params: { days_before: [3, 14], overdue: true, hours: 5 },
    });
    expect(paramsFromDraft(schema, { text: { days_before: "61", hours: "5" }, bools: {} })).toEqual(
      {
        error: "Days before: each from 0 to 60.",
      },
    );
    expect(
      paramsFromDraft(schema, { text: { days_before: "1,2,3,4", hours: "5" }, bools: {} }),
    ).toEqual({
      error: "Days before: at most 3.",
    });
    expect(paramsFromDraft(schema, { text: { days_before: "1", hours: "0" }, bools: {} })).toEqual({
      error: "Hours: choose 1 to 24.",
    });
    expect(describeParam(schema["days_before"]!, [7, 1])).toBe("7, 1 days");
    expect(describeParam(schema["overdue"]!, false)).toBe("no");
  });

  it("lists automations and saves a change", async () => {
    const { client, rpc } = fakeClient([meeting]);
    render(<AutomationsPanel client={client} orgId="o1" canEdit />);
    const field = await screen.findByLabelText(/Days before/);
    expect((field as HTMLInputElement).value).toBe("7, 1");
    expect(screen.getByText(/Using the defaults/)).toBeTruthy();
    fireEvent.change(field, { target: { value: "14, 3" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("set_automation", {
        p_org: "o1",
        p_kind: "board.meeting_reminders",
        p_enabled: true,
        p_params: { days_before: [14, 3] },
      }),
    );
  });

  it("is read-only for people who can't change it", async () => {
    const { client } = fakeClient([
      {
        ...meeting,
        is_default: false,
        last_run_at: "2026-11-12T10:00:00Z",
        last_summary: "2 meeting reminders emailed",
      },
    ]);
    render(<AutomationsPanel client={client} orgId="o1" canEdit={false} />);
    expect(((await screen.findByLabelText(/Days before/)) as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole("button", { name: "Save" })).toBeNull();
    expect(screen.getByText(/2 meeting reminders emailed/)).toBeTruthy();
  });
});
