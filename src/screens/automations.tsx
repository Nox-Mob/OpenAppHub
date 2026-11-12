import type { ScreenProps } from "./types";
import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { AutomationsPanel } from "@shared/ui/Automations";
import { HelpLink } from "@shared/ui/HelpLink";
import { APP_NAMES } from "@shared/apps";
import type { AppId } from "@shared/supabase/hosted";
import { NoOrganization, PageHeader, Panel } from "@/components/hub/HubShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { WORKFLOWS_RUN_AS_ORG } from "@/lib/roles";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { HELP } from "@/config/help";
import { canManage } from "@/lib/roles";
import {
  OP_LABELS,
  describeWorkflow,
  draftProblems,
  emptyAction,
  emptyDefinition,
  fieldsOf,
  opsFor,
  placeholders,
  withOrder,
  type Action,
  type Branch,
  type Condition,
  type Definition,
  type Field,
  type Overview,
  type ParamSpec,
  type Recipient,
  type TriggerType,
  type Workflow,
} from "@/lib/workflows";

type Msg = { ok: boolean; text: string } | null;
type Run = {
  id: number;
  workflow_name: string;
  status: string;
  branch: string | null;
  log: Array<{ action: string; ok: boolean; detail: string }>;
  error: string | null;
  started_at: string;
  summary: string;
};

const textarea =
  "min-h-20 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function appName(app: string) {
  return APP_NAMES[app as AppId] ?? "OpenAppHub";
}

