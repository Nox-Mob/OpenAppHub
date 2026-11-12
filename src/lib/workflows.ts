// Workflows each organization builds (S-25 part 2): the builder's model and plain-language
// summaries. The database checks every workflow again (public._validate_workflow); this keeps
// the editor helpful. Triggers, actions and recipients come from the apps (core 0009 catalog).

export type ParamSpec = {
  type: "int" | "int_list" | "bool" | "text" | "date" | "choice" | "choices";
  label?: string;
  help?: string;
  min?: number;
  max?: number;
  options?: string[];
  optional?: boolean;
};
export type Field = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "choice" | "ordered";
  options?: string[];
  orders?: number[];
};
export type TriggerType = {
  type: string;
  app: string;
  label: string;
  description: string;
  kind: "event" | "scan" | "schedule";
  params_schema: Record<string, ParamSpec>;
  fields: Field[];
  extra_fields: Field[];
  provides: string[];
};
export type ActionType = {
  type: string;
  app: string;
  label: string;
  description: string;
  params_schema: Record<string, ParamSpec>;
  requires: string[];
  /** Core 0012 (S-28): a lookup or an immediate step runs at once; a job is done by the app. */
  kind?: "job" | "query" | "call";
  /** What it gives later steps in the designer. */
  output_schema?: Array<{
    key: string;
    label: string;
    type: "text" | "number" | "date" | "boolean" | "list" | "object" | "any";
    fields?: Array<{
      key: string;
      label: string;
      type: "text" | "number" | "date" | "boolean" | "list" | "object" | "any";
    }>;
  }>;
};
export type RecipientType = {
  type: string;
  app: string;
  label: string;
  description: string;
  params_schema: Record<string, ParamSpec>;
  /** Choices the app offers for its settings in this organization (e.g. its board seats). */
  param_options?: Record<string, string[]>;
};

export type Op =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "between"
  | "in"
  | "contains"
  | "is_empty"
  | "is_not_empty";
export type Condition = {
  field: string;
  op: Op;
  value?: unknown;
  value2?: unknown;
  order?: number;
  order2?: number;
};
export type Recipient = { type: string } & Record<string, unknown>;
export type Action = { type: string } & Record<string, unknown>;
export type Branch = { match: "all" | "any"; conditions: Condition[]; actions: Action[] };
export type Definition = {
  trigger: { type: string; params: Record<string, unknown> };
  always: Action[];
  branches: Branch[];
  otherwise: Action[];
};

export type Workflow = {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  shared: boolean;
  adopted_from: string | null;
  definition: Definition;
  source_name: string | null;
  source_active: boolean;
  updated_at: string;
  last_run: { at: string; status: string; branch: string | null } | null;
};
export type Overview = {
  can_edit: boolean;
  can_manage_editors: boolean;
  may_build: boolean;
  is_chapter: boolean;
  has_chapters: boolean;
  chapters_may_build: boolean;
  workflows: Workflow[];
  shared_by_parent: Array<{
    id: string;
    name: string;
    description: string;
    definition: Definition;
    in_use: boolean;
  }>;
  editors: Array<{ user_id: string; name: string; email: string }>;
  triggers: TriggerType[];
  actions: ActionType[];
  recipients: RecipientType[];
  members: Array<{ user_id: string; name: string; role: string }>;
};

export const OP_LABELS: Record<Op, string> = {
  eq: "is",
  ne: "is not",
  lt: "is less than",
  lte: "is at most",
  gt: "is more than",
  gte: "is at least",
  between: "is between",
  in: "is one of",
  contains: "contains",
  is_empty: "is empty",
  is_not_empty: "is filled in",
};

