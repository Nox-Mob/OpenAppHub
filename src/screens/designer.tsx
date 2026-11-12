// The low-code workflow designer (S-28): steps on a canvas you drag to arrange, with every
// earlier step's data available to later ones (Power Automate's "dynamic content"), loops,
// variables, data steps, waits, retries, "run after", and a test run that does nothing.
import { useMemo, useRef, useState, type DragEvent, type ReactNode } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WORKFLOWS_RUN_AS_ORG } from "@/lib/roles";
import type { Overview, ParamSpec, Recipient, Workflow } from "@/lib/workflows";
import { OP_LABELS } from "@/lib/workflows";
import {
  CONTAINER_TYPES,
  CORE_STEPS,
  allIds,
  availableData,
  coreStep,
  describeSteps,
  describeToken,
  designerProblems,
  findStep,
  getList,
  insertStep,
  isV2,
  listFieldsOf,
  moveStep,
  newId,
  newStep,
  removeStep,
  stepLabel,
  tokensIn,
  updateStep,
  type Cond,
  type DataGroup,
  type DefinitionV2,
  type ListPath,
  type RunAfterStatus,
  type Step,
} from "@/lib/designer";
import { ParamFields, RecipientEditor } from "./automations";

export type TraceEntry = {
  key: string;
  id: string;
  name: string;
  type: string;
  status: "succeeded" | "failed" | "skipped" | "waiting" | "retrying";
  detail: string;
  output?: unknown;
};
export type TestResult = { status: string; trace: TraceEntry[]; error?: string; trigger?: unknown };

type SaveArgs = {
  id: string | null;
  name: string;
  description: string;
  enabled: boolean;
  shared: boolean;
  definition: DefinitionV2;
};

const OPS = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "between",
  "in",
  "contains",
  "is_empty",
  "is_not_empty",
] as const;
const DRAG = "application/x-oah-step";

/** The designer. `initial` is a version 2 definition (a When → If → Then one is converted first). */
export function WorkflowDesigner({
  overview: o,
  workflow,
  initial,
  onSave,
  onCancel,
  onTest,
}: {
  overview: Overview;
  workflow: Workflow | null;
  initial?: DefinitionV2;
  onSave: (w: SaveArgs) => Promise<string | null>;
  onCancel: () => void;
  onTest?: (d: DefinitionV2) => Promise<TestResult>;
}) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [shared, setShared] = useState(workflow?.shared ?? false);
  const [def, setDef] = useState<DefinitionV2>(
    () =>
      initial ??
      (isV2(workflow?.definition)
        ? (workflow!.definition as unknown as DefinitionV2)
        : { version: 2, trigger: { type: o.triggers[0]?.type ?? "", params: {} }, steps: [] }),
  );
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const problems = designerProblems(name, def, o);
  const trigger = o.triggers.find((t) => t.type === def.trigger.type);
  const readOnly = !o.can_edit;

  const setSteps = (fn: (s: Step[]) => Step[]) => setDef((d) => ({ ...d, steps: fn(d.steps) }));
  const add = (path: ListPath, index: number, type: string) => {
    const label = coreStep(type)?.label ?? o.actions.find((a) => a.type === type)?.label ?? type;
    const step = newStep(type, newId(def.steps, label));
    const at = o.actions.find((a) => a.type === type);
    if (at?.requires.includes("meeting") && trigger?.provides.includes("meeting"))
      step.context = { meeting: "{{trigger.meeting}}" };
    setSteps((s) => insertStep(s, path, index, step));
    setOpen(step.id);
  };

  async function save() {
    setSaving(true);
    setError(null);
    const e = await onSave({
      id: workflow?.id ?? null,
      name,
      description,
      enabled,
      shared,
      definition: def,
    });
    setSaving(false);
    if (e) setError(e);
  }
  async function runTest() {
    if (!onTest) return;
    setTesting(true);
    try {
      setTest(await onTest(def));
    } catch (e) {
      setTest({ status: "failed", trace: [], error: e instanceof Error ? e.message : String(e) });
    }
    setTesting(false);
  }

  const ctx: Ctx = { o, def, open, setOpen, setSteps, add, readOnly, trace: test?.trace ?? [] };
  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <section aria-label="Workflow" className="rounded-lg border bg-card p-4 shadow-sm">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="dz-name">Name</Label>
              <Input
                id="dz-name"
                value={name}
                disabled={readOnly}
                placeholder="Renewal reminders"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="dz-desc">Description (optional)</Label>
              <Input
                id="dz-desc"
                value={description}
                disabled={readOnly}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={enabled}
                disabled={readOnly}
                onChange={(e) => setEnabled(e.target.checked)}
              />
              On
            </label>
            {o.has_chapters ? (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={shared}
                  disabled={readOnly}
                  onChange={(e) => setShared(e.target.checked)}
                />
                Share with chapters (each runs it on its own information)
              </label>
            ) : null}
          </div>
        </section>

        <section
          aria-label="When"
          className="rounded-lg border-2 border-primary/40 bg-card p-4 shadow-sm"
        >
          <h2 className="text-sm font-semibold">When</h2>
          <Select
            id="dz-trigger"
            aria-label="What starts it"
            className="mt-2"
            value={def.trigger.type}
            disabled={readOnly}
            onChange={(e) =>
              setDef((d) => ({ ...d, trigger: { type: e.target.value, params: {} } }))
            }
          >
            <option value="">Choose what starts it…</option>
            {o.triggers.map((t) => (
              <option key={t.type} value={t.type}>
                {t.label}
              </option>
            ))}
          </Select>
          {trigger ? (
            <p className="mt-1 text-xs text-muted-foreground">{trigger.description}</p>
          ) : null}
          {trigger ? (
            <ParamFields
              idPrefix="dz-trigger"
              schema={trigger.params_schema}
              values={def.trigger.params}
              hide={(k) =>
                trigger.type === "core.schedule" &&
                k === "day" &&
                def.trigger.params["frequency"] === "daily"
              }
              onChange={(v) => setDef((d) => ({ ...d, trigger: { ...d.trigger, params: v } }))}
            />
          ) : null}
        </section>

        <StepList ctx={ctx} path={[]} steps={def.steps} />
      </div>

      <aside className="space-y-4">
        <section
          aria-label="In plain words"
          className="rounded-lg border bg-card p-4 text-sm shadow-sm"
        >
          <h2 className="font-semibold">In plain words</h2>
          <p className="mt-1 text-muted-foreground">When: {trigger?.label ?? "…"}</p>
          <pre className="mt-1 whitespace-pre-wrap font-sans text-sm">
            {describeSteps(def.steps, def, o).join("\n") || "No steps yet."}
          </pre>
          {problems.length ? (
            <ul className="mt-3 list-disc space-y-1 pl-4 text-destructive">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          ) : null}
        </section>
        {onTest ? (
          <section
            aria-label="Test run"
            className="rounded-lg border bg-card p-4 text-sm shadow-sm"
          >
            <h2 className="font-semibold">Test run</h2>
            <p className="mt-1 text-muted-foreground">
              Runs the steps on this organization's information: lookups run for real; emails,
              tasks, the apps' actions and waits are only described. Nothing is sent or changed.
            </p>
            <Button
              className="mt-2"
              variant="outline"
              disabled={testing || problems.length > 0}
              onClick={() => void runTest()}
            >
              {testing ? "Testing…" : "Test run"}
            </Button>
            {test ? <TestTrace result={test} /> : null}
          </section>
        ) : null}
        <p className="flex gap-1.5 text-xs text-muted-foreground">
          <span aria-hidden="true">⚠</span>
          <span>{WORKFLOWS_RUN_AS_ORG}</span>
        </p>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className="flex gap-2">
          {!readOnly ? (
            <Button disabled={saving || problems.length > 0} onClick={() => void save()}>
              {saving ? "Saving…" : "Save workflow"}
            </Button>
          ) : null}
          <Button variant="ghost" onClick={onCancel}>
            {readOnly ? "Back" : "Cancel"}
          </Button>
        </div>
      </aside>
    </div>
  );
}

