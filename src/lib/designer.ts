// The low-code designer's model (S-28): version 2 workflows, the step catalog, the data each step
// can use (Power Automate's "dynamic content"), tree editing, plain-language summaries, and
// opening a When → If → Then workflow in the designer. The database checks every workflow again
// (public._validate_workflow_v2) and runs it (core 0012).
import type { Definition, Field, Overview, ParamSpec, TriggerType } from "./workflows";
import { fieldsOf } from "./workflows";

export type RunAfterStatus = "succeeded" | "failed" | "skipped";
export type Retry = { count: number; interval_minutes: number; backoff: "fixed" | "exponential" };
export type Cond = {
  left: unknown;
  op: string;
  right?: unknown;
  right2?: unknown;
  ordered?: string[];
};
export type Step = {
  id: string;
  type: string;
  name?: string;
  params?: Record<string, unknown>;
  run_after?: Record<string, RunAfterStatus[]>;
  retry?: Retry;
  context?: Record<string, unknown>;
  then?: Step[];
  else?: Step[];
  cases?: Array<{ equals: unknown; steps: Step[] }>;
  default?: Step[];
  steps?: Step[];
};
export type DefinitionV2 = {
  version: 2;
  trigger: { type: string; params: Record<string, unknown> };
  steps: Step[];
};

export type OutputField = {
  key: string;
  label: string;
  type: "text" | "number" | "date" | "boolean" | "list" | "object" | "any";
  fields?: OutputField[];
};

export const isV2 = (d: unknown): d is DefinitionV2 =>
  !!d && typeof d === "object" && (d as { version?: unknown }).version === 2;

/** The engine's own steps, in the order the "add a step" menu shows them. */
export type CoreStep = {
  type: string;
  label: string;
  group: "Do" | "Decide and repeat" | "Data" | "Variables" | "Time and flow";
  description: string;
  container?: boolean;
};
export const CORE_STEPS: CoreStep[] = [
  {
    type: "email",
    label: "Send an email",
    group: "Do",
    description: "To roles, seats, an address, or everyone in a list.",
  },
  {
    type: "task",
    label: "Give someone a task",
    group: "Do",
    description: "A task on their OpenAppHub dashboard.",
  },
  {
    type: "condition",
    label: "Condition (if / otherwise)",
    group: "Decide and repeat",
    description: "Do one set of steps if something is true, another if not.",
    container: true,
  },
  {
    type: "switch",
    label: "Switch (cases)",
    group: "Decide and repeat",
    description: "Pick a set of steps by a value, like a member's level.",
    container: true,
  },
  {
    type: "foreach",
    label: "For each",
    group: "Decide and repeat",
    description: "Repeat steps for every item in a list, like a lookup's members.",
    container: true,
  },
  {
    type: "scope",
    label: "Group (scope)",
    group: "Decide and repeat",
    description: "Group steps, for example to handle a failure in any of them.",
    container: true,
  },
  {
    type: "compose",
    label: "Compose a value",
    group: "Data",
    description: "Build text or a value once and use it later.",
  },
  {
    type: "filter",
    label: "Filter a list",
    group: "Data",
    description: "Keep only the items that match.",
  },
  {
    type: "select",
    label: "Reshape a list",
    group: "Data",
    description: "Make a new list with the fields you choose.",
  },
  {
    type: "join",
    label: "Join a list into text",
    group: "Data",
    description: "For example names separated by commas.",
  },
  {
    type: "aggregate",
    label: "Count, sum, min, max",
    group: "Data",
    description: "Count a list or add up a field.",
  },
  {
    type: "init_variable",
    label: "Make a variable",
    group: "Variables",
    description: "A value steps can change, like a running total.",
  },
  { type: "set_variable", label: "Set a variable", group: "Variables", description: "" },
  { type: "increment_variable", label: "Add to a variable", group: "Variables", description: "" },
  {
    type: "append_variable",
    label: "Append to a variable",
    group: "Variables",
    description: "Add an item to a list variable, or text to a text one.",
  },
  {
    type: "wait",
    label: "Wait",
    group: "Time and flow",
    description: "Pause for a while, or until a date.",
  },
  {
    type: "terminate",
    label: "Stop the run",
    group: "Time and flow",
    description: "End here, as succeeded or failed.",
  },
];
export const coreStep = (type: string) => CORE_STEPS.find((c) => c.type === type);