export function AutomationsScreen({ hub }: ScreenProps) {
  const org = hub.orgs.find((o) => o.id === hub.currentOrgId);
  const supabase = getSupabaseBrowserClient();
  const [overview, setOverview] = useState<Overview | null>(null);
  const [runs, setRuns] = useState<Run[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Workflow | "new" | null>(null);
  const [msg, setMsg] = useState<Msg>(null);

  const load = useCallback(async () => {
    if (!supabase || !org) return;
    const [o, r] = await Promise.all([
      supabase.rpc("workflow_overview", { p_org: org.id }),
      supabase.rpc("workflow_runs", { p_org: org.id, p_workflow: null, p_limit: 30 }),
    ]);
    if (o.error) {
      setError(
        /workflow_overview/.test(o.error.message)
          ? "Workflows aren't available on this server yet."
          : o.error.message,
      );
      return;
    }
    setError(null);
    setOverview(o.data as Overview);
    setRuns((r.data ?? []) as Run[]);
  }, [supabase, org]);
  useEffect(() => {
    void load();
  }, [load]);

  if (!org) return <NoOrganization />;

  async function call(fn: string, args: Record<string, unknown>, ok: string) {
    if (!supabase) return false;
    const { error: e } = await supabase.rpc(fn, args);
    setMsg(e ? { ok: false, text: e.message } : { ok: true, text: ok });
    if (!e) await load();
    return !e;
  }

  if (editing && overview)
    return (
      <>
        <PageHeader
          title={editing === "new" ? "New workflow" : `Edit "${editing.name}"`}
          description="When something happens, if it matches, then do these things. Nothing runs until you save."
          actions={<HelpLink path={HELP.automations}>How workflows work</HelpLink>}
        />
        <WorkflowEditor
          overview={overview}
          workflow={editing === "new" ? null : editing}
          onCancel={() => setEditing(null)}
          onSave={async (w) => {
            if (!supabase) return "No connection";
            const { error: e } = await supabase.rpc("save_workflow", {
              p_org: org.id,
              p_id: w.id,
              p_name: w.name,
              p_description: w.description,
              p_enabled: w.enabled,
              p_definition: w.definition,
              p_shared: w.shared,
            });
            if (e) return e.message;
            setEditing(null);
            setMsg({ ok: true, text: "Workflow saved." });
            await load();
            return null;
          }}
        />
      </>
    );

  const o = overview;
  return (
    <>
      <PageHeader
        title="Automations"
        description={`What the apps do on their own for ${org.name}: your own workflows, and the ready-made reminders.`}
        actions={
          <>
            <HelpLink path={HELP.automations}>How workflows work</HelpLink>
            {o?.can_edit && o.may_build ? (
              <Button onClick={() => setEditing("new")}>New workflow</Button>
            ) : null}
          </>
        }
      />
      <div className="max-w-4xl space-y-6">
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        {msg ? (
          <p role="status" className={`text-sm ${msg.ok ? "" : "text-destructive"}`}>
            {msg.text}
          </p>
        ) : null}
        {!o && !error ? <p className="text-sm text-muted-foreground">Loading…</p> : null}
        {o ? (
          <>
            <Panel
              title="Your workflows"
              description="Each workflow runs only on this organization's own information. Build them to fit how you work: when something happens, check what you care about, and do what you need."
            >
              {o.workflows.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No workflows yet.{" "}
                  {o.can_edit && o.may_build
                    ? "Select New workflow to build your first: for example, when a board meeting is 5 days away, add the financial reports to it."
                    : o.is_chapter && !o.may_build
                      ? "Your national builds workflows for its chapters; you can use the ones it shares below."
                      : "Owners, admins and people they choose can build them."}
                </p>
              ) : (
                <ul className="space-y-3">
                  {o.workflows.map((w) => (
                    <WorkflowCard
                      key={w.id}
                      w={w}
                      o={o}
                      onEdit={() => setEditing(w)}
                      onToggle={(on) =>
                        void call(
                          "set_workflow_enabled",
                          { p_id: w.id, p_enabled: on },
                          on ? "Switched on." : "Switched off.",
                        )
                      }
                      onDelete={() =>
                        void call("delete_workflow", { p_id: w.id }, "Workflow deleted.")
                      }
                    />
                  ))}
                </ul>
              )}
            </Panel>

            {o.is_chapter ? (
              <Panel
                title="Shared by your national"
                description="Workflows your national offers its chapters. Using one runs it on this chapter's information only; your national's own information is never mixed in."
              >
                {o.shared_by_parent.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Your national hasn't shared any workflows.
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {o.shared_by_parent.map((s) => (
                      <li key={s.id} className="rounded-md border p-3 text-sm">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium">{s.name}</p>
                            {s.description ? (
                              <p className="text-muted-foreground">{s.description}</p>
                            ) : null}
                          </div>
                          {s.in_use ? (
                            <span className="text-muted-foreground">In use</span>
                          ) : o.can_edit ? (
                            <Button
                              size="sm"
                              onClick={() =>
                                void call(
                                  "adopt_workflow",
                                  { p_org: org.id, p_source: s.id },
                                  "Now in use for this chapter.",
                                )
                              }
                            >
                              Use it
                            </Button>
                          ) : null}
                        </div>
                        <Summary lines={describeWorkflow(s.definition, o)} />
                      </li>
                    ))}
                  </ul>
                )}
              </Panel>
            ) : null}

            <Panel
              title="Ready-made automations"
              description="Reminders the apps send on their own. Switch one off or change when it runs."
            >
              <AutomationsPanel client={supabase} orgId={org.id} canEdit={canManage(hub.role)} />
            </Panel>

            <Panel
              title="What happened"
              description="The latest runs, newest first. A run that couldn't do something says why."
            >
              {runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing has run yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {runs.map((r) => (
                    <li key={r.id} className="py-2">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span className="font-medium">
                          {r.workflow_name}
                          {r.summary ? (
                            <span className="font-normal text-muted-foreground">
                              {" "}
                              · {r.summary}
                            </span>
                          ) : null}
                        </span>
                        <span className="text-muted-foreground">
                          {new Date(r.started_at).toLocaleString()}
                        </span>
                      </div>
                      <p
                        className={
                          r.status === "failed" ? "text-destructive" : "text-muted-foreground"
                        }
                      >
                        {r.branch ? `${r.branch}: ` : ""}
                        {r.status === "nothing"
                          ? "nothing to do (no branch matched)"
                          : r.log.map((l) => `${l.ok ? "✓" : "✗"} ${l.detail}`).join(" · ") ||
                            r.error}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <EditorsPanel orgId={org.id} o={o} call={call} />
          </>
        ) : null}
      </div>
    </>
  );
}

function Summary({ lines }: { lines: string[] }) {
  return (
    <ul className="mt-2 space-y-0.5 text-sm text-muted-foreground">
      {lines.map((l, i) => (
        <li key={i}>{l}</li>
      ))}
    </ul>
  );
}

function WorkflowCard({
  w,
  o,
  onEdit,
  onToggle,
  onDelete,
}: {
  w: Workflow;
  o: Overview;
  onEdit: () => void;
  onToggle: (on: boolean) => void;
  onDelete: () => void;
}) {
  const [confirm, setConfirm] = useState(false);
  const adopted = !!w.adopted_from;
  return (
    <li className="rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {w.name}
            {w.shared ? (
              <span className="ml-2 text-xs text-muted-foreground">Shared with chapters</span>
            ) : null}
            {adopted ? (
              <span className="ml-2 text-xs text-muted-foreground">From your national</span>
            ) : null}
          </p>
          {w.description ? <p className="text-muted-foreground">{w.description}</p> : null}
          {adopted && !w.source_active ? (
            <p className="text-destructive">
              Your national stopped sharing this workflow, so it doesn't run.
            </p>
          ) : null}
        </div>
        <label className="flex items-center gap-2 font-medium">
          <input
            type="checkbox"
            role="switch"
            className="size-4 accent-primary"
            checked={w.enabled}
            disabled={!o.can_edit}
            onChange={(e) => onToggle(e.target.checked)}
          />
          {w.enabled ? "On" : "Off"}
        </label>
      </div>
      <Summary lines={describeWorkflow(w.definition, o)} />
      <p className="mt-2 text-xs text-muted-foreground">
        {w.last_run
          ? `Last ran ${new Date(w.last_run.at).toLocaleString()}${w.last_run.status === "failed" ? " (something couldn't be done; see What happened)" : ""}.`
          : "Hasn't run yet."}
      </p>
      {o.can_edit ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {!adopted ? (
            <Button size="sm" variant="outline" onClick={onEdit}>
              Edit
            </Button>
          ) : null}
          <Button size="sm" variant="outline" onClick={() => setConfirm(true)}>
            {adopted ? "Stop using" : "Delete"}
          </Button>
        </div>
      ) : null}
      {confirm ? (
        <ConfirmDialog
          title={adopted ? `Stop using "${w.name}"?` : `Delete "${w.name}"?`}
          confirmLabel={adopted ? "Stop using" : "Delete"}
          destructive={!adopted}
          onCancel={() => setConfirm(false)}
          onConfirm={() => {
            setConfirm(false);
            onDelete();
          }}
        >
          <p>
            {adopted
              ? "It stops running for this chapter. You can use it again later."
              : "It stops running, and its history goes with it. Tasks it already gave people stay."}
          </p>
        </ConfirmDialog>
      ) : null}
    </li>
  );
}

function EditorsPanel({
  orgId,
  o,
  call,
}: {
  orgId: string;
  o: Overview;
  call: (fn: string, args: Record<string, unknown>, ok: string) => Promise<boolean>;
}) {
  const [pick, setPick] = useState("");
  const [confirming, setConfirming] = useState(false);
  const candidates = o.members.filter(
    (m) => !["owner", "admin"].includes(m.role) && !o.editors.some((e) => e.user_id === m.user_id),
  );
  return (
    <Panel
      title="Who can build workflows"
      description="Owners and admins always can. Choose anyone else in the organization who should, for example your secretary."
    >
      {o.editors.length ? (
        <ul className="mb-3 divide-y rounded-md border text-sm">
          {o.editors.map((e) => (
            <li key={e.user_id} className="flex items-center justify-between gap-2 px-3 py-2">
              <span>
                {e.name || e.email}{" "}
                <span className="text-muted-foreground">{e.name ? e.email : ""}</span>
              </span>
              {o.can_manage_editors ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void call(
                      "grant_automation_editor",
                      { p_org: orgId, p_user: e.user_id, p_grant: false },
                      "Removed.",
                    )
                  }
                >
                  Remove
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-3 text-sm text-muted-foreground">Only owners and admins, so far.</p>
      )}
      <p className="mb-3 flex gap-1.5 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
        <span aria-hidden="true">⚠</span>
        <span>{WORKFLOWS_RUN_AS_ORG}</span>
      </p>
      {o.can_manage_editors && candidates.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1">
            <Label htmlFor="editor-pick">Add someone</Label>
            <Select id="editor-pick" value={pick} onChange={(e) => setPick(e.target.value)}>
              <option value="">Choose a person…</option>
              {candidates.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
          <Button disabled={!pick} onClick={() => setConfirming(true)}>
            Add
          </Button>
        </div>
      ) : null}
      {o.has_chapters && o.can_manage_editors ? (
        <label className="mt-4 flex items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={o.chapters_may_build}
            onChange={(e) =>
              void call(
                "set_chapters_may_build",
                { p_org: orgId, p_allowed: e.target.checked },
                "Saved.",
              )
            }
          />
          <span>
            <span className="font-medium">Chapters may build their own workflows</span>
            <span className="block text-muted-foreground">
              Chapters with their own organization can always use the workflows you share with them.
              Each runs on its own information only.
            </span>
          </span>
        </label>
      ) : null}
      {confirming ? (
        <ConfirmDialog
          title={`Let ${o.members.find((m) => m.user_id === pick)?.name ?? "them"} build workflows?`}
          confirmLabel="Let them build workflows"
          onConfirm={() => {
            setConfirming(false);
            void call(
              "grant_automation_editor",
              { p_org: orgId, p_user: pick, p_grant: true },
              "They can build workflows now.",
            ).then((ok) => ok && setPick(""));
          }}
          onCancel={() => setConfirming(false)}
        >
          <p>{WORKFLOWS_RUN_AS_ORG}</p>
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
}

// ── The editor ────────────────────────────────────────────────────────────────────────────────

export function WorkflowEditor({
  overview: o,
  workflow,
  onSave,
  onCancel,
}: {
  overview: Overview;
  workflow: Workflow | null;
  onSave: (w: {
    id: string | null;
    name: string;
    description: string;
    enabled: boolean;
    shared: boolean;
    definition: Definition;
  }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(workflow?.name ?? "");
  const [description, setDescription] = useState(workflow?.description ?? "");
  const [enabled, setEnabled] = useState(workflow?.enabled ?? true);
  const [shared, setShared] = useState(workflow?.shared ?? false);
  const [d, setD] = useState<Definition>(() => {
    const base = workflow?.definition ?? emptyDefinition();
    return {
      trigger: base.trigger,
      always: base.always ?? [],
      branches: base.branches ?? [],
      otherwise: base.otherwise ?? [],
    };
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const trigger = o.triggers.find((t) => t.type === d.trigger.type);
  const fields = fieldsOf(trigger);
  const problems = useMemo(() => draftProblems(name, d, o), [name, d, o]);

  const byApp = new Map<string, TriggerType[]>();
  for (const t of o.triggers) byApp.set(t.app, [...(byApp.get(t.app) ?? []), t]);

  async function save() {
    setBusy(true);
    setErr(
      await onSave({ id: workflow?.id ?? null, name, description, enabled, shared, definition: d }),
    );
    setBusy(false);
  }

  return (
    <div className="max-w-4xl space-y-6">
      <Panel title="Name">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="wf-name">Name</Label>
            <Input
              id="wf-name"
              value={name}
              maxLength={120}
              onChange={(e) => setName(e.target.value)}
              placeholder="Award routing"
            />
          </div>
          <div>
            <Label htmlFor="wf-desc">Description (optional)</Label>
            <Input
              id="wf-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
            />
            On
          </label>
          {o.has_chapters && !o.is_chapter ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="size-4 accent-primary"
                checked={shared}
                onChange={(e) => setShared(e.target.checked)}
              />
              Share with chapters (each chapter that uses it runs it on its own information)
            </label>
          ) : null}
        </div>
      </Panel>

      <Panel title="When" description="What starts this workflow.">
        <Label htmlFor="wf-trigger">When</Label>
        <Select
          id="wf-trigger"
          value={d.trigger.type}
          onChange={(e) => setD({ ...d, trigger: { type: e.target.value, params: {} } })}
        >
          <option value="">Choose…</option>
          {[...byApp.entries()].map(([app, list]) => (
            <optgroup key={app} label={appName(app)}>
              {list.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
        {trigger ? (
          <p className="mt-1 text-sm text-muted-foreground">{trigger.description}</p>
        ) : null}
        {trigger ? (
          <ParamFields
            idPrefix="wf-trigger"
            schema={trigger.params_schema}
            values={d.trigger.params}
            hide={(k) =>
              trigger.type === "core.schedule" &&
              k === "day" &&
              (d.trigger.params["frequency"] ?? "daily") === "daily"
            }
            onChange={(params) => setD({ ...d, trigger: { ...d.trigger, params } })}
          />
        ) : null}
      </Panel>

      {trigger ? (
        <>
          <Panel title="Always" description="Done every time, before any If below. Optional.">
            <ActionList
              o={o}
              trigger={trigger}
              actions={d.always}
              onChange={(always) => setD({ ...d, always })}
              idPrefix="always"
            />
          </Panel>

          <Panel
            title="If"
            description="Checked in order: the first If that matches runs its steps. Add as many as you need (Else if)."
          >
            <div className="space-y-4">
              {d.branches.map((b, i) => (
                <BranchEditor
                  key={i}
                  index={i}
                  b={b}
                  o={o}
                  trigger={trigger}
                  fields={fields}
                  onChange={(nb) =>
                    setD({ ...d, branches: d.branches.map((x, j) => (j === i ? nb : x)) })
                  }
                  onRemove={() => setD({ ...d, branches: d.branches.filter((_, j) => j !== i) })}
                  onMove={(dir) => {
                    const j = i + dir;
                    if (j < 0 || j >= d.branches.length) return;
                    const next = [...d.branches];
                    [next[i], next[j]] = [next[j]!, next[i]!];
                    setD({ ...d, branches: next });
                  }}
                />
              ))}
              <Button
                variant="outline"
                disabled={fields.length === 0}
                onClick={() =>
                  setD({
                    ...d,
                    branches: [
                      ...d.branches,
                      {
                        match: "all",
                        conditions: [{ field: fields[0]!.key, op: opsFor(fields[0])[0]! }],
                        actions: [],
                      },
                    ],
                  })
                }
              >
                {d.branches.length ? "Add Else if" : "Add If"}
              </Button>
              {fields.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  This When doesn't carry anything to check, so use Always or Otherwise.
                </p>
              ) : null}
            </div>
          </Panel>

          <Panel
            title={d.branches.length ? "Otherwise" : "Then"}
            description={d.branches.length ? "When no If matched. Optional." : "What to do."}
          >
            <ActionList
              o={o}
              trigger={trigger}
              actions={d.otherwise}
              onChange={(otherwise) => setD({ ...d, otherwise })}
              idPrefix="otherwise"
            />
          </Panel>
        </>
      ) : null}

      <Panel title="In plain words" description="Read it back before you save.">
        <Summary lines={describeWorkflow(d, o)} />
        {problems.length ? (
          <ul className="mt-3 list-disc space-y-0.5 pl-5 text-sm text-destructive">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
        {err ? (
          <Alert variant="destructive" className="mt-3">
            {err}
          </Alert>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Button disabled={busy || problems.length > 0} onClick={() => void save()}>
            {busy ? "Saving…" : "Save workflow"}
          </Button>
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </Panel>
    </div>
  );
}

function BranchEditor({
  index,
  b,
  o,
  trigger,
  fields,
  onChange,
  onRemove,
  onMove,
}: {
  index: number;
  b: Branch;
  o: Overview;
  trigger: TriggerType;
  fields: Field[];
  onChange: (b: Branch) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const id = `branch-${index}`;
  return (
    <div
      className="rounded-md border p-3"
      aria-label={`${index === 0 ? "If" : "Else if"} #${index + 1}`}
      role="group"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">
          {index === 0 ? "If" : "Else if"} #{index + 1}
        </p>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" onClick={() => onMove(-1)} aria-label="Move up">
            ↑
          </Button>
          <Button size="sm" variant="outline" onClick={() => onMove(1)} aria-label="Move down">
            ↓
          </Button>
          <Button size="sm" variant="outline" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
      {b.conditions.length > 1 ? (
        <div className="mt-2 text-sm">
          <Label htmlFor={`${id}-match`}>Match</Label>{" "}
          <select
            id={`${id}-match`}
            className="ml-1 h-8 rounded-md border border-input bg-background px-2"
            value={b.match}
            onChange={(e) => onChange({ ...b, match: e.target.value as "all" | "any" })}
          >
            <option value="all">all of these</option>
            <option value="any">any of these</option>
          </select>
        </div>
      ) : null}
      <div className="mt-2 space-y-2">
        {b.conditions.map((c, i) => (
          <ConditionRow
            key={i}
            id={`${id}-c${i}`}
            c={c}
            fields={fields}
            onChange={(nc) =>
              onChange({ ...b, conditions: b.conditions.map((x, j) => (j === i ? nc : x)) })
            }
            onRemove={() => onChange({ ...b, conditions: b.conditions.filter((_, j) => j !== i) })}
          />
        ))}
        <Button
          size="sm"
          variant="outline"
          onClick={() =>
            onChange({
              ...b,
              conditions: [...b.conditions, { field: fields[0]!.key, op: opsFor(fields[0])[0]! }],
            })
          }
        >
          Add condition
        </Button>
      </div>
      <p className="mt-3 text-sm font-semibold">Then</p>
      <ActionList
        o={o}
        trigger={trigger}
        actions={b.actions}
        onChange={(actions) => onChange({ ...b, actions })}
        idPrefix={id}
      />
    </div>
  );
}

function ValueInput({
  id,
  field,
  value,
  label,
  onChange,
}: {
  id: string;
  field: Field | undefined;
  value: unknown;
  label: string;
  onChange: (v: unknown) => void;
}) {
  if (field?.options?.length)
    return (
      <Select
        id={id}
        aria-label={label}
        value={String(value ?? "")}
        onChange={(e) => onChange(e.target.value)}
        className="h-9"
      >
        <option value="">Choose…</option>
        {field.options.map((op) => (
          <option key={op} value={op}>
            {op}
          </option>
        ))}
      </Select>
    );
  if (field?.type === "boolean")
    return (
      <Select
        id={id}
        aria-label={label}
        value={String(value ?? "true")}
        onChange={(e) => onChange(e.target.value === "true")}
        className="h-9"
      >
        <option value="true">yes</option>
        <option value="false">no</option>
      </Select>
    );
  return (
    <Input
      id={id}
      aria-label={label}
      className="h-9"
      type={field?.type === "date" ? "date" : field?.type === "number" ? "number" : "text"}
      value={String(value ?? "")}
      onChange={(e) =>
        onChange(
          field?.type === "number" && e.target.value !== ""
            ? Number(e.target.value)
            : e.target.value,
        )
      }
    />
  );
}

function ConditionRow({
  id,
  c,
  fields,
  onChange,
  onRemove,
}: {
  id: string;
  c: Condition;
  fields: Field[];
  onChange: (c: Condition) => void;
  onRemove: () => void;
}) {
  const field = fields.find((f) => f.key === c.field);
  const ops = opsFor(field);
  const set = (patch: Partial<Condition>) =>
    onChange(
      withOrder(
        { ...c, ...patch },
        fields.find((f) => f.key === (patch.field ?? c.field)),
      ),
    );
  const needsValue = c.op !== "is_empty" && c.op !== "is_not_empty";
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <Select
        id={`${id}-field`}
        aria-label="Field"
        className="h-9 w-auto min-w-40"
        value={c.field}
        onChange={(e) => {
          const f = fields.find((x) => x.key === e.target.value);
          onChange({ field: e.target.value, op: opsFor(f)[0]! });
        }}
      >
        {fields.map((f) => (
          <option key={f.key} value={f.key}>
            {f.label}
          </option>
        ))}
      </Select>
      <Select
        id={`${id}-op`}
        aria-label="Comparison"
        className="h-9 w-auto"
        value={c.op}
        onChange={(e) => {
          const op = e.target.value as Condition["op"];
          set(
            op === "in" ? { op, value: [] } : { op, value: Array.isArray(c.value) ? "" : c.value },
          );
        }}
      >
        {ops.map((op) => (
          <option key={op} value={op}>
            {OP_LABELS[op]}
          </option>
        ))}
      </Select>
      {needsValue && c.op === "in" ? (
        field?.options?.length ? (
          <span className="flex flex-wrap gap-2">
            {field.options.map((op) => {
              const list = (Array.isArray(c.value) ? c.value : []) as string[];
              return (
                <label key={op} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={list.includes(op)}
                    onChange={(e) =>
                      set({
                        value: e.target.checked ? [...list, op] : list.filter((x) => x !== op),
                      })
                    }
                  />
                  {op}
                </label>
              );
            })}
          </span>
        ) : (
          <Input
            aria-label="Values, separated by commas"
            className="h-9 w-56"
            value={((Array.isArray(c.value) ? c.value : []) as string[]).join(", ")}
            onChange={(e) =>
              set({
                value: e.target.value
                  .split(",")
                  .map((x) => x.trim())
                  .filter(Boolean),
              })
            }
            placeholder="a, b, c"
          />
        )
      ) : needsValue ? (
        <>
          <span className="w-40">
            <ValueInput
              id={`${id}-value`}
              field={field}
              label="Value"
              value={c.value}
              onChange={(v) => set({ value: v })}
            />
          </span>
          {c.op === "between" ? (
            <>
              <span>and</span>
              <span className="w-40">
                <ValueInput
                  id={`${id}-value2`}
                  field={field}
                  label="Second value"
                  value={c.value2}
                  onChange={(v) => set({ value2: v })}
                />
              </span>
            </>
          ) : null}
        </>
      ) : null}
      <Button size="sm" variant="outline" onClick={onRemove} aria-label="Remove condition">
        ✕
      </Button>
    </div>
  );
}

function ActionList({
  o,
  trigger,
  actions,
  onChange,
  idPrefix,
}: {
  o: Overview;
  trigger: TriggerType;
  actions: Action[];
  onChange: (a: Action[]) => void;
  idPrefix: string;
}) {
  const [adding, setAdding] = useState("");
  const options = [
    { type: "email", label: "Send an email", app: "hub", ok: true },
    { type: "task", label: "Give someone a task", app: "hub", ok: true },
    ...o.actions.map((a) => ({
      type: a.type,
      label: a.label,
      app: a.app,
      ok: a.requires.every((r) => trigger.provides.includes(r)),
    })),
  ];
  return (
    <div className="space-y-3">
      {actions.map((a, i) => (
        <ActionEditor
          key={i}
          id={`${idPrefix}-a${i}`}
          step={i + 1}
          a={a}
          o={o}
          trigger={trigger}
          onChange={(na) => onChange(actions.map((x, j) => (j === i ? na : x)))}
          onRemove={() => onChange(actions.filter((_, j) => j !== i))}
        />
      ))}
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-56">
          <Label htmlFor={`${idPrefix}-add`}>Add a step</Label>
          <Select
            id={`${idPrefix}-add`}
            value={adding}
            onChange={(e) => setAdding(e.target.value)}
            className="h-9"
          >
            <option value="">Choose what to do…</option>
            {options.map((op) => (
              <option key={op.type} value={op.type} disabled={!op.ok}>
                {op.label}
                {op.app !== "hub" ? ` (${appName(op.app)})` : ""}
                {op.ok ? "" : " — needs a meeting When"}
              </option>
            ))}
          </Select>
        </div>
        <Button
          size="sm"
          variant="outline"
          disabled={!adding}
          onClick={() => {
            onChange([...actions, emptyAction(adding)]);
            setAdding("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

function ActionEditor({
  id,
  step,
  a,
  o,
  trigger,
  onChange,
  onRemove,
}: {
  id: string;
  step: number;
  a: Action;
  o: Overview;
  trigger: TriggerType;
  onChange: (a: Action) => void;
  onRemove: () => void;
}) {
  const type = o.actions.find((x) => x.type === a.type);
  const title =
    a.type === "email"
      ? "Send an email"
      : a.type === "task"
        ? "Give someone a task"
        : (type?.label ?? a.type);
  const tips = placeholders(trigger);
  let body: ReactNode = null;
  if (a.type === "email" || a.type === "task")
    body = (
      <>
        <RecipientEditor
          id={`${id}-to`}
          r={a["to"] as Recipient}
          o={o}
          onChange={(to) => onChange({ ...a, to })}
        />
        {a.type === "email" ? (
          <>
            <div>
              <Label htmlFor={`${id}-subject`}>Subject</Label>
              <Input
                id={`${id}-subject`}
                value={String(a["subject"] ?? "")}
                onChange={(e) => onChange({ ...a, subject: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`${id}-message`}>Message</Label>
              <textarea
                id={`${id}-message`}
                className={textarea}
                value={String(a["message"] ?? "")}
                onChange={(e) => onChange({ ...a, message: e.target.value })}
              />
            </div>
          </>
        ) : (
          <>
            <div>
              <Label htmlFor={`${id}-title`}>Task</Label>
              <Input
                id={`${id}-title`}
                value={String(a["title"] ?? "")}
                onChange={(e) => onChange({ ...a, title: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor={`${id}-due`}>Due in (days, optional)</Label>
              <Input
                id={`${id}-due`}
                type="number"
                min={0}
                max={365}
                value={
                  a["due_in_days"] === undefined || a["due_in_days"] === null
                    ? ""
                    : String(a["due_in_days"])
                }
                onChange={(e) => {
                  const rest = { ...a };
                  delete rest["due_in_days"];
                  onChange(
                    e.target.value === ""
                      ? (rest as Action)
                      : { ...a, due_in_days: Number(e.target.value) },
                  );
                }}
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor={`${id}-note`}>Note (optional)</Label>
              <textarea
                id={`${id}-note`}
                className={textarea}
                value={String(a["note"] ?? "")}
                onChange={(e) => onChange({ ...a, note: e.target.value })}
              />
            </div>
          </>
        )}
        {tips.length ? (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            You can put details in the text: {tips.slice(0, 8).join(" ")}
            {tips.length > 8 ? " …" : ""}
          </p>
        ) : null}
      </>
    );
  else if (type)
    body = (
      <div className="sm:col-span-2">
        <p className="text-sm text-muted-foreground">{type.description}</p>
        <ParamFields
          idPrefix={id}
          schema={type.params_schema}
          values={a}
          hide={(k) => k === "date" && a["as_of"] !== "date"}
          labelFor={(k, v) => (k === "as_of" ? (AS_OF[v] ?? v) : v)}
          onChange={(v) => onChange({ ...v, type: a.type })}
        />
      </div>
    );
  return (
    <div className="rounded-md bg-muted/40 p-3" role="group" aria-label={`Step ${step}: ${title}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {step}. {title}
        </p>
        <Button size="sm" variant="outline" onClick={onRemove}>
          Remove
        </Button>
      </div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">{body}</div>
    </div>
  );
}

const AS_OF: Record<string, string> = {
  last_closed_month: "The last closed month",
  today: "Today (the year so far)",
  date: "A date I pick",
};

function RecipientEditor({
  id,
  r,
  o,
  onChange,
}: {
  id: string;
  r: Recipient | undefined;
  o: Overview;
  onChange: (r: Recipient) => void;
}) {
  const type = r?.type ?? "role";
  const appType = o.recipients.find((x) => x.type === type);
  return (
    <div className="space-y-2 sm:col-span-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <div>
          <Label htmlFor={`${id}-type`}>To</Label>
          <Select
            id={`${id}-type`}
            className="h-9"
            value={type}
            onChange={(e) => {
              const t = e.target.value;
              if (t === "role") onChange({ type: t, roles: ["owner", "admin"] });
              else if (t === "user") onChange({ type: t, user_id: o.members[0]?.user_id ?? "" });
              else if (t === "subject") onChange({ type: t });
              else {
                const s = o.recipients.find((x) => x.type === t);
                const params: Record<string, unknown> = {};
                for (const [k, spec] of Object.entries(s?.params_schema ?? {}))
                  if (spec.type === "choice" && spec.options?.length) params[k] = spec.options[0];
                onChange({ type: t, ...params });
              }
            }}
          >
            <option value="role">People with a role</option>
            <option value="subject">The person it's about</option>
            <option value="user">A particular person</option>
            {o.recipients.map((x) => (
              <option key={x.type} value={x.type}>
                {x.label} ({appName(x.app)})
              </option>
            ))}
          </Select>
        </div>
        {type === "user" ? (
          <div>
            <Label htmlFor={`${id}-user`}>Person</Label>
            <Select
              id={`${id}-user`}
              className="h-9"
              value={String(r?.["user_id"] ?? "")}
              onChange={(e) => onChange({ type, user_id: e.target.value })}
            >
              {o.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
      </div>
      {type === "role" ? (
        <div className="flex flex-wrap gap-3 text-sm">
          {(["owner", "admin", "member", "viewer"] as const).map((role) => {
            const roles = ((r?.["roles"] as string[]) ?? []) as string[];
            return (
              <label key={role} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={roles.includes(role)}
                  onChange={(e) =>
                    onChange({
                      type,
                      roles: e.target.checked ? [...roles, role] : roles.filter((x) => x !== role),
                    })
                  }
                />
                {role === "owner"
                  ? "Owner"
                  : role === "admin"
                    ? "Admins"
                    : role === "member"
                      ? "Members"
                      : "Viewers"}
              </label>
            );
          })}
        </div>
      ) : null}
      {type === "subject" ? (
        <p className="text-xs text-muted-foreground">
          The member, the person an action item is assigned to, or whoever the event is about.
        </p>
      ) : null}
      {appType ? (
        <>
          <p className="text-xs text-muted-foreground">{appType.description}</p>
          <ParamFields
            idPrefix={`${id}-p`}
            schema={appType.params_schema}
            values={r ?? {}}
            labelFor={(k, v) => (k === "level" ? (LEVEL[v] ?? v) : v.replace(/_/g, " "))}
            choices={Array.isArray(appType.param_options) ? undefined : appType.param_options}
            onChange={(v) => onChange({ ...v, type })}
          />
        </>
      ) : null}
    </div>
  );
}

const LEVEL: Record<string, string> = {
  unit: "Their own chapter (or unit)",
  parent: "The level above",
  region: "Their region",
  national: "The national",
};

function ParamFields({
  idPrefix,
  schema,
  values,
  onChange,
  hide,
  labelFor = (_k, v) => v,
  choices,
}: {
  idPrefix: string;
  schema: Record<string, ParamSpec>;
  values: Record<string, unknown>;
  onChange: (v: Record<string, unknown>) => void;
  hide?: (k: string) => boolean;
  labelFor?: (key: string, value: string) => string;
  /** Choices for a text setting, offered by the app (e.g. the organization's seats). */
  choices?: Record<string, string[]> | undefined;
}) {
  const entries = Object.entries(schema).filter(([k]) => !hide?.(k));
  if (!entries.length) return null;
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      {entries.map(([k, s]) => {
        const id = `${idPrefix}-${k}`;
        const v = values[k];
        const set = (nv: unknown) => {
          const next = { ...values };
          if (nv === "" || nv === undefined) delete next[k];
          else next[k] = nv;
          onChange(next);
        };
        return (
          <div key={k}>
            <Label htmlFor={id}>{s.label ?? k}</Label>
            {s.type === "choice" ? (
              <Select
                id={id}
                className="h-9"
                value={String(v ?? "")}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">Choose…</option>
                {(s.options ?? []).map((op) => (
                  <option key={op} value={op}>
                    {labelFor(k, op)}
                  </option>
                ))}
              </Select>
            ) : s.type === "text" && choices?.[k]?.length ? (
              <Select
                id={id}
                className="h-9"
                value={String(v ?? "")}
                onChange={(e) => set(e.target.value)}
              >
                <option value="">Choose…</option>
                {choices[k].map((op) => (
                  <option key={op} value={op}>
                    {labelFor(k, op)}
                  </option>
                ))}
                {v && !choices[k].includes(String(v)) ? (
                  <option value={String(v)}>{labelFor(k, String(v))}</option>
                ) : null}
              </Select>
            ) : s.type === "bool" ? (
              <input
                id={id}
                type="checkbox"
                className="ml-2 size-4 accent-primary"
                checked={!!v}
                onChange={(e) => set(e.target.checked)}
              />
            ) : (
              <Input
                id={id}
                className="h-9"
                type={s.type === "int" ? "number" : s.type === "date" ? "date" : "text"}
                min={s.min}
                max={s.max}
                value={v === undefined || v === null ? "" : String(v)}
                onChange={(e) =>
                  set(
                    s.type === "int"
                      ? e.target.value === ""
                        ? ""
                        : Number(e.target.value)
                      : e.target.value,
                  )
                }
              />
            )}
            {s.help ? <p className="mt-1 text-xs text-muted-foreground">{s.help}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
