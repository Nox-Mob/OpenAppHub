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
import { ROLE_HELP, ROLE_LABEL, canManage } from "@/lib/roles";
import { must, useAsync } from "@/lib/use-async";

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
        actions={<HelpLink path="hub/accounts/invitations/">How invitations work</HelpLink>}
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
        {manage ? (
          <div className="space-y-6">
            <InvitePanel
              orgId={orgId}
              invite={invite}
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
                          {formatDate(i.expires_at)}
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

function InvitePanel({
  orgId,
  invite,
  onInvited,
}: {
  orgId: string;
  invite: typeof sendInvitation;
  onInvited: () => void;
}) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<(InviteResult & { to: string }) | null>(null);
  const [copied, setCopied] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setResult(null);
    setCopied(false);
    const res = await invite({ data: { orgId, email, role } });
    setBusy(false);
    if ("error" in res) return setError(res.error);
    setResult({ ...res, to: email.trim() });
    setEmail("");
    onInvited();
  }

  return (
    <Panel title="Invite someone">
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
          <Label htmlFor="invite-role">Role</Label>
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