/** The comparisons that make sense for a field. */
export function opsFor(field: Field | undefined): Op[] {
  switch (field?.type) {
    case "number":
    case "date":
      return ["eq", "ne", "lt", "lte", "gt", "gte", "between", "is_empty", "is_not_empty"];
    case "ordered":
      // Ordered lists (like rank) compare by their place in the list.
      return ["eq", "ne", "lte", "gte", "between", "in", "is_empty", "is_not_empty"];
    case "choice":
      return ["eq", "ne", "in", "is_empty", "is_not_empty"];
    case "boolean":
      return ["eq"];
    default:
      return ["eq", "ne", "contains", "in", "is_empty", "is_not_empty"];
  }
}

export function fieldsOf(t: TriggerType | undefined): Field[] {
  return t ? [...t.fields, ...(t.extra_fields ?? [])] : [];
}

/** A condition with its ordered values' places filled in (so "rank ≤ PFC" compares by rank). */
export function withOrder(c: Condition, field: Field | undefined): Condition {
  if (field?.type !== "ordered" || !field.options) {
    const rest = { ...c };
    delete rest.order;
    delete rest.order2;
    return rest;
  }
  const place = (v: unknown) => {
    const i = field.options!.indexOf(String(v ?? ""));
    if (i < 0) return undefined;
    return field.orders?.[i] ?? i;
  };
  const out: Condition = { ...c };
  const o = place(c.value);
  const o2 = place(c.value2);
  if (o !== undefined) out.order = o;
  else delete out.order;
  if (o2 !== undefined) out.order2 = o2;
  else delete out.order2;
  return out;
}

export function emptyDefinition(triggerType = ""): Definition {
  return { trigger: { type: triggerType, params: {} }, always: [], branches: [], otherwise: [] };
}

export function emptyAction(type: string): Action {
  if (type === "email")
    return { type, to: { type: "role", roles: ["owner", "admin"] }, subject: "", message: "" };
  if (type === "task") return { type, to: { type: "role", roles: ["owner"] }, title: "", note: "" };
  return { type };
}

const ROLE_WORDS: Record<string, string> = {
  owner: "owners",
  admin: "admins",
  member: "members",
  viewer: "viewers",
};

export function describeRecipient(
  r: Recipient | undefined,
  o: Pick<Overview, "recipients" | "members">,
): string {
  if (!r) return "nobody yet";
  if (r.type === "role")
    return `the organization's ${((r["roles"] as string[]) ?? []).map((x) => ROLE_WORDS[x] ?? x).join(" and ")}`;
  if (r.type === "subject") return "the person it's about";
  if (r.type === "user")
    return o.members.find((m) => m.user_id === r["user_id"])?.name ?? "a person";
  if (r.type === "charter.seat") {
    const whose: Record<string, string> = {
      unit: "their chapter's",
      parent: "the level above's",
      region: "their region's",
      national: "the national's",
    };
    return `${whose[String(r["level"] ?? "unit")] ?? ""} ${String(r["seat"] ?? "seat").replace(/_/g, " ")}`.trim();
  }
  if (r.type === "board.office") return `the board's ${String(r["office"] ?? "officer")}`;
  return o.recipients.find((x) => x.type === r.type)?.label ?? r.type;
}

function describeValue(c: Condition): string {
  const v = Array.isArray(c.value) ? (c.value as unknown[]).join(", ") : String(c.value ?? "");
  if (c.op === "between") return `${v} and ${String(c.value2 ?? "")}`;
  return v;
}

export function describeCondition(c: Condition, fields: Field[]): string {
  const label = fields.find((f) => f.key === c.field)?.label ?? c.field;
  if (c.op === "is_empty" || c.op === "is_not_empty") return `${label} ${OP_LABELS[c.op]}`;
  return `${label} ${OP_LABELS[c.op]} ${describeValue(c)}`;
}

export function describeAction(
  a: Action,
  o: Pick<Overview, "actions" | "recipients" | "members">,
): string {
  if (a.type === "email") return `email ${describeRecipient(a["to"] as Recipient, o)}`;
  if (a.type === "task") return `give ${describeRecipient(a["to"] as Recipient, o)} a task`;
  const t = o.actions.find((x) => x.type === a.type);
  const label = (t?.label ?? a.type).replace(/^./, (c) => c.toLowerCase());
  if (a.type === "ledger.reports_to_meeting") {
    const asOf =
      a["as_of"] === "date"
        ? `as of ${String(a["date"] ?? "a date")}`
        : a["as_of"] === "today"
          ? "as of today"
          : "as of the last closed month";
    return `${label}, ${asOf}`;
  }
  return label;
}

