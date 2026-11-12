import { describe, expect, it } from "vitest";
import { FIXTURE_OVERVIEW as o } from "./workflow-fixture";
import {
  describeWorkflow,
  draftProblems,
  emptyDefinition,
  opsFor,
  withOrder,
  type Definition,
} from "./workflows";

const rank = o.triggers[2]!.extra_fields[0]!;
const award: Definition = {
  trigger: { type: "charter.payment_received", params: {} },
  always: [],
  branches: [
    {
      match: "all",
      conditions: [withOrder({ field: "member.fields.rank", op: "lte", value: "PFC" }, rank)],
      actions: [
        {
          type: "task",
          to: { type: "charter.seat", seat: "president", level: "unit" },
          title: "Review {{member.name}}",
        },
      ],
    },
    {
      match: "all",
      conditions: [
        withOrder(
          { field: "member.fields.rank", op: "between", value: "SPC", value2: "SFC" },
          rank,
        ),
      ],
      actions: [
        {
          type: "task",
          to: { type: "charter.seat", seat: "president", level: "region" },
          title: "Review",
        },
      ],
    },
  ],
  otherwise: [
    {
      type: "email",
      to: { type: "role", roles: ["owner"] },
      subject: "Senior",
      message: "Please review.",
    },
  ],
};

describe("workflow builder", () => {
  it("offers comparisons that fit the field", () => {
    expect(opsFor(rank)).toContain("between");
    expect(opsFor(rank)).not.toContain("contains");
    expect(opsFor({ key: "x", label: "X", type: "text" })).toContain("contains");
    expect(opsFor({ key: "x", label: "X", type: "boolean" })).toEqual(["eq"]);
  });

  it("compares ordered fields like rank by their place in the list", () => {
    expect(
      withOrder({ field: "member.fields.rank", op: "between", value: "SPC", value2: "SFC" }, rank),
    ).toEqual({
      field: "member.fields.rank",
      op: "between",
      value: "SPC",
      value2: "SFC",
      order: 30,
      order2: 50,
    });
    expect(
      withOrder({ field: "member.name", op: "eq", value: "x", order: 3 }, o.triggers[2]!.fields[0]),
    ).toEqual({
      field: "member.name",
      op: "eq",
      value: "x",
    });
  });

  it("reads a workflow back in plain words", () => {
    expect(describeWorkflow(award, o)).toEqual([
      "When: A payment is received.",
      "If Rank is at most PFC: give their chapter's president a task.",
      "Else if Rank is between SPC and SFC: give their region's president a task.",
      "Otherwise: email the organization's owners.",
    ]);
    expect(
      describeWorkflow(
        {
          ...emptyDefinition("board.meeting_upcoming"),
          trigger: { type: "board.meeting_upcoming", params: { days_before: 5 } },
          always: [{ type: "ledger.reports_to_meeting", as_of: "last_closed_month" }],
        },
        o,
      ),
    ).toEqual([
      "When: A board meeting is 5 days away or less.",
      "Always: add the financial reports to the meeting, as of the last closed month.",
    ]);
  });

  it("points at problems before saving", () => {
    expect(draftProblems("Award routing", award, o)).toEqual([]);
    expect(draftProblems("", emptyDefinition(), o)).toEqual([
      "Give the workflow a name.",
      "Choose what starts it (When).",
      "Add at least one thing to do (Then).",
    ]);
    expect(
      draftProblems(
        "X",
        {
          ...emptyDefinition("charter.payment_received"),
          always: [{ type: "ledger.reports_to_meeting", as_of: "today" }],
        },
        o,
      ),
    ).toEqual(['"Add the financial reports to the meeting" needs a When with a meeting.']);
    expect(
      draftProblems(
        "X",
        {
          ...emptyDefinition("board.meeting_upcoming"),
          always: [{ type: "task", to: { type: "subject" }, title: "" }],
        },
        o,
      ),
    ).toEqual(['Fill in "Days before the meeting".', "Every task needs a title."]);
  });
});