export const CONTAINER_TYPES = new Set(["condition", "switch", "foreach", "scope"]);

/** Default settings for a new step. */
export function newStep(type: string, id: string): Step {
  const s: Step = { id, type, params: {} };
  switch (type) {
    case "email":
      s.params = { to: { type: "role", roles: ["owner", "admin"] }, subject: "", message: "" };
      break;
    case "task":
      s.params = { to: { type: "role", roles: ["owner"] }, title: "", note: "" };
      break;
    case "condition":
      s.params = { match: "all", conditions: [{ left: "", op: "eq", right: "" }] };
      s.then = [];
      s.else = [];
      break;
    case "switch":
      s.params = { on: "" };
      s.cases = [{ equals: "", steps: [] }];
      s.default = [];
      break;
    case "foreach":
      s.params = { items: "" };
      s.steps = [];
      break;
    case "scope":
      s.steps = [];
      break;
    case "init_variable":
      s.params = { name: "", kind: "number", value: 0 };
      break;
    case "filter":
      s.params = {
        items: "",
        match: "all",
        conditions: [{ left: "{{item.}}", op: "eq", right: "" }],
      };
      break;
    case "select":
      s.params = { items: "", map: { name: "{{item.name}}" } };
      break;
    case "join":
      s.params = { items: "", field: "", separator: ", " };
      break;
    case "aggregate":
      s.params = { items: "", op: "count", field: "" };
      break;
    case "wait":
      s.params = { mode: "duration", amount: 1, unit: "days" };
      break;
    case "terminate":
      s.params = { status: "succeeded", message: "" };
      break;
  }
  return s;
}

// ── The tree ───────────────────────────────────────────────────────────────────────────────────
/** Where a list of steps lives: [] is the top; ["s1", "then"] the "if yes" of step s1;
 * ["sw", "cases", "0"] case 1 of a switch. */
export type ListPath = string[];

export function getList(steps: Step[], path: ListPath): Step[] {
  if (path.length === 0) return steps;
  const [id, branch, idx] = path;
  const s = findStep(steps, id!);
  if (!s) return [];
  let list: Step[] | undefined;
  if (branch === "cases") list = s.cases?.[Number(idx)]?.steps;
  else list = s[branch as "then" | "else" | "default" | "steps"];
  return getList(list ?? [], path.slice(branch === "cases" ? 3 : 2));
}

/** Every step in order (the order the engine runs and references must follow). */
export function walk(
  steps: Step[],
  visit: (s: Step, parents: Step[]) => void,
  parents: Step[] = [],
) {
  for (const s of steps) {
    visit(s, parents);
    const kids = [
      ...(s.then ?? []),
      ...(s.else ?? []),
      ...(s.cases ?? []).flatMap((c) => c.steps),
      ...(s.default ?? []),
      ...(s.steps ?? []),
    ];
    if (kids.length) {
      for (const list of childLists(s)) walk(list, visit, [...parents, s]);
    }
  }
}

function childLists(s: Step): Step[][] {
  return [s.then, s.else, ...(s.cases ?? []).map((c) => c.steps), s.default, s.steps].filter(
    (x): x is Step[] => Array.isArray(x),
  );
}

export function findStep(steps: Step[], id: string): Step | undefined {
  let found: Step | undefined;
  walk(steps, (s) => {
    if (s.id === id) found = s;
  });
  return found;
}

export function allIds(steps: Step[]): string[] {
  const out: string[] = [];
  walk(steps, (s) => out.push(s.id));
  return out;
}

/** A short id from a label: "Find members" → find_members, then find_members_2, … */
export function newId(steps: Step[], base: string): string {
  const stem =
    base
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^([^a-z])/, "s_$1")
      .slice(0, 30) || "step";
  const taken = new Set(allIds(steps));
  if (!taken.has(stem)) return stem;
  for (let i = 2; ; i++) if (!taken.has(`${stem}_${i}`)) return `${stem}_${i}`;
}

const clone = <T>(x: T): T => structuredClone(x);