/** One sentence per part: "When …", "If … then …", "Otherwise …". */
export function describeWorkflow(d: Definition, o: Overview): string[] {
  const t = o.triggers.find((x) => x.type === d.trigger.type);
  const fields = fieldsOf(t);
  const p = d.trigger.params;
  let when = t?.label ?? "Choose what starts it";
  if (d.trigger.type === "board.meeting_upcoming")
    when = `A board meeting is ${String(p["days_before"] ?? "?")} days away or less`;
  if (d.trigger.type === "board.action_item_overdue")
    when = `An action item is ${String(p["days_overdue"] ?? "?")} days overdue`;
  if (d.trigger.type === "core.schedule") {
    const f = String(p["frequency"] ?? "daily");
    const days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const at = `at ${String(p["hour"] ?? 7)}:00`;
    when =
      f === "weekly"
        ? `Every ${days[Number(p["day"] ?? 1)] ?? "week"} ${at}`
        : f === "monthly"
          ? `Every month on day ${String(p["day"] ?? 1)} ${at}`
          : `Every day ${at}`;
  }
  const out = [`When: ${when}.`];
  const list = (as: Action[]) => as.map((a) => describeAction(a, o)).join(", then ");
  if (d.always.length) out.push(`Always: ${list(d.always)}.`);
  d.branches.forEach((b, i) => {
    const conds = b.conditions
      .map((c) => describeCondition(c, fields))
      .join(b.match === "any" ? " or " : " and ");
    out.push(
      `${i === 0 ? "If" : "Else if"} ${conds}: ${b.actions.length ? list(b.actions) : "do nothing"}.`,
    );
  });
  if (d.otherwise.length)
    out.push(`${d.branches.length ? "Otherwise" : "Then"}: ${list(d.otherwise)}.`);
  return out;
}

/** Problems the editor can point at before saving (the database checks again). */
export function draftProblems(name: string, d: Definition, o: Overview): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push("Give the workflow a name.");
  const t = o.triggers.find((x) => x.type === d.trigger.type);
  if (!t) out.push("Choose what starts it (When).");
  if (t)
    for (const [k, s] of Object.entries(t.params_schema)) {
      if (
        s.optional ||
        (t.type === "core.schedule" && k === "day" && d.trigger.params["frequency"] === "daily")
      )
        continue;
      if (d.trigger.params[k] === undefined || d.trigger.params[k] === "")
        out.push(`Fill in "${s.label ?? k}".`);
    }
  const all = [...d.always, ...d.branches.flatMap((b) => b.actions), ...d.otherwise];
  if (all.length === 0) out.push("Add at least one thing to do (Then).");
  d.branches.forEach((b, i) => {
    if (b.conditions.length === 0) out.push(`If #${i + 1}: add a condition.`);
  });
  for (const a of all) {
    const need = o.actions.find((x) => x.type === a.type)?.requires ?? [];
    if (t && need.some((n) => !t.provides.includes(n)))
      out.push(
        `"${o.actions.find((x) => x.type === a.type)?.label}" needs a When with a ${need.join(", ")}.`,
      );
    if (
      a.type === "email" &&
      (!String(a["subject"] ?? "").trim() || !String(a["message"] ?? "").trim())
    )
      out.push("Every email needs a subject and a message.");
    if (a.type === "task" && !String(a["title"] ?? "").trim())
      out.push("Every task needs a title.");
  }
  return [...new Set(out)];
}

/** {{placeholders}} a message may use with this trigger. */
export function placeholders(t: TriggerType | undefined): string[] {
  return fieldsOf(t).map((f) => `{{${f.key}}}`);
}
