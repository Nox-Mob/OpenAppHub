// Ready-made workflows (owner direction 2026-11-13): a gallery on the Automations page. Each is an
// ordinary version 2 definition the designer opens for the organization to adjust and save; nothing
// runs until it's saved. A template shows as ready when this database has the apps' triggers and
// steps it uses; one that waits on a feature still to come says which.
import type { DefinitionV2, Step } from "./designer";
import type { Overview } from "./workflows";

export type WorkflowTemplate = {
  id: string;
  name: string;
  description: string;
  /** The apps it uses, for the badges. */
  apps: Array<"charter" | "board" | "ledger" | "hub">;
  definition: DefinitionV2;
  /** Not built yet: the feature it waits for, in words (e.g. elections, C-27). */
  comingWith?: string;
};

const BUILT_IN = new Set([
  "approval",
  "email",
  "task",
  "condition",
  "switch",
  "foreach",
  "scope",
  "init_variable",
  "set_variable",
  "increment_variable",
  "append_variable",
  "compose",
  "filter",
  "select",
  "join",
  "aggregate",
  "wait",
  "terminate",
]);

function stepTypes(steps: Step[], out = new Set<string>()): Set<string> {
  for (const s of steps) {
    out.add(s.type);
    for (const k of ["steps", "then", "else", "default"] as const) {
      const inner = s[k];
      if (Array.isArray(inner)) stepTypes(inner, out);
    }
    for (const c of s.cases ?? []) stepTypes(c.steps ?? [], out);
  }
  return out;
}

function recipientTypes(steps: Step[], out = new Set<string>()): Set<string> {
  for (const s of steps) {
    const to = s.params?.["to"] as { type?: string } | undefined;
    if (to?.type) out.add(to.type);
    for (const k of ["steps", "then", "else", "default"] as const) {
      const inner = s[k];
      if (Array.isArray(inner)) recipientTypes(inner, out);
    }
    for (const c of s.cases ?? []) recipientTypes(c.steps ?? [], out);
  }
  return out;
}

/** What a template needs that this database doesn't have; empty when it's ready. */
export function templateMissing(
  t: WorkflowTemplate,
  o: Pick<Overview, "triggers" | "actions" | "recipients">,
): string[] {
  if (t.comingWith) return [t.comingWith];
  const missing: string[] = [];
  if (!o.triggers.some((x) => x.type === t.definition.trigger.type))
    missing.push(t.definition.trigger.type);
  for (const type of stepTypes(t.definition.steps))
    if (!BUILT_IN.has(type) && !o.actions.some((a) => a.type === type)) missing.push(type);
  for (const type of recipientTypes(t.definition.steps))
    if (
      !["role", "user", "subject", "address"].includes(type) &&
      !o.recipients.some((r) => r.type === type)
    )
      missing.push(type);
  return missing;
}

/** A fresh copy, so editing one never changes the gallery. */
export function templateDefinition(t: WorkflowTemplate): DefinitionV2 {
  return structuredClone(t.definition);
}