/** A new tree with one list replaced. */
function withList(steps: Step[], path: ListPath, fn: (list: Step[]) => Step[]): Step[] {
  if (path.length === 0) return fn(steps);
  const [id, branch, idx] = path;
  const rest = path.slice(branch === "cases" ? 3 : 2);
  return steps.map((s) => {
    if (s.id !== id) {
      const kids = childLists(s);
      if (!kids.length) return s;
      // The step may be deeper down.
      const copy = { ...s };
      if (copy.then) copy.then = withList(copy.then, path, fn);
      if (copy.else) copy.else = withList(copy.else, path, fn);
      if (copy.cases)
        copy.cases = copy.cases.map((c) => ({ ...c, steps: withList(c.steps, path, fn) }));
      if (copy.default) copy.default = withList(copy.default, path, fn);
      if (copy.steps) copy.steps = withList(copy.steps, path, fn);
      return copy;
    }
    const copy = { ...s };
    if (branch === "cases") {
      copy.cases = (copy.cases ?? []).map((c, i) =>
        i === Number(idx) ? { ...c, steps: withList(c.steps, rest, fn) } : c,
      );
    } else {
      const key = branch as "then" | "else" | "default" | "steps";
      copy[key] = withList(copy[key] ?? [], rest, fn);
    }
    return copy;
  });
}

export function insertStep(steps: Step[], path: ListPath, index: number, step: Step): Step[] {
  return withList(steps, path, (list) => [...list.slice(0, index), step, ...list.slice(index)]);
}

export function updateStep(steps: Step[], id: string, patch: (s: Step) => Step): Step[] {
  return steps.map((s) => {
    if (s.id === id) return patch(clone(s));
    if (!childLists(s).length) return s;
    const copy = { ...s };
    if (copy.then) copy.then = updateStep(copy.then, id, patch);
    if (copy.else) copy.else = updateStep(copy.else, id, patch);
    if (copy.cases)
      copy.cases = copy.cases.map((c) => ({ ...c, steps: updateStep(c.steps, id, patch) }));
    if (copy.default) copy.default = updateStep(copy.default, id, patch);
    if (copy.steps) copy.steps = updateStep(copy.steps, id, patch);
    return copy;
  });
}

export function removeStep(steps: Step[], id: string): Step[] {
  return steps
    .filter((s) => s.id !== id)
    .map((s) => {
      const copy = { ...s };
      if (copy.then) copy.then = removeStep(copy.then, id);
      if (copy.else) copy.else = removeStep(copy.else, id);
      if (copy.cases)
        copy.cases = copy.cases.map((c) => ({ ...c, steps: removeStep(c.steps, id) }));
      if (copy.default) copy.default = removeStep(copy.default, id);
      if (copy.steps) copy.steps = removeStep(copy.steps, id);
      // Run after: a removed sibling no longer applies.
      if (copy.run_after && id in copy.run_after) {
        const ra = { ...copy.run_after };
        delete ra[id];
        copy.run_after = Object.keys(ra).length ? ra : undefined;
      }
      return copy;
    });
}

/** Where a step is: its list's path and its index there. */
export function locate(
  steps: Step[],
  id: string,
  path: ListPath = [],
): { path: ListPath; index: number } | null {
  const i = steps.findIndex((s) => s.id === id);
  if (i >= 0) return { path, index: i };
  for (const s of steps) {
    const lists: Array<[ListPath, Step[] | undefined]> = [
      [[s.id, "then"], s.then],
      [[s.id, "else"], s.else],
      ...(s.cases ?? []).map((c, ci): [ListPath, Step[]] => [[s.id, "cases", String(ci)], c.steps]),
      [[s.id, "default"], s.default],
      [[s.id, "steps"], s.steps],
    ];
    for (const [p, list] of lists) {
      if (!list) continue;
      const r = locate(list, id, [...path, ...p]);
      if (r) return r;
    }
  }
  return null;
}

/** Moves a step to another place (drag and drop). Refuses to move a step into itself. */
export function moveStep(steps: Step[], id: string, toPath: ListPath, toIndex: number): Step[] {
  if (toPath.includes(id)) return steps;
  const from = locate(steps, id);
  const step = findStep(steps, id);
  if (!from || !step) return steps;
  let index = toIndex;
  if (from.path.join("/") === toPath.join("/") && from.index < toIndex) index -= 1;
  const without = withList(steps, from.path, (list) => list.filter((s) => s.id !== id));
  return insertStep(without, toPath, index, step);
}

