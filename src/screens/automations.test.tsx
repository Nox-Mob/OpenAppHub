import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FIXTURE_OVERVIEW } from "@/lib/workflow-fixture";
import { WorkflowEditor } from "./automations";

afterEach(cleanup);

describe("workflow editor", () => {
  it("builds the board-documents workflow and saves it", async () => {
    const onSave = vi.fn(async (_w: unknown) => null);
    render(
      <WorkflowEditor
        overview={FIXTURE_OVERVIEW}
        workflow={null}
        onSave={onSave}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("Name", { selector: "input" }), {
      target: { value: "Reports before meetings" },
    });
    fireEvent.change(screen.getByLabelText("When", { selector: "select" }), {
      target: { value: "board.meeting_upcoming" },
    });
    fireEvent.change(screen.getByLabelText("Days before the meeting"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Add a step", { selector: "#always-add" }), {
      target: { value: "ledger.reports_to_meeting" },
    });
    fireEvent.click(
      within(screen.getByRole("region", { name: "Always" })).getByRole("button", { name: "Add" }),
    );
    fireEvent.change(screen.getByLabelText("As of"), { target: { value: "last_closed_month" } });
    expect(screen.getByText("When: A board meeting is 5 days away or less.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Save workflow" }));
    await vi.waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({
      name: "Reports before meetings",
      definition: {
        trigger: { type: "board.meeting_upcoming", params: { days_before: 5 } },
        always: [{ type: "ledger.reports_to_meeting", as_of: "last_closed_month" }],
      },
    });
  });

  it("routes by rank with If / Else if, and won't add a meeting action without a meeting", () => {
    render(
      <WorkflowEditor
        overview={FIXTURE_OVERVIEW}
        workflow={null}
        onSave={async () => null}
        onCancel={() => {}}
      />,
    );
    fireEvent.change(screen.getByLabelText("When", { selector: "select" }), {
      target: { value: "charter.payment_received" },
    });
    const meetingOnly = screen.getAllByRole("option", {
      name: /Add the financial reports.*needs a meeting When/,
      hidden: true,
    });
    expect(meetingOnly.length).toBeGreaterThan(0);
    expect(meetingOnly.every((op) => (op as HTMLOptionElement).disabled)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Add If" }));
    const branch = screen.getByRole("group", { name: "If #1" });
    fireEvent.change(within(branch).getByLabelText("Field"), {
      target: { value: "member.fields.rank" },
    });
    fireEvent.change(within(branch).getByLabelText("Comparison"), { target: { value: "lte" } });
    fireEvent.change(within(branch).getByLabelText("Value"), { target: { value: "PFC" } });
    expect(screen.getByText(/If Rank is at most PFC/)).toBeTruthy();
  });
});