export const TEMPLATES: WorkflowTemplate[] = [
  {
    id: "renewal_reminders",
    name: "Renewal reminders",
    description:
      "Every Monday, email each member whose membership ends in the coming week, with a link to renew. Change the day, the window or the message to suit you.",
    apps: ["charter"],
    definition: {
      version: 2,
      trigger: { type: "core.schedule", params: { frequency: "weekly", day: 1, hour: 9 } },
      steps: [
        {
          id: "ending",
          name: "Members whose membership ends this week",
          type: "charter.find_members",
          params: { standing: "current", expires_within_days: 6 },
        },
        {
          id: "each",
          name: "Each of them",
          type: "foreach",
          params: { items: "{{steps.ending.rows}}" },
          steps: [
            {
              id: "remind",
              name: "Remind them",
              type: "email",
              params: {
                to: { type: "address", email: "{{items.each.email}}" },
                subject: "Your membership ends on {{items.each.paid_through}}",
                message:
                  "Hi {{items.each.name}},\n\nYour {{items.each.level}} membership ends on {{items.each.paid_through}}. Renew in a minute from your member page so nothing lapses.\n\nThank you for being part of us.",
              },
            },
          ],
        },
      ],
    },
  },
  {
    id: "lapse_notice",
    name: "Lapsed membership notice",
    description:
      "When a membership lapses, tell the member, and give the treasurer a task to follow up.",
    apps: ["charter"],
    definition: {
      version: 2,
      trigger: { type: "charter.membership_lapsed", params: {} },
      steps: [
        {
          id: "tell",
          name: "Tell the member",
          type: "email",
          params: {
            to: { type: "subject" },
            subject: "Your membership has lapsed",
            message:
              "Hi {{trigger.member.name}},\n\nYour membership was paid through {{trigger.member.paid_through}} and has now lapsed. You can renew any time from your member page; we'd love to have you back.",
          },
        },
        {
          id: "follow_up",
          name: "Treasurer follows up",
          type: "task",
          params: {
            to: { type: "charter.seat", seat: "treasurer", level: "unit" },
            title: "Follow up with {{trigger.member.name}} (membership lapsed)",
            note: "Paid through {{trigger.member.paid_through}} · {{trigger.member.chapter}}",
          },
        },
      ],
    },
  },
  {
    id: "welcome",
    name: "Welcome new members",
    description: "When someone becomes a member, send them a welcome email from the organization.",
    apps: ["charter"],
    definition: {
      version: 2,
      trigger: { type: "charter.member_joined", params: {} },
      steps: [
        {
          id: "welcome",
          name: "Welcome them",
          type: "email",
          params: {
            to: { type: "subject" },
            subject: "Welcome, {{trigger.member.name}}",
            message:
              "Hi {{trigger.member.name}},\n\nWelcome to {{trigger.member.chapter}}! Your {{trigger.member.level}} membership is active. Reply to this email if there's anything we can help with.",
          },
        },
      ],
    },
  },
  {
    id: "overdue_nudge",
    name: "Nudge overdue action items",
    description:
      "Three days after an action item's due date, remind the person it's assigned to. Change the number of days to suit you.",
    apps: ["board"],
    definition: {
      version: 2,
      trigger: { type: "board.action_item_overdue", params: { days_overdue: 3 } },
      steps: [
        {
          id: "nudge",
          name: "Remind them",
          type: "email",
          params: {
            to: { type: "subject" },
            subject: "Reminder: {{trigger.item.title}}",
            message:
              'Hi {{trigger.item.assignee}},\n\n"{{trigger.item.title}}" was due on {{trigger.item.due_date}}. Mark it done in OpenBoardApp when it\'s finished, or update its due date.',
          },
        },
      ],
    },
  },
  {
    id: "reports_before_meetings",
    name: "Financial reports before each meeting",
    description:
      "Five days before a board meeting, add the financial reports, as of the last closed month, to its packet.",
    apps: ["board", "ledger"],
    definition: {
      version: 2,
      trigger: { type: "board.meeting_upcoming", params: { days_before: 5 } },
      steps: [
        {
          id: "reports",
          name: "Add the reports",
          type: "ledger.reports_to_meeting",
          params: { as_of: "last_closed_month" },
        },
      ],
    },
  },
  {
    id: "loss_warning",
    name: "Warn the treasurer about a loss",
    description:
      "When a month's books are closed, check its totals and, if spending was more than income, email the treasurer.",
    apps: ["ledger", "board"],
    definition: {
      version: 2,
      trigger: { type: "ledger.books_locked", params: {} },
      steps: [
        {
          id: "totals",
          name: "The month's totals",
          type: "ledger.month_totals",
          params: { month: "last_closed_month" },
        },
        {
          id: "loss",
          name: "Was it a loss?",
          type: "condition",
          params: {
            match: "all",
            conditions: [{ left: "{{steps.totals.net}}", op: "lt", right: 0 }],
          },
          then: [
            {
              id: "warn",
              name: "Email the treasurer",
              type: "email",
              params: {
                to: { type: "board.office", office: "treasurer" },
                subject: "{{steps.totals.month_name}} closed at a loss",
                message:
                  "{{steps.totals.month_name}}: income {{steps.totals.income}}, spending {{steps.totals.spending}}, net {{steps.totals.net}} {{steps.totals.currency}}. The reports are in OpenLedgerApp.",
              },
            },
          ],
          else: [],
        },
      ],
    },
  },
  {
    id: "election_results",
    name: "Election results into board terms",
    description:
      "When an election is certified, start the winners' terms in OpenBoardApp and tell them (S-23).",
    apps: ["charter", "board"],
    comingWith: "Coming with elections in OpenCharterApp",
    definition: {
      version: 2,
      trigger: { type: "charter.election_certified", params: {} },
      steps: [],
    },
  },
  {
    id: "award_routing",
    name: "Route award requests for approval",
    description:
      "When an award is requested, send it to the approvers its rules name, in order, and tell the member the outcome.",
    apps: ["charter"],
    comingWith: "Coming with awards in OpenCharterApp",
    definition: { version: 2, trigger: { type: "charter.award_requested", params: {} }, steps: [] },
  },
];
