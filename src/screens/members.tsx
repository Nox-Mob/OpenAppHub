import type { ScreenProps } from "./types";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { formatDate } from "@shared/format";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import type { OrgRole } from "@shared/supabase/org";
import { HelpLink } from "@shared/ui/HelpLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NoOrganization, PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { sendInvitation } from "@/lib/members";
import type { InviteResult } from "@/lib/members-core";
import { HELP } from "@/config/help";
import {
  APP_ROLE_HELP,
  APP_ROLE_LABEL,
  ROLE_HELP,
  ROLE_LABEL,
  WORKFLOWS_RUN_AS_ORG,
  canManage,
} from "@/lib/roles";
import { must, useAsync } from "@/lib/use-async";
import {
  appRoleOf,
  boardRole,
  loadAppRoles,
  type NamedRole,
  type PermissionType,
  type ResolvedRole,
} from "@/lib/people";

type Member = { user_id: string; display_name: string | null; email: string; role: OrgRole };
type Invitation = {
  id: string;
  email: string | null;
  role: OrgRole | null;
  app: string | null;
  status: "pending" | "used" | "expired" | "revoked";
  expires_at: string;
  invited_by_name: string | null;
};

export function MembersScreen({
  user,
  hub,
  invite = sendInvitation,
}: ScreenProps & { invite?: typeof sendInvitation }) {
  const router = useRouter();
  const orgId = hub.currentOrgId;
  const manage = canManage(hub.role);
  const supabase = getSupabaseBrowserClient();

  const members = useAsync(
    async () =>
      orgId && supabase
        ? ((await must(supabase.rpc("org_member_directory", { p_org: orgId }))) as Member[])
        : [],
    [orgId, supabase],
  );
  const invitations = useAsync(
    async () =>
      orgId && supabase && manage
        ? ((await must(supabase.rpc("list_invitations", { p_org: orgId }))) as Invitation[]).filter(
            (i) => i.status === "pending",
          )
        : [],
    [orgId, supabase, manage],
  );
  // H-04: each person's role in every app the organization uses.
  const appRoles = useAsync(
    async () => (orgId && supabase ? loadAppRoles(supabase, orgId) : null),
    [orgId, supabase],
  );
  // Core 0015: with "App admins may change people's roles in their own app" on, the apps this
  // person is an admin in. Owners and OpenAppHub admins already manage every app.
  const roleSettings = useAsync(async () => {
    if (!orgId || !supabase || manage) return false;
    const { data, error: e } = await supabase.rpc(
      "org_role_settings" as never,
      {
        p_org: orgId,
      } as never,
    );
    if (e) return false;
    const row = (Array.isArray(data) ? data[0] : data) as {
      app_admins_manage_roles?: boolean;
    } | null;
    return !!row?.app_admins_manage_roles;
  }, [orgId, supabase, manage]);
  const editApps: App[] =
    !manage && roleSettings.data && appRoles.data
      ? APPS.filter(
          (a) =>
            appRoleOf(
              hub.role ?? "viewer",
              a,
              user.id,
              appRoles.data!.overrides,
              appRoles.data!.resolved,
            ) === "admin",
        )
      : [];
  const [error, setError] = useState("");
  const [removing, setRemoving] = useState<Member | null>(null);
  const [busy, setBusy] = useState(false);

  if (!orgId) return <NoOrganization />;

  async function changeRole(m: Member, role: OrgRole) {
    if (!supabase) return;
    setError("");
    const { error } = await supabase
      .from("memberships")
      .update({ role })
      .eq("org_id", orgId)
      .eq("user_id", m.user_id);
    if (error) setError(error.message);
    void members.reload();
  }

  async function remove(m: Member) {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase
      .from("memberships")
      .delete()
      .eq("org_id", orgId)
      .eq("user_id", m.user_id);
    setBusy(false);
    setRemoving(null);
    if (error) return setError(error.message);
    if (m.user_id === user.id) {
      await router.invalidate();
      await router.navigate({ to: "/" });
      return;
    }
    void members.reload();
  }

  async function revoke(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc("revoke_invitation", { p_id: id });
    if (error) setError(error.message);
    void invitations.reload();
  }

  const org = hub.orgs.find((o) => o.id === orgId);
  return (
    <>
      <PageHeader
        title="Members"
        description={`People in ${org?.name ?? "your organization"} and what they can do in every app.`}
        actions={<HelpLink path={HELP.members}>How invitations work</HelpLink>}
      />
      {error ? (
        <Alert variant="destructive" className="mb-4">
          {error}
        </Alert>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <Panel
          title="People"
          description={
            members.data
              ? `${members.data.length} ${members.data.length === 1 ? "person" : "people"}`
              : undefined
          }
        >
          {members.loading && !members.data ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : null}
          {members.error ? <Alert variant="destructive">{members.error}</Alert> : null}
          <ul className="divide-y">
            {(members.data ?? []).map((m) => {
              const isMe = m.user_id === user.id;
              const editable = manage && m.role !== "owner";
              return (
                <li key={m.user_id} className="flex flex-wrap items-center gap-3 py-3">
                  <span
                    className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-xs font-semibold text-secondary-foreground"
                    aria-hidden="true"
                  >
                    {(m.display_name || m.email).slice(0, 2).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {m.display_name || m.email}{" "}
                      {isMe ? (
                        <span className="font-normal text-muted-foreground">(you)</span>
                      ) : null}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{m.email}</p>
                  </div>
                  {editable ? (
                    <Select
                      aria-label={`Role for ${m.display_name || m.email}`}
                      className="h-9 w-32"
                      value={m.role}
                      onChange={(e) => void changeRole(m, e.target.value as OrgRole)}
                    >
                      {(["admin", "member", "viewer"] as const).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </Select>
                  ) : (
                    <span className="rounded-sm bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">
                      {ROLE_LABEL[m.role]}
                    </span>
                  )}
                  {m.role !== "owner" && (manage || isMe) ? (
                    <Button variant="ghost" size="sm" onClick={() => setRemoving(m)}>
                      {isMe ? "Leave" : "Remove"}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </Panel>
        {!manage && editApps.length ? (
          <AppRolesPanel
            orgId={orgId!}
            members={(members.data ?? []).filter((m) => m.user_id !== user.id)}
            roles={appRoles.data ?? null}
            canEdit={false}
            editApps={editApps}
            onChanged={() => void appRoles.reload()}
          />
        ) : null}
        {manage ? (
          <div className="space-y-6">
            <AppRolesPanel
              orgId={orgId!}
              members={members.data ?? []}
              roles={appRoles.data ?? null}
              canEdit={manage}
              onChanged={() => void appRoles.reload()}
            />
            <NamedRolesPanel
              orgId={orgId!}
              roles={appRoles.data ?? null}
              canEdit={manage}
              onChanged={() => void appRoles.reload()}
            />
            <InvitePanel
              orgId={orgId}
              invite={invite}
              namedRoles={appRoles.data?.namedRoles ?? []}
              onInvited={() => void invitations.reload()}
            />
            <Panel
              title="Pending invitations"
              description="Each works once and expires after 14 days."
            >
              {(invitations.data ?? []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No pending invitations.</p>
              ) : (
                <ul className="divide-y">
                  {(invitations.data ?? []).map((i) => (
                    <li key={i.id} className="flex items-center gap-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {i.email ?? "Link invitation"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {i.role ? ROLE_LABEL[i.role] : `${i.app} access`} · expires{" "}
                          {formatDate(i.expires_at, { timeZone: hub.prefs.timeZone })}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-label={`Cancel the invitation for ${i.email ?? "this link"}`}
                        onClick={() => void revoke(i.id)}
                      >
                        Cancel
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
      {removing ? (
        <ConfirmDialog
          title={
            removing.user_id === user.id
              ? `Leave ${org?.name}?`
              : `Remove ${removing.display_name || removing.email}?`
          }
          confirmLabel={removing.user_id === user.id ? "Leave" : "Remove"}
          destructive
          busy={busy}
          onConfirm={() => void remove(removing)}
          onCancel={() => setRemoving(null)}
        >
          <p>
            {removing.user_id === user.id
              ? "You'll lose access to this organization in every app. Someone will need to invite you again."
              : "They'll lose access to this organization in every app. You can invite them again later."}
          </p>
        </ConfirmDialog>
      ) : null}
    </>
  );
}

const APPS = ["charter", "board", "ledger"] as const;
type App = (typeof APPS)[number];
const APP_NAME: Record<App, string> = {
  charter: "OpenCharterApp",
  board: "OpenBoardApp",
  ledger: "OpenLedgerApp",
};

export function InvitePanel({
  orgId,
  invite = sendInvitation,
  onInvited,
  title = "Invite someone",
  description,
  namedRoles = [],
}: {
  orgId: string;
  invite?: typeof sendInvitation;
  onInvited?: () => void;
  title?: string;
  description?: string;
  /** H-09: the organization's named roles, to give on the invitation. */
  namedRoles?: NamedRole[];
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [named, setNamed] = useState("");
  const [appRoles, setAppRoles] = useState<Partial<Record<App, "admin" | "member" | "viewer">>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<(InviteResult & { to: string }) | null>(null);
  const [copied, setCopied] = useState(false);
  const chosen = namedRoles.find((r) => r.id === named);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    setCopied(false);
    const res = await invite({
      data: {
        orgId,
        email,
        role,
        ...(named ? { namedRoleId: named } : {}),
        ...(Object.keys(appRoles).length ? { appRoles } : {}),
      },
    });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setResult({ ...res, to: email.trim() });
    setEmail("");
    onInvited?.();
  }

  return (
    <Panel title={title} description={description}>
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="invite-email">Email</Label>
          <Input
            id="invite-email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="invite-role">Role in OpenAppHub</Label>
          <Select
            id="invite-role"
            value={role}
            onChange={(e) => setRole(e.target.value as typeof role)}
            aria-describedby="invite-role-help"
          >
            {(["admin", "member", "viewer"] as const).map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </Select>
          <p id="invite-role-help" className="text-xs text-muted-foreground">
            {ROLE_HELP[role]}
          </p>
        </div>
        {namedRoles.length ? (
          <div className="space-y-2">
            <Label htmlFor="invite-named">Named role</Label>
            <Select id="invite-named" value={named} onChange={(e) => setNamed(e.target.value)}>
              <option value="">None</option>
              {namedRoles.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </Select>
          </div>
        ) : null}
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Role in each app</legend>
          {APPS.map((app) => (
            <div key={app} className="flex items-center gap-2">
              <Label htmlFor={`invite-${app}`} className="w-36 shrink-0 font-normal">
                {APP_NAME[app]}
              </Label>
              <Select
                id={`invite-${app}`}
                className="h-9"
                value={appRoles[app] ?? ""}
                onChange={(e) => {
                  const v = e.target.value as "" | "admin" | "member" | "viewer";
                  setAppRoles((cur) => {
                    const next = { ...cur };
                    if (v) next[app] = v;
                    else delete next[app];
                    return next;
                  });
                }}
              >
                <option value="">
                  {chosen?.app_roles[app]
                    ? `From ${chosen.name}: ${APP_ROLE_LABEL[chosen.app_roles[app]!]}`
                    : "Not set: viewer"}
                </option>
                {(["admin", "member", "viewer"] as const).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Each app's role is separate from the OpenAppHub role. Anything not set is view-only; you
            can change it later.
          </p>
        </fieldset>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <Button type="submit" disabled={busy}>
          {busy ? "Sending…" : "Send invitation"}
        </Button>
      </form>
      {result ? (
        <div className="mt-4 space-y-2 rounded-md border bg-muted/50 p-3 text-sm" role="status">
          <p>
            {result.email === "sent"
              ? `Invitation sent to ${result.to}.`
              : result.email === "existing"
                ? `${result.to} already has an account, so we didn't email them. Send them this link:`
                : `Invitation created. Email isn't set up here, so send ${result.to} this link:`}
          </p>
          <div className="flex gap-2">
            <Input
              readOnly
              value={result.link}
              aria-label="Invitation link"
              className="font-mono text-xs"
              onFocus={(e) => e.target.select()}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                void navigator.clipboard.writeText(result.link).then(() => setCopied(true))
              }
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            The link works once, for {result.to}, and expires in 14 days.
          </p>
        </div>
      ) : null}
    </Panel>
  );
}

function sourceText(r: ResolvedRole | undefined, namedName: string | undefined): string | null {
  if (!r) return null;
  if (r.source === "person") return "Set for this app";
  if (r.source === "named") return `From ${namedName ?? "their named role"}`;
  if (r.source === "fallback") return "Not set: viewer";
  return null;
}

/**
 * H-04 and H-09: every person's role in OpenAppHub, their named role, and their role in each
 * app, changed here by the owner and OpenAppHub admins (core 0011: set_named_role, set_app_role;
 * "Can build workflows": grant_automation_editor).
 */
export function AppRolesPanel({
  orgId,
  members,
  roles,
  canEdit,
  editApps,
  onChanged,
}: {
  orgId: string;
  members: Member[];
  roles: Awaited<ReturnType<typeof loadAppRoles>> | null;
  canEdit: boolean;
  /** Apps whose roles this person may change without managing people (core 0015: an app's
   * admins, when the organization allows it). Named roles and workflows stay with canEdit. */
  editApps?: App[];
  onChanged: () => void;
}) {
  const editApp = (app: App) => canEdit || (editApps ?? []).includes(app);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [granting, setGranting] = useState<Member | null>(null);
  if (!roles || members.length === 0) return null;
  const cols = APPS.filter((a) => roles[a] !== null);
  const hasNamed = roles.resolved.size > 0;
  // What the app adds on top of the role: an office, the treasurer, Charter's roles in units.
  const detail = (app: App, m: Member) => {
    const v = roles[app]?.get(m.user_id);
    if (!v) return null;
    if (app === "board") return boardRole("member", v);
    if (app === "ledger") return v === "treasurer" ? "Treasurer" : null;
    return v;
  };
  async function run(key: string, fn: string, args: Record<string, unknown>, ok: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(key);
    const { error } = await supabase.rpc(fn, args);
    setBusy(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: ok });
    if (!error) onChanged();
  }
  const who = (m: Member) => m.display_name || m.email;
  return (
    <Panel
      title="Roles in each app"
      description="Each app's role is separate from the OpenAppHub role: an OpenAppHub admin isn't an admin in the apps unless given that role there. A named role sets every app at once; a role set for one app wins over it. Anything not set is view-only. Offices (chair, secretary), treasurers and chapter roles are set in the app and shown underneath."
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-left text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="py-2 pr-3 font-medium">Person</th>
              <th className="py-2 pr-3 font-medium">OpenAppHub</th>
              {hasNamed ? <th className="py-2 pr-3 font-medium">Named role</th> : null}
              {cols.map((c) => (
                <th key={c} className="py-2 pr-3 font-medium">
                  {APP_NAME[c]}
                </th>
              ))}
              <th className="py-2 pr-3 font-medium">Can build workflows</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {members.map((m) => {
              const namedId = roles.namedRoleOf.get(m.user_id) ?? "";
              const namedName = roles.namedRoles.find((r) => r.id === namedId)?.name;
              return (
                <tr key={m.user_id} className="align-top">
                  <td className="py-2 pr-3">
                    <span className="font-medium">{who(m)}</span>
                    {m.display_name ? (
                      <span className="block text-xs text-muted-foreground">{m.email}</span>
                    ) : null}
                  </td>
                  <td className="py-2 pr-3">{ROLE_LABEL[m.role]}</td>
                  {hasNamed ? (
                    <td className="py-2 pr-3">
                      {m.role === "owner" ? (
                        <span className="text-muted-foreground">Owner everywhere</span>
                      ) : canEdit ? (
                        <select
                          aria-label={`${who(m)}'s named role`}
                          className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                          value={namedId}
                          disabled={busy !== null}
                          onChange={(e) =>
                            void run(
                              `nr:${m.user_id}`,
                              "set_named_role",
                              { p_org: orgId, p_user: m.user_id, p_role: e.target.value || null },
                              e.target.value
                                ? `${who(m)} is now ${roles.namedRoles.find((r) => r.id === e.target.value)?.name}.`
                                : `${who(m)} has no named role now.`,
                            )
                          }
                        >
                          <option value="">None</option>
                          {roles.namedRoles.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.name}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span>{namedName ?? "None"}</span>
                      )}
                    </td>
                  ) : null}
                  {cols.map((c) => {
                    const role = appRoleOf(m.role, c, m.user_id, roles.overrides, roles.resolved);
                    const extra = detail(c, m);
                    const res = roles.resolved.get(`${c}:${m.user_id}`);
                    const own = roles.overrides.has(`${c}:${m.user_id}`);
                    const fromNamed = roles.namedRoles.find((r) => r.id === namedId)?.app_roles[c];
                    const note = sourceText(res, namedName) ?? (own ? "Set for this app" : null);
                    return (
                      <td key={c} className="py-2 pr-3">
                        {m.role === "owner" || !editApp(c) ? (
                          <span>{APP_ROLE_LABEL[role]}</span>
                        ) : (
                          <select
                            aria-label={`${who(m)} in ${APP_NAME[c]}`}
                            className="h-8 rounded-md border border-input bg-background px-2 text-sm"
                            value={own ? role : ""}
                            disabled={busy !== null}
                            onChange={(e) =>
                              e.target.value === "none"
                                ? // No access (core 0015): the person can't open the app.
                                  void run(
                                    `${c}:${m.user_id}`,
                                    "set_app_access",
                                    {
                                      p_org: orgId,
                                      p_user: m.user_id,
                                      p_app: c,
                                      p_no_access: true,
                                    },
                                    `${who(m)} has no access to ${APP_NAME[c]} now.`,
                                  )
                                : void run(
                                    `${c}:${m.user_id}`,
                                    "set_app_role",
                                    {
                                      p_org: orgId,
                                      p_user: m.user_id,
                                      p_app: c,
                                      p_role: e.target.value || null,
                                    },
                                    e.target.value
                                      ? `${who(m)} is now ${ROLE_LABEL[e.target.value as OrgRole].toLowerCase()} in ${APP_NAME[c]}.`
                                      : `${who(m)}'s role in ${APP_NAME[c]} now comes from ${fromNamed ? namedName : "nothing (viewer)"}.`,
                                  )
                            }
                          >
                            <option value="">
                              {fromNamed
                                ? `From ${namedName}: ${APP_ROLE_LABEL[fromNamed]}`
                                : "Not set: viewer"}
                            </option>
                            {(["admin", "member", "viewer", "none"] as const).map((r) => (
                              <option key={r} value={r}>
                                {APP_ROLE_LABEL[r]}
                              </option>
                            ))}
                          </select>
                        )}
                        {extra && extra !== APP_ROLE_LABEL[role] ? (
                          <span className="mt-0.5 block text-xs text-muted-foreground">
                            {extra}
                          </span>
                        ) : null}
                        {note && m.role !== "owner" && !editApp(c) ? (
                          <span
                            className={`block text-xs ${res?.source === "fallback" ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground"}`}
                          >
                            {note}
                          </span>
                        ) : null}
                      </td>
                    );
                  })}
                  <td className="py-2 pr-3">
                    {m.role === "owner" || m.role === "admin" ? (
                      <span className="text-muted-foreground">Yes (owners and admins)</span>
                    ) : (
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        aria-label={`${who(m)} can build workflows`}
                        checked={roles.workflowEditors.has(m.user_id)}
                        disabled={!canEdit || busy !== null}
                        onChange={(e) =>
                          e.target.checked
                            ? setGranting(m)
                            : void run(
                                `wf:${m.user_id}`,
                                "grant_automation_editor",
                                { p_org: orgId, p_user: m.user_id, p_grant: false },
                                "They can't build workflows anymore.",
                              )
                        }
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-2 flex gap-1.5 text-xs text-muted-foreground">
        <span aria-hidden="true">⚠</span>
        <span>{WORKFLOWS_RUN_AS_ORG}</span>
      </p>
      {msg ? (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? "" : "text-destructive"}`}>
          {msg.text}
        </p>
      ) : null}
      {roles.charter && roles.charter.size === 0 ? (
        <p className="mt-2 text-xs text-muted-foreground">
          OpenCharterApp's chapter roles show for people who manage roles there.
        </p>
      ) : null}
      {granting ? (
        <ConfirmDialog
          title={`Let ${who(granting)} build workflows?`}
          confirmLabel="Let them build workflows"
          busy={busy !== null}
          onConfirm={() => {
            const m = granting;
            setGranting(null);
            void run(
              `wf:${m.user_id}`,
              "grant_automation_editor",
              { p_org: orgId, p_user: m.user_id, p_grant: true },
              "They can build workflows now.",
            );
          }}
          onCancel={() => setGranting(null)}
        >
          <p>{WORKFLOWS_RUN_AS_ORG}</p>
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
}

/**
 * H-09: named roles. Each sets a role in every app (admin, member, viewer) and extra permissions
 * each app offers. One per person; a role set for one person in one app wins over it.
 */
export function NamedRolesPanel({
  orgId,
  roles,
  canEdit,
  onChanged,
}: {
  orgId: string;
  roles: Awaited<ReturnType<typeof loadAppRoles>> | null;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState<NamedRole | "new" | null>(null);
  const [deleting, setDeleting] = useState<NamedRole | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (!roles || roles.resolved.size === 0) return null;
  const holders = (id: string) => [...roles.namedRoleOf.values()].filter((v) => v === id).length;
  async function remove(r: NamedRole) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_named_role", { p_org: orgId, p_id: r.id });
    setBusy(false);
    setDeleting(null);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${r.name} deleted.` });
    if (!error) onChanged();
  }
  return (
    <Panel
      title="Named roles"
      description="A role you name, like Treasurer: what it can do in each app, and any extra permissions. Give one to each person in the table above."
    >
      {roles.namedRoles.length === 0 && editing === null ? (
        <p className="text-sm text-muted-foreground">No named roles yet.</p>
      ) : null}
      <ul className="divide-y">
        {roles.namedRoles.map((r) =>
          editing !== null && editing !== "new" && editing.id === r.id ? null : (
            <li key={r.id} className="flex flex-wrap items-start gap-3 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.name}</p>
                <p className="text-xs text-muted-foreground">
                  {APPS.map(
                    (a) => `${APP_NAME[a]}: ${APP_ROLE_LABEL[r.app_roles[a] ?? "viewer"]}`,
                  ).join(" · ")}
                </p>
                {Object.values(r.permissions).flat().length ? (
                  <p className="text-xs text-muted-foreground">
                    Also:{" "}
                    {APPS.flatMap((a) =>
                      (r.permissions[a] ?? []).map(
                        (k) =>
                          roles.permissionTypes.find((p) => p.app === a && p.key === k)?.label ?? k,
                      ),
                    ).join(", ")}
                  </p>
                ) : null}
                <p className="text-xs text-muted-foreground">
                  {holders(r.id) === 1 ? "1 person" : `${holders(r.id)} people`}
                </p>
              </div>
              {canEdit ? (
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" onClick={() => setEditing(r)}>
                    Edit
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setDeleting(r)}>
                    Delete
                  </Button>
                </div>
              ) : null}
            </li>
          ),
        )}
      </ul>
      {editing !== null ? (
        <NamedRoleEditor
          orgId={orgId}
          role={editing === "new" ? null : editing}
          permissionTypes={roles.permissionTypes}
          onDone={(text) => {
            setEditing(null);
            if (text) {
              setMsg({ ok: true, text });
              onChanged();
            }
          }}
        />
      ) : canEdit ? (
        <Button className="mt-3" variant="outline" onClick={() => setEditing("new")}>
          New named role
        </Button>
      ) : null}
      {msg ? (
        <p role="status" className={`mt-2 text-sm ${msg.ok ? "" : "text-destructive"}`}>
          {msg.text}
        </p>
      ) : null}
      {deleting ? (
        <ConfirmDialog
          title={`Delete ${deleting.name}?`}
          confirmLabel="Delete"
          destructive
          busy={busy}
          onConfirm={() => void remove(deleting)}
          onCancel={() => setDeleting(null)}
        >
          <p>
            The {holders(deleting.id) === 1 ? "person" : "people"} who hold it keep anything set for
            them in a single app, and are view-only everywhere else until you give them a role.
          </p>
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
}

function NamedRoleEditor({
  orgId,
  role,
  permissionTypes,
  onDone,
}: {
  orgId: string;
  role: NamedRole | null;
  permissionTypes: PermissionType[];
  onDone: (message: string | null) => void;
}) {
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [appRoles, setAppRoles] = useState<NamedRole["app_roles"]>(role?.app_roles ?? {});
  const [perms, setPerms] = useState<NamedRole["permissions"]>(role?.permissions ?? {});
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("save_named_role", {
      p_org: orgId,
      p_id: role?.id ?? null,
      p_name: name,
      p_description: description,
      p_app_roles: appRoles,
      p_permissions: perms,
    });
    setBusy(false);
    if (error) return setError(error.message);
    onDone(role ? `${name.trim()} saved.` : `${name.trim()} created.`);
  }
  const prefix = role ? `nr-${role.id}` : "nr-new";
  return (
    <form className="mt-3 space-y-3 rounded-md border p-3" onSubmit={save}>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-name`}>Name</Label>
        <Input
          id={`${prefix}-name`}
          required
          maxLength={60}
          value={name}
          placeholder="Treasurer"
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor={`${prefix}-desc`}>Description (optional)</Label>
        <Input
          id={`${prefix}-desc`}
          maxLength={300}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </div>
      {APPS.map((app) => {
        const options = permissionTypes.filter((p) => p.app === app);
        const roleHere = appRoles[app] ?? "viewer";
        return (
          <fieldset key={app} className="space-y-2 rounded-md bg-muted/40 p-2">
            <legend className="sr-only">{APP_NAME[app]}</legend>
            <div className="flex items-center gap-2">
              <Label htmlFor={`${prefix}-${app}`} className="w-36 shrink-0">
                {APP_NAME[app]}
              </Label>
              <Select
                id={`${prefix}-${app}`}
                className="h-9"
                value={roleHere}
                onChange={(e) =>
                  setAppRoles((cur) => ({
                    ...cur,
                    [app]: e.target.value as "admin" | "member" | "viewer" | "none",
                  }))
                }
              >
                {(["admin", "member", "viewer", "none"] as const).map((r) => (
                  <option key={r} value={r}>
                    {APP_ROLE_LABEL[r]}
                  </option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">{APP_ROLE_HELP[roleHere]}</p>
            {options.length && roleHere !== "admin" && roleHere !== "none" ? (
              <div className="space-y-1">
                <p className="text-xs font-medium">Extra permissions</p>
                {options.map((p) => {
                  const id = `${prefix}-${app}-${p.key}`;
                  const on = (perms[app] ?? []).includes(p.key);
                  return (
                    <div key={p.key} className="flex items-start gap-2">
                      <input
                        id={id}
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        checked={on}
                        onChange={(e) =>
                          setPerms((cur) => {
                            const list = new Set(cur[app] ?? []);
                            if (e.target.checked) list.add(p.key);
                            else list.delete(p.key);
                            return { ...cur, [app]: [...list] };
                          })
                        }
                      />
                      <label htmlFor={id} className="text-sm">
                        {p.label}
                        {p.description ? (
                          <span className="block text-xs text-muted-foreground">
                            {p.description}
                          </span>
                        ) : null}
                      </label>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </fieldset>
        );
      })}
      {error ? <Alert variant="destructive">{error}</Alert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : role ? "Save role" : "Create role"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => onDone(null)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export { WORKFLOWS_RUN_AS_ORG };