// ── Data a step can use ────────────────────────────────────────────────────────────────────────
export type DataItem = {
  token: string;
  label: string;
  type: OutputField["type"];
  fields?: OutputField[];
};
export type DataGroup = { label: string; items: DataItem[] };

const fieldType = (t: Field["type"]): OutputField["type"] =>
  t === "number" ? "number" : t === "date" ? "date" : t === "boolean" ? "boolean" : "text";

/** What a step gives later steps. */
export function outputsOf(s: Step, o: Pick<Overview, "actions">, steps: Step[]): OutputField[] {
  switch (s.type) {
    case "email":
      return [{ key: "count", label: "People emailed", type: "number" }];
    case "task":
      return [{ key: "count", label: "Tasks created", type: "number" }];
    case "condition":
      return [{ key: "result", label: "Result (yes or no)", type: "boolean" }];
    case "foreach":
      return [{ key: "count", label: "Items gone through", type: "number" }];
    case "compose":
      return [{ key: "value", label: "Value", type: "any" }];
    case "filter":
    case "select": {
      const fields =
        s.type === "filter"
          ? listFieldsOf(String(s.params?.["items"] ?? ""), steps, o)
          : Object.keys((s.params?.["map"] as Record<string, unknown>) ?? {}).map((k) => ({
              key: k,
              label: k,
              type: "any" as const,
            }));
      return [
        {
          key: "items",
          label: s.type === "filter" ? "Kept items" : "New list",
          type: "list",
          fields,
        },
        { key: "count", label: "How many", type: "number" },
      ];
    }
    case "join":
      return [{ key: "text", label: "Text", type: "text" }];
    case "aggregate":
      return [{ key: "value", label: "Result", type: "number" }];
    case "init_variable":
    case "set_variable":
    case "increment_variable":
    case "append_variable":
    case "wait":
    case "terminate":
    case "scope":
    case "switch":
      return [];
    default: {
      const t = o.actions.find((a) => a.type === s.type) as
        (Overview["actions"][number] & { output_schema?: OutputField[] }) | undefined;
      return t?.output_schema ?? [];
    }
  }
}

/** The fields of a list a reference points at, e.g. {{steps.find.rows}} → name, email, … */
export function listFieldsOf(
  ref: string,
  steps: Step[],
  o: Pick<Overview, "actions">,
): OutputField[] {
  const m = /^\s*\{\{\s*steps\.([a-z0-9_]+)\.([a-z0-9_]+)\s*\}\}\s*$/.exec(ref);
  if (!m) return [];
  const s = findStep(steps, m[1]!);
  if (!s) return [];
  return outputsOf(s, o, steps).find((f) => f.key === m[2])?.fields ?? [];
}

/**
 * Everything a step can use, grouped: the trigger's data, each earlier step's outputs, the items
 * of the "for each" loops it's in, and the variables made before it.
 */
export function availableData(
  def: DefinitionV2,
  stepId: string | null,
  o: Pick<Overview, "actions" | "triggers">,
): DataGroup[] {
  const groups: DataGroup[] = [];
  const t: TriggerType | undefined = o.triggers.find((x) => x.type === def.trigger.type);
  const trig = fieldsOf(t).map((f): DataItem => ({
    token: `{{trigger.${f.key}}}`,
    label: f.label,
    type: fieldType(f.type),
  }));
  if (trig.length) groups.push({ label: t?.label ?? "When", items: trig });

  // Steps before this one in run order, and the loops it's inside.
  const before: Step[] = [];
  let loops: Step[] = [];
  let reached = false;
  walk(def.steps, (s, parents) => {
    if (reached) return;
    if (s.id === stepId) {
      reached = true;
      loops = parents.filter((p) => p.type === "foreach");
      return;
    }
    before.push(s);
  });
  for (const loop of loops.slice().reverse()) {
    const fields = listFieldsOf(String(loop.params?.["items"] ?? ""), def.steps, o);
    const items: DataItem[] = [
      { token: `{{items.${loop.id}}}`, label: "The current item", type: "object", fields },
      ...fields.map((f) => ({
        token: `{{items.${loop.id}.${f.key}}}`,
        label: f.label,
        type: f.type,
        ...(f.fields ? { fields: f.fields } : {}),
      })),
      {
        token: `{{loop.${loop.id}.number}}`,
        label: "Which one (1, 2, 3…)",
        type: "number" as const,
      },
    ];
    groups.push({ label: `Each item of "${loop.name || loop.id}"`, items });
  }
  const vars: DataItem[] = [];
  for (const s of before) {
    if (s.type === "init_variable" && s.params?.["name"]) {
      vars.push({
        token: `{{vars.${String(s.params["name"])}}}`,
        label: String(s.params["name"]),
        type:
          s.params["kind"] === "list" ? "list" : s.params["kind"] === "number" ? "number" : "text",
      });
    }
    // A step's outputs are usable once it has run: not those of a container the step is inside.
    if (loops.some((l) => l.id === s.id)) continue;
    const outs = outputsOf(s, o, def.steps);
    if (outs.length)
      groups.push({
        label: s.name || stepLabel(s, o),
        items: outs.map((f) => ({
          token: `{{steps.${s.id}.${f.key}}}`,
          label: f.label,
          type: f.type,
          ...(f.fields ? { fields: f.fields } : {}),
        })),
      });
  }
  if (vars.length) groups.push({ label: "Variables", items: vars });
  groups.push({
    label: "This run",
    items: [{ token: "{{today}}", label: "Today's date", type: "date" }],
  });
  return groups;
}

