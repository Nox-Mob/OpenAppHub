import { describe, expect, it } from "vitest";
import { FIXTURE_OVERVIEW as o } from "./workflow-fixture";
import {
  availableData,
  describeSteps,
  describeToken,
  designerProblems,
  findStep,
  insertStep,
  listFieldsOf,
  locate,
  moveStep,
  newId,
  newStep,
  removeStep,
  toDesigner,
  updateStep,
  type DefinitionV2,
  type Step,
} from "./designer";

const def = (steps: Step[]): DefinitionV2 => ({
  version: 2,
  trigger: { type: "charter.payment_received", params: {} },
  steps,
});

const find = (): Step => ({
  id: "find",
  type: "charter.find_members",
  params: { standing: "current" },
});
const loop = (inner: Step[] = []): Step => ({
  id: "each",
  type: "foreach",
  params: { items: "{{steps.find.rows}}" },
  steps: inner,
});
const mail = (): Step => ({
  id: "mail",
  type: "email",
  params: {
    to: { type: "address", email: "{{items.each.email}}" },
    subject: "Hi {{items.each.name}}",
    message: "m",
  },
});

describe("designer tree", () => {
  it("inserts, moves into and out of containers, and removes", () => {
    let s: Step[] = [find(), loop()];
    s = insertStep(s, ["each", "steps"], 0, mail());
    expect(findStep(s, "mail")).toBeTruthy();
    expect(locate(s, "mail")).toEqual({ path: ["each", "steps"], index: 0 });
    // Drag it out to the top, after the loop.
    s = moveStep(s, "mail", [], 2);
    expect(locate(s, "mail")).toEqual({ path: [], index: 2 });
    expect(s.find((x) => x.id === "each")!.steps).toEqual([]);
    // A step can't go inside itself.
    expect(moveStep(s, "each", ["each", "steps"], 0)).toBe(s);
    // Moving down within the same list.
    s = moveStep(s, "find", [], 2);
    expect(s.map((x) => x.id)).toEqual(["each", "find", "mail"]);
    s = updateStep(s, "mail", (x) => ({ ...x, name: "Thank them" }));
    expect(findStep(s, "mail")!.name).toBe("Thank them");
    s = removeStep(s, "find");
    expect(findStep(s, "find")).toBeUndefined();
  });

  it("drops a removed step from others' run after", () => {
    const s: Step[] = [
      find(),
      { id: "after", type: "compose", params: {}, run_after: { find: ["failed"] } },
    ];
    expect(findStep(removeStep(s, "find"), "after")!.run_after).toBeUndefined();
  });

  it("makes short unique ids", () => {
    const s = [find()];
    expect(newId(s, "Find members")).toBe("find_members");
    expect(newId([...s, { id: "find_members", type: "compose" }], "Find members")).toBe(
      "find_members_2",
    );
    expect(newId(s, "123 go")).toBe("s_123_go");
  });

  it("starts each kind of step with sensible settings", () => {
    expect(newStep("condition", "c").then).toEqual([]);
    expect(newStep("foreach", "f").steps).toEqual([]);
    expect(newStep("wait", "w").params).toEqual({ mode: "duration", amount: 1, unit: "days" });
  });
});

describe("data from earlier steps (dynamic content)", () => {
  it("offers the trigger, earlier steps' outputs, the loop's items and variables", () => {
    const d = def([
      { id: "total", type: "init_variable", params: { name: "total", kind: "number", value: 0 } },
      find(),
      loop([mail()]),
    ]);
    const groups = availableData(d, "mail", o);
    const labels = groups.map((g) => g.label);
    expect(labels).toContain("A payment is received");
    expect(labels).toContain("Find members");
    expect(labels).toContain('Each item of "each"');
    expect(labels).toContain("Variables");
    const loopGroup = groups.find((g) => g.label === 'Each item of "each"')!;
    expect(loopGroup.items.map((i) => i.token)).toContain("{{items.each.email}}");
    const findGroup = groups.find((g) => g.label === "Find members")!;
    expect(findGroup.items.find((i) => i.token === "{{steps.find.rows}}")!.type).toBe("list");
    // A step can't use itself or what comes after it.
    expect(availableData(d, "find", o).some((g) => g.label === "Find members")).toBe(false);
  });

  it("knows a list's fields, and says references in words", () => {
    const d = def([find(), loop([mail()])]);
    expect(listFieldsOf("{{steps.find.rows}}", d.steps, o).map((f) => f.key)).toContain("email");
    expect(describeToken("{{steps.find.rows}}", d, o)).toBe("Find members → Members");
    expect(describeToken("{{items.each.email}}", d, o)).toBe("Each of Find members → Email");
    expect(describeToken("{{trigger.member.name}}", d, o)).toBe("Member name");
    expect(describeSteps(d.steps, d, o)).toEqual([
      "Find members",
      "For each item in [Find members → Members]:",
      '  Email "Hi [Each of Find members → Name]"',
    ]);
  });
});

