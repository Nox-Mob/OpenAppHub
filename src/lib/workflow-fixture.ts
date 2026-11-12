// A realistic builder catalog for tests and the dev preview (/dev/hub): what the apps register.
import type { Overview } from "./workflows";

export const FIXTURE_OVERVIEW: Overview = {
  can_edit: true,
  can_manage_editors: true,
  may_build: true,
  is_chapter: false,
  has_chapters: true,
  chapters_may_build: true,
  workflows: [],
  shared_by_parent: [],
  editors: [],
  members: [
    { user_id: "u1", name: "Nora National", role: "owner" },
    { user_id: "u2", name: "Sam Secretary", role: "member" },
  ],
  triggers: [
    {
      type: "core.schedule",
      app: "hub",
      label: "On a schedule",
      description: "Every day, every week on a day, or every month on a date, at an hour.",
      kind: "schedule",
      params_schema: {
        frequency: { type: "choice", label: "How often", options: ["daily", "weekly", "monthly"] },
        day: { type: "int", label: "Day", min: 0, max: 28 },
        hour: { type: "int", label: "Hour (0–23)", min: 0, max: 23 },
      },
      fields: [{ key: "today", label: "Today's date", type: "date" }],
      extra_fields: [],
      provides: [],
    },
    {
      type: "board.meeting_upcoming",
      app: "board",
      label: "A board meeting is coming up",
      description: "When a scheduled meeting is this many days away or less.",
      kind: "scan",
      params_schema: {
        days_before: { type: "int", label: "Days before the meeting", min: 0, max: 60 },
      },
      fields: [
        { key: "meeting.title", label: "Meeting title", type: "text" },
        { key: "meeting.days_away", label: "Days away", type: "number" },
      ],
      extra_fields: [],
      provides: ["meeting"],
    },
    {
      type: "charter.payment_received",
      app: "charter",
      label: "A payment is received",
      description: "When a dues or other payment is paid.",
      kind: "event",
      params_schema: {},
      fields: [
        { key: "member.name", label: "Member name", type: "text" },
        { key: "payment.amount", label: "Amount", type: "number" },
      ],
      extra_fields: [
        {
          key: "member.fields.rank",
          label: "Rank",
          type: "ordered",
          options: ["PVT", "PFC", "SPC", "SGT", "SFC", "MSG"],
          orders: [10, 20, 30, 40, 50, 60],
        },
      ],
      provides: ["member"],
    },
  ],
  actions: [
    {
      type: "ledger.reports_to_meeting",
      app: "ledger",
      label: "Add the financial reports to the meeting",
      description: "Builds the board package from OpenLedgerApp and adds it to the meeting.",
      params_schema: {
        as_of: { type: "choice", label: "As of", options: ["last_closed_month", "today", "date"] },
        date: { type: "date", label: "Date", optional: true },
      },
      requires: ["meeting"],
      kind: "job",
      output_schema: [{ key: "summary", label: "What it did", type: "text" }],
    },
    {
      type: "charter.find_members",
      app: "charter",
      label: "Find members",
      description:
        "Look up members, for example everyone whose membership ends in the next 30 days.",
      params_schema: {
        standing: {
          type: "choice",
          label: "Standing",
          options: ["current", "lapsed", "pending", "any"],
        },
        level: { type: "text", label: "Level (optional)", optional: true },
        expires_within_days: {
          type: "int",
          label: "Membership ends within (days, optional)",
          optional: true,
        },
      },
      requires: [],
      kind: "query",
      output_schema: [
        {
          key: "rows",
          label: "Members",
          type: "list",
          fields: [
            { key: "name", label: "Name", type: "text" },
            { key: "email", label: "Email", type: "text" },
            { key: "level", label: "Level", type: "text" },
            { key: "paid_through", label: "Paid through", type: "date" },
            { key: "chapter", label: "Chapter", type: "text" },
          ],
        },
        { key: "count", label: "How many", type: "number" },
      ],
    },
    {
      type: "board.find_meetings",
      app: "board",
      label: "Find board meetings",
      description: "Look up meetings in a window of days.",
      params_schema: {
        to_days: { type: "int", label: "To (days from today)", optional: true },
        status: {
          type: "choice",
          label: "Status",
          options: ["scheduled", "draft", "completed", "any"],
        },
      },
      requires: [],
      kind: "query",
      output_schema: [
        {
          key: "rows",
          label: "Meetings",
          type: "list",
          fields: [
            { key: "id", label: "Meeting", type: "text" },
            { key: "title", label: "Title", type: "text" },
            { key: "date", label: "Date", type: "date" },
          ],
        },
        { key: "count", label: "How many", type: "number" },
      ],
    },
  ],
  recipients: [
    {
      type: "charter.seat",
      app: "charter",
      label: "Whoever holds a board seat",
      description:
        "The current holder of a seat in the member's chapter, its region, or the national.",
      params_schema: {
        seat: { type: "text", label: "Seat (its key, e.g. president)" },
        level: {
          type: "choice",
          label: "Whose seat",
          options: ["unit", "parent", "region", "national"],
        },
      },
      param_options: { seat: ["president", "vice_president", "secretary", "treasurer"] },
    },
    {
      type: "board.office",
      app: "board",
      label: "An officer of the board",
      description: "The chair, the secretary or the treasurer.",
      params_schema: {
        office: { type: "choice", label: "Office", options: ["chair", "secretary", "treasurer"] },
      },
    },
  ],
};