type Ctx = {
  o: Overview;
  def: DefinitionV2;
  open: string | null;
  setOpen: (id: string | null) => void;
  setSteps: (fn: (s: Step[]) => Step[]) => void;
  add: (path: ListPath, index: number, type: string) => void;
  readOnly: boolean;
  trace: TraceEntry[];
};

function StepList({
  ctx,
  path,
  steps,
  label,
}: {
  ctx: Ctx;
  path: ListPath;
  steps: Step[];
  label?: string;
}) {
  return (
    <div className="space-y-0" role="list" aria-label={label ?? "Steps"}>
      <Slot ctx={ctx} path={path} index={0} empty={steps.length === 0} />
      {steps.map((s, i) => (
        <div key={s.id} role="listitem">
          <StepCard ctx={ctx} step={s} path={path} index={i} count={steps.length} />
          <Slot ctx={ctx} path={path} index={i + 1} />
        </div>
      ))}
    </div>
  );
}

/** Between two steps: drop a dragged step here, or add one. */
function Slot({
  ctx,
  path,
  index,
  empty,
}: {
  ctx: Ctx;
  path: ListPath;
  index: number;
  empty?: boolean;
}) {
  const [over, setOver] = useState(false);
  const [adding, setAdding] = useState(false);
  const id = `dz-add-${path.join("-") || "top"}-${index}`;
  if (ctx.readOnly)
    return empty ? (
      <p className="py-2 text-xs text-muted-foreground">No steps.</p>
    ) : (
      <div className="h-3" />
    );
  const groups = groupedStepTypes(ctx.o);
  return (
    <div
      className={`flex items-center justify-center py-1 ${over ? "rounded-md bg-primary/10 outline-dashed outline-1 outline-primary" : ""}`}
      onDragOver={(e: DragEvent) => {
        if (e.dataTransfer.types.includes(DRAG)) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e: DragEvent) => {
        e.preventDefault();
        setOver(false);
        const stepId = e.dataTransfer.getData(DRAG);
        if (stepId) ctx.setSteps((s) => moveStep(s, stepId, path, index));
      }}
      data-slot={`${path.join("/")}:${index}`}
    >
      {adding ? (
        <Select
          id={id}
          aria-label="Add a step"
          className="h-8 max-w-xs text-xs"
          autoFocus
          value=""
          onBlur={() => setAdding(false)}
          onChange={(e) => {
            if (e.target.value) ctx.add(path, index, e.target.value);
            setAdding(false);
          }}
        >
          <option value="">Choose a step…</option>
          {groups.map((g) => (
            <optgroup key={g.label} label={g.label}>
              {g.items.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      ) : (
        <button
          type="button"
          className="grid size-6 place-items-center rounded-full border bg-background text-xs text-muted-foreground hover:border-primary hover:text-primary"
          aria-label={empty ? "Add the first step here" : "Add a step here"}
          onClick={() => setAdding(true)}
        >
          +
        </button>
      )}
    </div>
  );
}

function groupedStepTypes(o: Overview) {
  const groups: Array<{ label: string; items: Array<{ type: string; label: string }> }> = [];
  for (const g of ["Do", "Decide and repeat", "Data", "Variables", "Time and flow"] as const)
    groups.push({ label: g, items: CORE_STEPS.filter((c) => c.group === g) });
  const byApp = new Map<string, Array<{ type: string; label: string }>>();
  for (const a of o.actions)
    byApp.set(a.app, [...(byApp.get(a.app) ?? []), { type: a.type, label: a.label }]);
  const names: Record<string, string> = {
    charter: "OpenCharterApp",
    board: "OpenBoardApp",
    ledger: "OpenLedgerApp",
    hub: "OpenAppHub",
  };
  for (const [app, items] of byApp) groups.push({ label: names[app] ?? app, items });
  return groups;
}

function statusOf(ctx: Ctx, id: string) {
  const all = ctx.trace.filter((t) => t.id === id);
  return all.at(-1);
}

function StepCard({
  ctx,
  step: s,
  path,
  index,
  count,
}: {
  ctx: Ctx;
  step: Step;
  path: ListPath;
  index: number;
  count: number;
}) {
  const isOpen = ctx.open === s.id;
  const label = stepLabel(s, ctx.o);
  const app = ctx.o.actions.find((a) => a.type === s.type);
  const tr = statusOf(ctx, s.id);
  const container = CONTAINER_TYPES.has(s.type);
  return (
    <section
      aria-label={s.name || label}
      className={`rounded-lg border bg-card shadow-sm ${container ? "border-l-4 border-l-primary/60" : ""}`}
      data-step={s.id}
    >
      <header className="flex items-center gap-2 px-3 py-2">
        {!ctx.readOnly ? (
          <span
            draggable
            role="button"
            tabIndex={-1}
            aria-label={`Drag ${s.name || label}`}
            title="Drag to move"
            className="cursor-grab select-none text-muted-foreground"
            onDragStart={(e) => {
              e.dataTransfer.setData(DRAG, s.id);
              e.dataTransfer.effectAllowed = "move";
            }}
          >
            ⋮⋮
          </span>
        ) : null}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          aria-expanded={isOpen}
          onClick={() => ctx.setOpen(isOpen ? null : s.id)}
        >
          <span className="block truncate text-sm font-semibold">{s.name || label}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {s.name ? `${label} · ` : ""}
            {app ? (app.app === "hub" ? "" : `${appName(app.app)} · `) : ""}
            <code className="text-[11px]">{s.id}</code>
            {s.retry?.count ? ` · retries ${s.retry.count}×` : ""}
            {s.run_after && Object.keys(s.run_after).length ? " · run after set" : ""}
          </span>
        </button>
        {tr ? <StatusBadge status={tr.status} /> : null}
        {!ctx.readOnly ? (
          <div className="flex gap-0.5">
            <IconButton
              label={`Move ${s.name || label} up`}
              disabled={index === 0}
              onClick={() => ctx.setSteps((x) => moveStep(x, s.id, path, index - 1))}
            >
              ↑
            </IconButton>
            <IconButton
              label={`Move ${s.name || label} down`}
              disabled={index === count - 1}
              onClick={() => ctx.setSteps((x) => moveStep(x, s.id, path, index + 2))}
            >
              ↓
            </IconButton>
            <IconButton
              label={`Delete ${s.name || label}`}
              onClick={() => ctx.setSteps((x) => removeStep(x, s.id))}
            >
              ✕
            </IconButton>
          </div>
        ) : null}
      </header>
      {isOpen ? (
        <div className="border-t px-3 py-3">
          <StepEditor ctx={ctx} s={s} siblings={getList(ctx.def.steps, path).slice(0, index)} />
          {tr?.detail ? (
            <p className="mt-2 text-xs text-muted-foreground">Test run: {tr.detail}</p>
          ) : null}
        </div>
      ) : null}
      {container ? <Container ctx={ctx} s={s} /> : null}
    </section>
  );
}

function Container({ ctx, s }: { ctx: Ctx; s: Step }) {
  if (s.type === "condition")
    return (
      <div className="grid gap-3 border-t p-3 md:grid-cols-2">
        <Lane title="If yes">
          <StepList
            ctx={ctx}
            path={[s.id, "then"]}
            steps={s.then ?? []}
            label={`If yes: ${s.name || s.id}`}
          />
        </Lane>
        <Lane title="If no">
          <StepList
            ctx={ctx}
            path={[s.id, "else"]}
            steps={s.else ?? []}
            label={`If no: ${s.name || s.id}`}
          />
        </Lane>
      </div>
    );
  if (s.type === "switch")
    return (
      <div className="space-y-3 border-t p-3">
        {(s.cases ?? []).map((c, i) => (
          <Lane key={i} title={`When ${String(c.equals ?? "") || "…"}`}>
            <StepList
              ctx={ctx}
              path={[s.id, "cases", String(i)]}
              steps={c.steps}
              label={`Case ${i + 1}: ${s.name || s.id}`}
            />
          </Lane>
        ))}
        <Lane title="Anything else">
          <StepList
            ctx={ctx}
            path={[s.id, "default"]}
            steps={s.default ?? []}
            label={`Anything else: ${s.name || s.id}`}
          />
        </Lane>
      </div>
    );
  return (
    <div className="border-t p-3">
      <Lane title={s.type === "foreach" ? "For each item" : "In this group"}>
        <StepList
          ctx={ctx}
          path={[s.id, "steps"]}
          steps={s.steps ?? []}
          label={`${s.type === "foreach" ? "For each" : "Group"}: ${s.name || s.id}`}
        />
      </Lane>
    </div>
  );
}

function Lane({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-md bg-muted/40 p-2">
      <p className="mb-1 text-xs font-semibold text-muted-foreground">{title}</p>
      {children}
    </div>
  );
}

function IconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-7 place-items-center rounded-md text-xs text-muted-foreground hover:bg-accent disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: TraceEntry["status"] }) {
  const tone: Record<string, string> = {
    succeeded: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
    failed: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
    skipped: "bg-muted text-muted-foreground",
    waiting: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
    retrying: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  };
  const words: Record<string, string> = {
    succeeded: "OK",
    failed: "Failed",
    skipped: "Skipped",
    waiting: "Waiting",
    retrying: "Retrying",
  };
  return (
    <span className={`rounded px-1.5 py-0.5 text-[11px] font-semibold ${tone[status] ?? ""}`}>
      {words[status] ?? status}
    </span>
  );
}

function appName(app: string) {
  return (
    (
      { charter: "OpenCharterApp", board: "OpenBoardApp", ledger: "OpenLedgerApp" } as Record<
        string,
        string
      >
    )[app] ?? app
  );
}

// ── Editing one step ───────────────────────────────────────────────────────────────────────────
function StepEditor({ ctx, s, siblings }: { ctx: Ctx; s: Step; siblings: Step[] }) {
  const { o, def } = ctx;
  const data = useMemo(() => availableData(def, s.id, o), [def, s.id, o]);
  const p = s.params ?? {};
  const set = (k: string, v: unknown) =>
    ctx.setSteps((x) =>
      updateStep(x, s.id, (st) => {
        const params = { ...(st.params ?? {}) };
        if (v === undefined) delete params[k];
        else params[k] = v;
        return { ...st, params };
      }),
    );
  const patch = (fn: (st: Step) => Step) => ctx.setSteps((x) => updateStep(x, s.id, fn));
  const id = (k: string) => `dz-${s.id}-${k}`;
  // For a list step (filter, select…), the fields of each item are offered too.
  const itemFields = listFieldsOf(String(p["items"] ?? ""), def.steps, o);
  const withItem: DataGroup[] = itemFields.length
    ? [
        {
          label: "Each item of the list",
          items: itemFields.map((f) => ({
            token: `{{item.${f.key}}}`,
            label: f.label,
            type: f.type,
          })),
        },
        ...data,
      ]
    : data;
  const ro = ctx.readOnly;
  const vars = allIds(def.steps)
    .map((sid) => findStep(def.steps, sid))
    .filter((x): x is Step => x?.type === "init_variable")
    .map((x) => String(x.params?.["name"] ?? ""))
    .filter(Boolean);

  const at = o.actions.find((a) => a.type === s.type);
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={id("name")}>Step name (optional)</Label>
          <Input
            id={id("name")}
            className="h-9"
            value={s.name ?? ""}
            disabled={ro}
            placeholder={stepLabel(s, o)}
            onChange={(e) => patch((st) => ({ ...st, name: e.target.value || undefined }))}
          />
        </div>
      </div>
      {(coreStep(s.type)?.description ?? at?.description) ? (
        <p className="text-xs text-muted-foreground">
          {coreStep(s.type)?.description || at?.description}
        </p>
      ) : null}

      {s.type === "email" || s.type === "task" ? (
        <>
          <Who
            id={id("to")}
            value={p["to"] as Recipient | undefined}
            o={o}
            data={data}
            def={def}
            ro={ro}
            onChange={(v) => set("to", v)}
          />
          {s.type === "email" ? (
            <>
              <DataInput
                id={id("subject")}
                label="Subject"
                value={p["subject"]}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => set("subject", v)}
              />
              <DataInput
                id={id("message")}
                label="Message"
                multiline
                value={p["message"]}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => set("message", v)}
              />
            </>
          ) : (
            <>
              <DataInput
                id={id("title")}
                label="Title"
                value={p["title"]}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => set("title", v)}
              />
              <DataInput
                id={id("note")}
                label="Note (optional)"
                multiline
                value={p["note"]}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => set("note", v)}
              />
              <DataInput
                id={id("due")}
                label="Due in (days, optional)"
                value={p["due_in_days"]}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => set("due_in_days", v || undefined)}
              />
            </>
          )}
        </>
      ) : null}

      {s.type === "condition" || s.type === "filter" ? (
        <Conditions
          idBase={id("c")}
          value={(p["conditions"] as Cond[]) ?? []}
          match={String(p["match"] ?? "all")}
          data={s.type === "filter" ? withItem : data}
          def={def}
          o={o}
          ro={ro}
          onMatch={(m) => set("match", m)}
          onChange={(c) => set("conditions", c)}
        />
      ) : null}

      {["foreach", "filter", "select", "join", "aggregate"].includes(s.type) ? (
        <DataInput
          id={id("items")}
          label={s.type === "foreach" ? "For each item in (a list)" : "List"}
          value={p["items"]}
          data={data}
          def={def}
          o={o}
          ro={ro}
          onlyLists
          onChange={(v) => set("items", v)}
        />
      ) : null}
      {s.type === "select" ? (
        <MapEditor
          idBase={id("map")}
          value={(p["map"] as Record<string, unknown>) ?? {}}
          data={withItem}
          def={def}
          o={o}
          ro={ro}
          onChange={(m) => set("map", m)}
        />
      ) : null}
      {s.type === "join" || s.type === "aggregate" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {s.type === "aggregate" ? (
            <div>
              <Label htmlFor={id("op")}>Work out</Label>
              <Select
                id={id("op")}
                className="h-9"
                value={String(p["op"] ?? "count")}
                disabled={ro}
                onChange={(e) => set("op", e.target.value)}
              >
                <option value="count">How many</option>
                <option value="sum">Total</option>
                <option value="average">Average</option>
                <option value="min">Smallest</option>
                <option value="max">Largest</option>
              </Select>
            </div>
          ) : (
            <div>
              <Label htmlFor={id("sep")}>Between items</Label>
              <Input
                id={id("sep")}
                className="h-9"
                value={String(p["separator"] ?? ", ")}
                disabled={ro}
                onChange={(e) => set("separator", e.target.value)}
              />
            </div>
          )}
          <div>
            <Label htmlFor={id("field")}>Of the field</Label>
            <Select
              id={id("field")}
              className="h-9"
              value={String(p["field"] ?? "")}
              disabled={ro}
              onChange={(e) => set("field", e.target.value)}
            >
              <option value="">{s.type === "join" ? "The items themselves" : "—"}</option>
              {itemFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </Select>
          </div>
        </div>
      ) : null}

      {s.type === "switch" ? (
        <>
          <DataInput
            id={id("on")}
            label="Depending on"
            value={p["on"]}
            data={data}
            def={def}
            o={o}
            ro={ro}
            onChange={(v) => set("on", v)}
          />
          <div className="space-y-2">
            {(s.cases ?? []).map((c, i) => (
              <div key={i} className="flex items-end gap-2">
                <div className="flex-1">
                  <DataInput
                    id={id(`case${i}`)}
                    label={`Case ${i + 1}: equals`}
                    value={c.equals}
                    data={data}
                    def={def}
                    o={o}
                    ro={ro}
                    onChange={(v) =>
                      patch((st) => ({
                        ...st,
                        cases: (st.cases ?? []).map((x, j) => (j === i ? { ...x, equals: v } : x)),
                      }))
                    }
                  />
                </div>
                {!ro ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Remove case ${i + 1}`}
                    onClick={() =>
                      patch((st) => ({ ...st, cases: (st.cases ?? []).filter((_, j) => j !== i) }))
                    }
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
            ))}
            {!ro ? (
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  patch((st) => ({
                    ...st,
                    cases: [...(st.cases ?? []), { equals: "", steps: [] }],
                  }))
                }
              >
                Add a case
              </Button>
            ) : null}
          </div>
        </>
      ) : null}

      {s.type === "compose" ? (
        <DataInput
          id={id("value")}
          label="Value"
          multiline
          value={p["value"]}
          data={data}
          def={def}
          o={o}
          ro={ro}
          onChange={(v) => set("value", v)}
        />
      ) : null}

      {s.type === "init_variable" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={id("vname")}>Variable name</Label>
            <Input
              id={id("vname")}
              className="h-9"
              value={String(p["name"] ?? "")}
              disabled={ro}
              placeholder="total"
              onChange={(e) =>
                set("name", e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))
              }
            />
          </div>
          <div>
            <Label htmlFor={id("kind")}>Kind</Label>
            <Select
              id={id("kind")}
              className="h-9"
              value={String(p["kind"] ?? "number")}
              disabled={ro}
              onChange={(e) => set("kind", e.target.value)}
            >
              <option value="number">Number</option>
              <option value="text">Text</option>
              <option value="list">List</option>
              <option value="boolean">Yes or no</option>
            </Select>
          </div>
          {p["kind"] !== "list" ? (
            <DataInput
              id={id("ival")}
              label="Starts as"
              value={p["value"]}
              data={data}
              def={def}
              o={o}
              ro={ro}
              onChange={(v) => set("value", v)}
            />
          ) : null}
        </div>
      ) : null}
      {["set_variable", "increment_variable", "append_variable"].includes(s.type) ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={id("var")}>Variable</Label>
            <Select
              id={id("var")}
              className="h-9"
              value={String(p["name"] ?? "")}
              disabled={ro}
              onChange={(e) => set("name", e.target.value)}
            >
              <option value="">Choose…</option>
              {vars.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </Select>
          </div>
          <DataInput
            id={id("vv")}
            label={
              s.type === "increment_variable"
                ? "Add"
                : s.type === "append_variable"
                  ? "Append"
                  : "Value"
            }
            value={s.type === "increment_variable" ? p["by"] : p["value"]}
            data={data}
            def={def}
            o={o}
            ro={ro}
            onChange={(v) => set(s.type === "increment_variable" ? "by" : "value", v)}
          />
        </div>
      ) : null}

      {s.type === "wait" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label htmlFor={id("mode")}>Wait</Label>
            <Select
              id={id("mode")}
              className="h-9"
              value={String(p["mode"] ?? "duration")}
              disabled={ro}
              onChange={(e) => set("mode", e.target.value)}
            >
              <option value="duration">For a while</option>
              <option value="until">Until a date</option>
            </Select>
          </div>
          {p["mode"] === "until" ? (
            <DataInput
              id={id("until")}
              label="Until"
              value={p["until"]}
              data={data}
              def={def}
              o={o}
              ro={ro}
              onChange={(v) => set("until", v)}
            />
          ) : (
            <>
              <DataInput
                id={id("amount")}
                label="How long"
                value={p["amount"]}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => set("amount", v)}
              />
              <div>
                <Label htmlFor={id("unit")}>Unit</Label>
                <Select
                  id={id("unit")}
                  className="h-9"
                  value={String(p["unit"] ?? "days")}
                  disabled={ro}
                  onChange={(e) => set("unit", e.target.value)}
                >
                  <option value="minutes">Minutes</option>
                  <option value="hours">Hours</option>
                  <option value="days">Days</option>
                </Select>
              </div>
            </>
          )}
        </div>
      ) : null}
      {s.type === "terminate" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor={id("tstatus")}>End the run as</Label>
            <Select
              id={id("tstatus")}
              className="h-9"
              value={String(p["status"] ?? "succeeded")}
              disabled={ro}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </Select>
          </div>
          <DataInput
            id={id("tmsg")}
            label="Message (optional)"
            value={p["message"]}
            data={data}
            def={def}
            o={o}
            ro={ro}
            onChange={(v) => set("message", v)}
          />
        </div>
      ) : null}

      {at ? (
        <AppStepFields
          s={s}
          at={at}
          data={data}
          def={def}
          o={o}
          ro={ro}
          set={set}
          setContext={(k, v) =>
            patch((st) => ({ ...st, context: { ...(st.context ?? {}), [k]: v } }))
          }
        />
      ) : null}

      <StepSettings s={s} siblings={siblings} ro={ro} patch={patch} />
    </div>
  );
}

function AppStepFields({
  s,
  at,
  data,
  def,
  o,
  ro,
  set,
  setContext,
}: {
  s: Step;
  at: Overview["actions"][number];
  data: DataGroup[];
  def: DefinitionV2;
  o: Overview;
  ro: boolean;
  set: (k: string, v: unknown) => void;
  setContext: (k: string, v: unknown) => void;
}) {
  const p = s.params ?? {};
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {Object.entries(at.params_schema as Record<string, ParamSpec>).map(([k, spec]) => {
        const fid = `dz-${s.id}-p-${k}`;
        const v = p[k];
        if (spec.type === "choice")
          return (
            <div key={k}>
              <Label htmlFor={fid}>{spec.label ?? k}</Label>
              <Select
                id={fid}
                className="h-9"
                value={String(v ?? "")}
                disabled={ro}
                onChange={(e) => set(k, e.target.value || undefined)}
              >
                <option value="">Choose…</option>
                {(spec.options ?? []).map((op) => (
                  <option key={op} value={op}>
                    {op.replace(/_/g, " ")}
                  </option>
                ))}
              </Select>
            </div>
          );
        if (spec.type === "bool")
          return (
            <label key={k} className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={!!v}
                disabled={ro}
                onChange={(e) => set(k, e.target.checked)}
              />
              {spec.label ?? k}
            </label>
          );
        return (
          <DataInput
            key={k}
            id={fid}
            label={spec.label ?? k}
            value={v}
            data={data}
            def={def}
            o={o}
            ro={ro}
            onChange={(nv) =>
              set(
                k,
                nv === ""
                  ? undefined
                  : spec.type === "int" && /^-?\d+$/.test(String(nv))
                    ? Number(nv)
                    : nv,
              )
            }
          />
        );
      })}
      {at.requires.map((need) => (
        <DataInput
          key={need}
          id={`dz-${s.id}-ctx-${need}`}
          label={need === "meeting" ? "Which meeting (from an earlier step)" : `Which ${need}`}
          value={s.context?.[need]}
          data={data}
          def={def}
          o={o}
          ro={ro}
          onChange={(v) => setContext(need, v)}
        />
      ))}
    </div>
  );
}

function StepSettings({
  s,
  siblings,
  ro,
  patch,
}: {
  s: Step;
  siblings: Step[];
  ro: boolean;
  patch: (fn: (st: Step) => Step) => void;
}) {
  const [open, setOpen] = useState(
    !!(s.retry?.count || (s.run_after && Object.keys(s.run_after).length)),
  );
  const prev = siblings.at(-1);
  const ra = s.run_after ?? (prev ? { [prev.id]: ["succeeded" as RunAfterStatus] } : {});
  const custom = !!s.run_after;
  return (
    <details
      open={open}
      onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}
      className="rounded-md border p-2"
    >
      <summary className="cursor-pointer text-xs font-semibold">
        Settings: retries and run after
      </summary>
      <div className="mt-2 grid gap-3 sm:grid-cols-3">
        <div>
          <Label htmlFor={`dz-${s.id}-rc`}>Retry up to (times)</Label>
          <Input
            id={`dz-${s.id}-rc`}
            type="number"
            min={0}
            max={10}
            className="h-9"
            disabled={ro}
            value={s.retry?.count ?? 0}
            onChange={(e) =>
              patch((st) => ({
                ...st,
                retry: {
                  interval_minutes: 5,
                  backoff: "exponential",
                  ...st.retry,
                  count: Math.max(0, Math.min(10, Number(e.target.value) || 0)),
                },
              }))
            }
          />
        </div>
        <div>
          <Label htmlFor={`dz-${s.id}-ri`}>First retry after (minutes)</Label>
          <Input
            id={`dz-${s.id}-ri`}
            type="number"
            min={1}
            max={1440}
            className="h-9"
            disabled={ro || !s.retry?.count}
            value={s.retry?.interval_minutes ?? 5}
            onChange={(e) =>
              patch((st) => ({
                ...st,
                retry: {
                  count: 0,
                  backoff: "exponential",
                  ...st.retry,
                  interval_minutes: Math.max(1, Math.min(1440, Number(e.target.value) || 5)),
                },
              }))
            }
          />
        </div>
        <div>
          <Label htmlFor={`dz-${s.id}-rb`}>Then</Label>
          <Select
            id={`dz-${s.id}-rb`}
            className="h-9"
            disabled={ro || !s.retry?.count}
            value={s.retry?.backoff ?? "exponential"}
            onChange={(e) =>
              patch((st) => ({
                ...st,
                retry: {
                  count: 0,
                  interval_minutes: 5,
                  ...st.retry,
                  backoff: e.target.value as "fixed" | "exponential",
                },
              }))
            }
          >
            <option value="exponential">Twice as long each time</option>
            <option value="fixed">The same time each time</option>
          </Select>
        </div>
      </div>
      {siblings.length ? (
        <fieldset className="mt-3">
          <legend className="text-xs font-semibold">Run this step after</legend>
          <p className="text-xs text-muted-foreground">
            {custom ? "As set below." : `By default, when "${prev?.name || prev?.id}" succeeded.`}{" "}
            Choose "failed" to handle a failure; a failure handled this way doesn't fail the run.
          </p>
          {siblings.map((sib) => (
            <div key={sib.id} className="mt-1 flex flex-wrap items-center gap-3 text-xs">
              <span className="w-40 truncate font-medium">{sib.name || sib.id}</span>
              {(["succeeded", "failed", "skipped"] as const).map((st) => {
                const checked = (ra[sib.id] ?? []).includes(st);
                return (
                  <label key={st} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      className="size-3.5 accent-primary"
                      disabled={ro}
                      checked={checked}
                      aria-label={`Run after ${sib.name || sib.id} ${st}`}
                      onChange={(e) =>
                        patch((x) => {
                          const next: Record<string, RunAfterStatus[]> = { ...(x.run_after ?? ra) };
                          const list = new Set(next[sib.id] ?? []);
                          if (e.target.checked) list.add(st);
                          else list.delete(st);
                          if (list.size) next[sib.id] = [...list];
                          else delete next[sib.id];
                          return { ...x, run_after: Object.keys(next).length ? next : undefined };
                        })
                      }
                    />
                    {st}
                  </label>
                );
              })}
            </div>
          ))}
        </fieldset>
      ) : null}
    </details>
  );
}

// ── Inputs that take data from earlier steps ───────────────────────────────────────────────────
function DataInput({
  id,
  label,
  value,
  onChange,
  data,
  def,
  o,
  ro,
  multiline,
  onlyLists,
}: {
  id: string;
  label: string;
  value: unknown;
  onChange: (v: string) => void;
  data: DataGroup[];
  def: DefinitionV2;
  o: Overview;
  ro: boolean;
  multiline?: boolean;
  onlyLists?: boolean;
}) {
  const [picking, setPicking] = useState(false);
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const text =
    value === undefined || value === null ? "" : typeof value === "string" ? value : String(value);
  const insert = (token: string) => {
    if (onlyLists) {
      onChange(token);
    } else {
      const el = ref.current;
      const at = el?.selectionStart ?? text.length;
      const end = el?.selectionEnd ?? at;
      onChange(text.slice(0, at) + token + text.slice(end));
    }
    setPicking(false);
  };
  const tokens = tokensIn(text);
  const common = {
    id,
    ref,
    value: text,
    disabled: ro,
    className: "w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm",
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    "aria-describedby": tokens.length ? `${id}-uses` : undefined,
  };
  return (
    <div className="min-w-0">
      <div className="flex items-end justify-between gap-2">
        <Label htmlFor={id}>{label}</Label>
        {!ro ? (
          <button
            type="button"
            className="text-xs font-medium text-primary hover:underline"
            aria-expanded={picking}
            aria-controls={`${id}-pick`}
            onClick={() => setPicking((x) => !x)}
          >
            {onlyLists ? "Choose a list" : "Insert data"}
          </button>
        ) : null}
      </div>
      {multiline ? <textarea rows={3} {...common} /> : <input type="text" {...common} />}
      {tokens.length ? (
        <p id={`${id}-uses`} className="mt-1 flex flex-wrap gap-1">
          {tokens.map((t, i) => (
            <span
              key={`${t}-${i}`}
              className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
            >
              {describeToken(t, def, o)}
            </span>
          ))}
        </p>
      ) : null}
      {picking ? (
        <DataPicker id={`${id}-pick`} data={data} onlyLists={onlyLists} onPick={insert} />
      ) : null}
    </div>
  );
}

/** Data from earlier steps, by step: Power Automate's dynamic content. */
function DataPicker({
  id,
  data,
  onlyLists,
  onPick,
}: {
  id: string;
  data: DataGroup[];
  onlyLists?: boolean;
  onPick: (token: string) => void;
}) {
  const [q, setQ] = useState("");
  const groups = data
    .map((g) => ({
      ...g,
      items: g.items.filter(
        (i) =>
          (!onlyLists || i.type === "list") &&
          (!q || `${g.label} ${i.label}`.toLowerCase().includes(q.toLowerCase())),
      ),
    }))
    .filter((g) => g.items.length);
  return (
    <div
      id={id}
      role="dialog"
      aria-label="Data from earlier steps"
      className="mt-1 max-h-72 overflow-y-auto rounded-md border bg-popover p-2 shadow-md"
    >
      <Input
        aria-label="Search data"
        className="mb-2 h-8 text-xs"
        placeholder="Search…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {onlyLists
            ? "No lists yet: add a lookup (like Find members) or a list variable before this step."
            : "Nothing to insert yet."}
        </p>
      ) : null}
      {groups.map((g) => (
        <div key={g.label} className="mb-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            {g.label}
          </p>
          <div className="mt-1 flex flex-wrap gap-1">
            {g.items.map((i) => (
              <button
                key={i.token}
                type="button"
                className="rounded border px-2 py-0.5 text-xs hover:border-primary hover:bg-primary/5"
                title={i.token}
                onClick={() => onPick(i.token)}
              >
                {i.label}
                {i.type === "list" ? " (list)" : ""}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function Who({
  id,
  value,
  o,
  data,
  def,
  ro,
  onChange,
}: {
  id: string;
  value: Recipient | undefined;
  o: Overview;
  data: DataGroup[];
  def: DefinitionV2;
  ro: boolean;
  onChange: (r: Recipient) => void;
}) {
  const type = value?.type ?? "role";
  const special = type === "address" || type === "people";
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-3 text-xs">
        {(
          [
            ["named", "A role, seat or person"],
            ["address", "An email address from the data"],
            ["people", "Everyone in a list"],
          ] as const
        ).map(([k, l]) => (
          <label key={k} className="flex items-center gap-1">
            <input
              type="radio"
              name={`${id}-mode`}
              disabled={ro}
              checked={(k === "named" && !special) || k === type}
              onChange={() =>
                onChange(
                  k === "named"
                    ? { type: "role", roles: ["owner", "admin"] }
                    : k === "address"
                      ? { type: "address", email: "" }
                      : { type: "people", items: "" },
                )
              }
            />
            {l}
          </label>
        ))}
      </div>
      {type === "address" ? (
        <DataInput
          id={`${id}-email`}
          label="Email address"
          value={value?.["email"]}
          data={data}
          def={def}
          o={o}
          ro={ro}
          onChange={(v) => onChange({ type: "address", email: v })}
        />
      ) : type === "people" ? (
        <DataInput
          id={`${id}-people`}
          label="The list (each item with an email or account)"
          value={value?.["items"]}
          onlyLists
          data={data}
          def={def}
          o={o}
          ro={ro}
          onChange={(v) => onChange({ type: "people", items: v })}
        />
      ) : ro ? null : (
        <RecipientEditor id={id} r={value} o={o} onChange={onChange} />
      )}
    </div>
  );
}

function Conditions({
  idBase,
  value,
  match,
  data,
  def,
  o,
  ro,
  onChange,
  onMatch,
}: {
  idBase: string;
  value: Cond[];
  match: string;
  data: DataGroup[];
  def: DefinitionV2;
  o: Overview;
  ro: boolean;
  onChange: (c: Cond[]) => void;
  onMatch: (m: string) => void;
}) {
  const setAt = (i: number, c: Partial<Cond>) =>
    onChange(value.map((x, j) => (j === i ? { ...x, ...c } : x)));
  return (
    <fieldset className="space-y-2">
      <legend className="sr-only">Conditions</legend>
      <div className="flex items-center gap-2 text-xs">
        <span>Match</span>
        <Select
          aria-label="Match"
          className="h-8 w-auto text-xs"
          value={match}
          disabled={ro}
          onChange={(e) => onMatch(e.target.value)}
        >
          <option value="all">all of these</option>
          <option value="any">any of these</option>
        </Select>
      </div>
      {value.map((c, i) => (
        <div
          key={i}
          className="grid items-end gap-2 rounded-md border p-2 sm:grid-cols-[1fr_9rem_1fr_auto]"
        >
          <DataInput
            id={`${idBase}${i}-left`}
            label="Value"
            value={c.left}
            data={data}
            def={def}
            o={o}
            ro={ro}
            onChange={(v) => setAt(i, { left: v })}
          />
          <div>
            <Label htmlFor={`${idBase}${i}-op`}>Comparison</Label>
            <Select
              id={`${idBase}${i}-op`}
              className="h-9"
              value={c.op}
              disabled={ro}
              onChange={(e) => setAt(i, { op: e.target.value })}
            >
              {OPS.map((op) => (
                <option key={op} value={op}>
                  {OP_LABELS[op]}
                </option>
              ))}
            </Select>
          </div>
          {c.op === "is_empty" || c.op === "is_not_empty" ? (
            <span />
          ) : (
            <div className="space-y-1">
              <DataInput
                id={`${idBase}${i}-right`}
                label={c.op === "between" ? "From" : "Compared with"}
                value={c.right}
                data={data}
                def={def}
                o={o}
                ro={ro}
                onChange={(v) => setAt(i, { right: v })}
              />
              {c.op === "between" ? (
                <DataInput
                  id={`${idBase}${i}-right2`}
                  label="To"
                  value={c.right2}
                  data={data}
                  def={def}
                  o={o}
                  ro={ro}
                  onChange={(v) => setAt(i, { right2: v })}
                />
              ) : null}
            </div>
          )}
          {!ro ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove condition ${i + 1}`}
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              ✕
            </Button>
          ) : null}
        </div>
      ))}
      {!ro ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange([...value, { left: "", op: "eq", right: "" }])}
        >
          Add condition
        </Button>
      ) : null}
    </fieldset>
  );
}