/** A reference as words: {{steps.find.rows}} → "Find members → Members". */
export function describeToken(
  token: string,
  def: DefinitionV2,
  o: Pick<Overview, "actions" | "triggers">,
): string {
  const m = /^\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/.exec(token.trim());
  if (!m) return token;
  const parts = m[1]!.split(".");
  if (parts[0] === "trigger") {
    const t = o.triggers.find((x) => x.type === def.trigger.type);
    const f = fieldsOf(t).find((x) => x.key === parts.slice(1).join("."));
    return f ? f.label : parts.slice(1).join(".");
  }
  if (parts[0] === "steps") {
    const s = findStep(def.steps, parts[1] ?? "");
    if (!s) return `(missing step ${parts[1]})`;
    const f = outputsOf(s, o, def.steps).find((x) => x.key === parts[2]);
    return `${s.name || stepLabel(s, o)} → ${f?.label ?? parts.slice(2).join(".")}`;
  }
  if (parts[0] === "items" || parts[0] === "item") {
    // A loop's item: name the loop and the field ("Each of Find members → Email").
    const loop = parts[0] === "items" ? findStep(def.steps, parts[1] ?? "") : undefined;
    const fieldKey = parts.slice(parts[0] === "items" ? 2 : 1).join(".");
    const fields = loop ? listFieldsOf(String(loop.params?.["items"] ?? ""), def.steps, o) : [];
    const source = loop ? describeToken(String(loop.params?.["items"] ?? ""), def, o) : "";
    const field = fields.find((f) => f.key === fieldKey)?.label ?? fieldKey;
    const whose = loop
      ? `Each of ${source.includes("→") ? source.split("→")[0]!.trim() : loop.name || loop.id}`
      : "Each item";
    return fieldKey ? `${whose} → ${field}` : whose;
  }
  if (parts[0] === "vars") return `Variable ${parts[1]}`;
  if (parts[0] === "loop") return "Which one";
  if (parts[0] === "today") return "Today";
  return m[1]!;
}

export function stepLabel(s: Step, o: Pick<Overview, "actions">): string {
  return coreStep(s.type)?.label ?? o.actions.find((a) => a.type === s.type)?.label ?? s.type;
}

/** The references a value uses, in order. */
export function tokensIn(v: unknown): string[] {
  const text = typeof v === "string" ? v : JSON.stringify(v ?? "");
  return [...text.matchAll(/\{\{\s*[A-Za-z0-9_.]+\s*\}\}/g)].map((m) => m[0]);
}