describe("checking before saving", () => {
  it("points at references that go forward, loop items outside the loop, and early variables", () => {
    const bad = def([
      { id: "a", name: "a", type: "compose", params: { value: "{{steps.b.value}}" } },
      {
        id: "b",
        name: "b",
        type: "compose",
        params: { value: "{{items.each.name}} {{vars.total}}" },
      },
      { id: "c", name: "c", type: "set_variable", params: { name: "x", value: 1 } },
      loop([{ id: "v", type: "init_variable", params: { name: "inner", kind: "number" } }]),
    ]);
    const p = designerProblems("X", bad, o);
    expect(p).toContain('"a" uses a step that comes after it.');
    expect(p).toContain(`"b" uses a loop's items outside that loop.`);
    expect(p).toContain('"b" uses variable "total" before it\'s made.');
    expect(p).toContain('"c" changes a variable before it\'s made.');
    expect(p.some((x) => x.startsWith("Make variables at the top"))).toBe(true);
    expect(designerProblems("Ok", def([find(), loop([mail()])]), o)).toEqual([]);
  });
});

describe("opening a When → If → Then workflow in the designer", () => {
  it("keeps its meaning: always, then nested If / Else if / Otherwise, with trigger data", () => {
    const v2 = toDesigner(
      {
        trigger: { type: "charter.payment_received", params: {} },
        always: [
          { type: "task", to: { type: "role", roles: ["owner"] }, title: "Log {{member.name}}" },
        ],
        branches: [
          {
            match: "all",
            conditions: [{ field: "member.fields.rank", op: "lte", value: "PFC" }],
            actions: [{ type: "email", subject: "A", message: "m", to: { type: "subject" } }],
          },
          {
            match: "all",
            conditions: [{ field: "member.fields.rank", op: "gte", value: "SGT" }],
            actions: [{ type: "email", subject: "B", message: "m", to: { type: "subject" } }],
          },
        ],
        otherwise: [{ type: "email", subject: "C", message: "m", to: { type: "subject" } }],
      },
      o,
    );
    expect(v2.version).toBe(2);
    expect(v2.steps[0]!.type).toBe("task");
    expect(v2.steps[0]!.params!["title"]).toBe("Log {{trigger.member.name}}");
    const first = v2.steps[1]!;
    expect(first.type).toBe("condition");
    expect(
      (first.params!["conditions"] as Array<{ left: string; ordered?: string[] }>)[0]!.left,
    ).toBe("{{trigger.member.fields.rank}}");
    expect((first.params!["conditions"] as Array<{ ordered?: string[] }>)[0]!.ordered).toContain(
      "PFC",
    );
    const second = first.else![0]!;
    expect(second.type).toBe("condition");
    expect(second.else![0]!.params!["subject"]).toBe("C");
    expect(designerProblems("Converted", v2, o)).toEqual([]);
  });
});

describe("asking for approval (C-08)", () => {
  it("starts with sensible settings, needs to say what, and gives later steps the outcome", () => {
    const ask = { ...newStep("approval", "ok"), name: "Approve it" };
    expect(ask.params).toEqual({
      to: { type: "role", roles: ["owner"] },
      what: "",
      details: "",
      mode: "first",
    });
    expect(designerProblems("X", def([ask]), o)).toContain(
      '"Approve it" needs to say what is to be approved.',
    );
    const filled = {
      ...ask,
      params: { ...ask.params, what: "An award submission", mode: "all", timeout_days: "3" },
    };
    const after: Step = { id: "say", type: "compose", params: { value: "{{steps.ok.outcome}}" } };
    const d = def([filled, after]);
    expect(designerProblems("X", d, o)).toEqual([]);
    const group = availableData(d, "say", o).find((g) => g.label === "Approve it")!;
    expect(group.items.map((i) => i.token)).toEqual(
      expect.arrayContaining([
        "{{steps.ok.outcome}}",
        "{{steps.ok.decided_by}}",
        "{{steps.ok.comment}}",
      ]),
    );
    expect(describeSteps(d.steps, d, o)[0]).toBe(
      'Approve it: Ask for approval: "An award submission" (everyone must approve, 3 days to answer)',
    );
    expect(
      designerProblems(
        "X",
        def([{ ...filled, params: { ...filled.params, timeout_days: "soon" } }]),
        o,
      ),
    ).toContain('"Approve it": the time to answer is a number of days.');
  });
});