function MapEditor({
  idBase,
  value,
  data,
  def,
  o,
  ro,
  onChange,
}: {
  idBase: string;
  value: Record<string, unknown>;
  data: DataGroup[];
  def: DefinitionV2;
  o: Overview;
  ro: boolean;
  onChange: (m: Record<string, unknown>) => void;
}) {
  const rows = Object.entries(value);
  return (
    <fieldset className="space-y-2">
      <legend className="text-xs font-semibold">Fields in the new list</legend>
      {rows.map(([k, v], i) => (
        <div key={i} className="grid items-end gap-2 sm:grid-cols-[10rem_1fr_auto]">
          <div>
            <Label htmlFor={`${idBase}${i}-k`}>Field name</Label>
            <Input
              id={`${idBase}${i}-k`}
              className="h-9"
              value={k}
              disabled={ro}
              onChange={(e) =>
                onChange(
                  Object.fromEntries(
                    rows.map(([kk, vv], j) => [
                      j === i ? e.target.value.replace(/[^A-Za-z0-9_]/g, "_") : kk,
                      vv,
                    ]),
                  ),
                )
              }
            />
          </div>
          <DataInput
            id={`${idBase}${i}-v`}
            label="Value"
            value={v}
            data={data}
            def={def}
            o={o}
            ro={ro}
            onChange={(nv) =>
              onChange(Object.fromEntries(rows.map(([kk, vv], j) => [kk, j === i ? nv : vv])))
            }
          />
          {!ro ? (
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Remove field ${k}`}
              onClick={() => onChange(Object.fromEntries(rows.filter((_, j) => j !== i)))}
            >
              ✕
            </Button>
          ) : null}
        </div>
      ))}
      {!ro ? (
        <Button
          size="sm"
          variant="outline"
          onClick={() => onChange({ ...value, [`field_${rows.length + 1}`]: "" })}
        >
          Add field
        </Button>
      ) : null}
    </fieldset>
  );
}

function TestTrace({ result }: { result: TestResult }) {
  return (
    <div className="mt-3 space-y-2" role="status">
      <p className="font-medium">
        {result.status === "succeeded"
          ? "The test run succeeded."
          : result.status === "failed"
            ? "The test run failed."
            : `Test run: ${result.status}.`}
        {result.error ? ` ${result.error}` : ""}
      </p>
      <ol className="space-y-1">
        {result.trace.map((t, i) => (
          <li key={`${t.key}-${i}`} className="rounded border p-2">
            <div className="flex items-center gap-2">
              <StatusBadge status={t.status} />
              <span className="font-medium">{t.name}</span>
              <code className="text-[11px] text-muted-foreground">{t.key}</code>
            </div>
            {t.detail ? <p className="mt-0.5 text-xs text-muted-foreground">{t.detail}</p> : null}
            {t.output && typeof t.output === "object" && Object.keys(t.output).length ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-xs">What it gave later steps</summary>
                <pre className="mt-1 max-h-48 overflow-auto rounded bg-muted p-2 text-[11px]">
                  {JSON.stringify(t.output, null, 2)}
                </pre>
              </details>
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