/** Problems to point at before saving (the database checks again). */
export function designerProblems(
  name: string,
  def: DefinitionV2,
  o: Pick<Overview, "actions" | "triggers">,
): string[] {
  const out: string[] = [];
  if (!name.trim()) out.push("Give the workflow a name.");
  const t = o.triggers.find((x) => x.type === def.trigger.type);
  if (!t) out.push("Choose what starts it (When).");
  if (t)
    for (const [k, spec] of Object.entries(t.params_schema)) {
      if (
        spec.optional ||
        (t.type === "core.schedule" && k === "day" && def.trigger.params["frequency"] === "daily")
      )
        continue;
      if (def.trigger.params[k] === undefined || def.trigger.params[k] === "")
        out.push(`Fill in "${spec.label ?? k}" (When).`);
    }
  if (def.steps.length === 0) out.push("Add at least one step.");
  const seen: string[] = [];
  const vars: string[] = [];
  walk(def.steps, (s, parents) => {
    const label = s.name || stepLabel(s, o);
    for (const tok of tokensIn({ p: s.params, c: s.context })) {
      const m = /\{\{\s*(steps|items|vars)\.([A-Za-z0-9_]+)/.exec(tok);
      if (!m) continue;
      if (m[1] === "steps" && !seen.includes(m[2]!))
        out.push(`"${label}" uses a step that comes after it.`);
      if (m[1] === "items" && !parents.some((p) => p.type === "foreach" && p.id === m[2]))
        out.push(`"${label}" uses a loop's items outside that loop.`);
      if (m[1] === "vars" && !vars.includes(m[2]!) && s.type !== "init_variable")
        out.push(`"${label}" uses variable "${m[2]}" before it's made.`);
    }
    if (s.type === "init_variable") {
      if (parents.length)
        out.push(
          `Make variables at the top, not inside "${parents.at(-1)!.name || parents.at(-1)!.id}".`,
        );
      if (!/^[a-z][a-z0-9_]*$/.test(String(s.params?.["name"] ?? "")))
        out.push("Every variable needs a name (lowercase, no spaces).");
      else vars.push(String(s.params?.["name"]));
    }
    if (
      ["set_variable", "increment_variable", "append_variable"].includes(s.type) &&
      !vars.includes(String(s.params?.["name"] ?? ""))
    )
      out.push(`"${label}" changes a variable before it's made.`);
    if (
      ["foreach", "filter", "select", "join", "aggregate"].includes(s.type) &&
      !String(s.params?.["items"] ?? "").trim()
    )
      out.push(`"${label}" needs a list.`);
    if (
      s.type === "email" &&
      (!String(s.params?.["subject"] ?? "").trim() || !String(s.params?.["message"] ?? "").trim())
    )
      out.push(`"${label}" needs a subject and a message.`);
    if (s.type === "task" && !String(s.params?.["title"] ?? "").trim())
      out.push(`"${label}" needs a title.`);
    const at = o.actions.find((a) => a.type === s.type);
    if (at)
      for (const [k, spec] of Object.entries(at.params_schema as Record<string, ParamSpec>))
        if (!spec.optional && (s.params?.[k] === undefined || s.params?.[k] === ""))
          out.push(`"${label}": fill in "${spec.label ?? k}".`);
    seen.push(s.id);
  });
  return [...new Set(out)];
}

/** One line per step, indented, for "In plain words". */
export function describeSteps(
  steps: Step[],
  def: DefinitionV2,
  o: Pick<Overview, "actions" | "triggers">,
  depth = 0,
): string[] {
  const pad = "  ".repeat(depth);
  const out: string[] = [];
  const words = (v: unknown) =>
    String(v ?? "").replace(
      /\{\{\s*[A-Za-z0-9_.]+\s*\}\}/g,
      (tok) => `[${describeToken(tok, def, o)}]`,
    );
  for (const s of steps) {
    const p = s.params ?? {};
    const name = s.name ? `${s.name}: ` : "";
    switch (s.type) {
      case "condition": {
        const conds = ((p["conditions"] as Cond[]) ?? []).map((c) =>
          `${words(c.left)} ${c.op} ${words(c.right)}`.trim(),
        );
        out.push(`${pad}${name}If ${conds.join(p["match"] === "any" ? " or " : " and ") || "…"}:`);
        out.push(...describeSteps(s.then ?? [], def, o, depth + 1));
        if (s.else?.length) {
          out.push(`${pad}Otherwise:`);
          out.push(...describeSteps(s.else, def, o, depth + 1));
        }
        break;
      }
      case "switch":
        out.push(`${pad}${name}Depending on ${words(p["on"])}:`);
        (s.cases ?? []).forEach((c) => {
          out.push(`${pad}  When ${words(c.equals)}:`);
          out.push(...describeSteps(c.steps, def, o, depth + 2));
        });
        if (s.default?.length) {
          out.push(`${pad}  Anything else:`);
          out.push(...describeSteps(s.default, def, o, depth + 2));
        }
        break;
      case "foreach":
        out.push(`${pad}${name}For each item in ${words(p["items"]) || "…"}:`);
        out.push(...describeSteps(s.steps ?? [], def, o, depth + 1));
        break;
      case "scope":
        out.push(`${pad}${name}Group:`);
        out.push(...describeSteps(s.steps ?? [], def, o, depth + 1));
        break;
      case "email":
        out.push(`${pad}${name}Email "${words(p["subject"])}"`);
        break;
      case "task":
        out.push(`${pad}${name}Task "${words(p["title"])}"`);
        break;
      case "wait":
        out.push(
          `${pad}${name}Wait ${p["mode"] === "until" ? `until ${words(p["until"])}` : `${String(p["amount"] ?? 1)} ${String(p["unit"] ?? "days")}`}`,
        );
        break;
      case "init_variable":
        out.push(`${pad}${name}Make variable ${String(p["name"] ?? "")} = ${words(p["value"])}`);
        break;
      case "set_variable":
        out.push(`${pad}${name}Set ${String(p["name"] ?? "")} to ${words(p["value"])}`);
        break;
      case "increment_variable":
        out.push(`${pad}${name}Add ${words(p["by"] ?? 1)} to ${String(p["name"] ?? "")}`);
        break;
      case "append_variable":
        out.push(`${pad}${name}Append ${words(p["value"])} to ${String(p["name"] ?? "")}`);
        break;
      default:
        out.push(`${pad}${s.name || stepLabel(s, o)}`);
    }
    if (s.run_after && Object.keys(s.run_after).length)
      out.push(
        `${pad}  (runs after ${Object.entries(s.run_after)
          .map(([k, v]) => `${k} ${v.join("/")}`)
          .join(", ")})`,
      );
    if (s.retry?.count) out.push(`${pad}  (retries up to ${s.retry.count} times)`);
  }
  return out;
}

// ── From When → If → Then ──────────────────────────────────────────────────────────────────────
const prefixRefs = (v: unknown): unknown => {
  if (typeof v === "string")
    return v.replace(/\{\{\s*([a-z_][a-z0-9_.]*)\s*\}\}/g, (_m, p: string) => `{{trigger.${p}}}`);
  if (Array.isArray(v)) return v.map(prefixRefs);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, prefixRefs(x)]));
  return v;
};

/** The same workflow as designer steps: "always" first, then If / Else if / Otherwise as nested
 * conditions. Placeholders like {{member.name}} become {{trigger.member.name}}. */
export function toDesigner(d: Definition, o: Pick<Overview, "triggers">): DefinitionV2 {
  const used = new Set<string>();
  const id = (base: string) => {
    let i = 1;
    while (used.has(`${base}_${i}`)) i++;
    used.add(`${base}_${i}`);
    return `${base}_${i}`;
  };
  const t = o.triggers.find((x) => x.type === d.trigger.type);
  const fields = fieldsOf(t);
  const action = (a: Record<string, unknown>): Step => {
    const { type, ...rest } = a as { type: string } & Record<string, unknown>;
    return {
      id: id(type.replace(/\W/g, "_")),
      type,
      params: prefixRefs(rest) as Record<string, unknown>,
    };
  };
  const cond = (c: { field: string; op: string; value?: unknown; value2?: unknown }): Cond => {
    const f = fields.find((x) => x.key === c.field);
    return {
      left: `{{trigger.${c.field}}}`,
      op: c.op,
      ...(c.value !== undefined ? { right: c.value } : {}),
      ...(c.value2 !== undefined ? { right2: c.value2 } : {}),
      ...(f?.type === "ordered" && f.options ? { ordered: f.options } : {}),
    };
  };
  const steps: Step[] = d.always.map(action);
  let tail: Step[] = steps;
  d.branches.forEach((b) => {
    const s: Step = {
      id: id("if"),
      type: "condition",
      params: { match: b.match, conditions: b.conditions.map(cond) },
      then: b.actions.map(action),
      else: [],
    };
    tail.push(s);
    tail = s.else!;
  });
  tail.push(...d.otherwise.map(action));
  return { version: 2, trigger: { type: d.trigger.type, params: { ...d.trigger.params } }, steps };
}
