import type { ScreenProps } from "./types";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { APP_NAMES } from "@shared/apps";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { SUITE_APPS, suiteUrls } from "@shared/supabase/hosted";
import { HelpLink } from "@shared/ui/HelpLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NoOrganization, PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ROLE_LABEL, canManage } from "@/lib/roles";
import { must, useAsync } from "@/lib/use-async";

export function SettingsScreen({ hub }: ScreenProps) {
  const org = hub.orgs.find((o) => o.id === hub.currentOrgId);
  if (!org) return <NoOrganization />;
  const isOwner = hub.role === "owner";
  return (
    <>
      <PageHeader
        title="Organization settings"
        description={`${org.name} · your role: ${ROLE_LABEL[org.role]}`}
        actions={
          <HelpLink path="hub/accounts/organizations-and-roles/">Roles and ownership</HelpLink>
        }
      />
      <div className="max-w-2xl space-y-6">
        <RenamePanel orgId={org.id} name={org.name} canEdit={canManage(hub.role)} />
        {isOwner ? <TransferPanel orgId={org.id} orgName={org.name} /> : null}
        {isOwner ? <DeletePanel orgId={org.id} orgName={org.name} /> : null}
        {!isOwner ? (
          <Panel
            title="Ownership"
            description="Only the owner can transfer ownership or delete the organization."
          >
            <p className="text-sm text-muted-foreground">
              To leave this organization, use Leave on the Members page.
            </p>
          </Panel>
        ) : null}
      </div>
    </>
  );
}

function RenamePanel({ orgId, name, canEdit }: { orgId: string; name: string; canEdit: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState(name);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("rename_organization", { p_org: orgId, p_name: value });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    if (!error) void router.invalidate();
  }
  return (
    <Panel title="Name" description="Shown in every app.">
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
        <div className="flex-1 space-y-2">
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            value={value}
            maxLength={120}
            disabled={!canEdit}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        {canEdit ? (
          <Button type="submit" disabled={busy || !value.trim() || value.trim() === name}>
            {busy ? "Saving…" : "Save"}
          </Button>
        ) : null}
      </form>
      {msg ? (
        <Alert variant={msg.ok ? "default" : "destructive"} className="mt-3">
          {msg.text}
        </Alert>
      ) : null}
    </Panel>
  );
}

type Candidate = { user_id: string; display_name: string | null; email: string; role: string };

function TransferPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const candidates = useAsync(
    async () =>
      supabase
        ? ((await must(
            supabase.rpc("ownership_transfer_candidates", { p_org: orgId }),
          )) as Candidate[])
        : [],
    [orgId, supabase],
  );
  const [to, setTo] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const person = candidates.data?.find((c) => c.user_id === to);

  async function transfer() {
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("transfer_ownership", { p_org: orgId, p_new_owner: to });
    setBusy(false);
    setConfirming(false);
    if (error) return setError(error.message);
    await router.invalidate();
  }

  return (
    <Panel
      title="Transfer ownership"
      description="The new owner must already be a member. You'll become an admin."
    >
      {(candidates.data ?? []).length === 0 && !candidates.loading ? (
        <p className="text-sm text-muted-foreground">
          Invite someone first: there's nobody else in the organization yet.
        </p>
      ) : (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-2">
            <Label htmlFor="new-owner">New owner</Label>
            <Select id="new-owner" value={to} onChange={(e) => setTo(e.target.value)}>
              <option value="">Choose a member…</option>
              {(candidates.data ?? []).map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {(c.display_name || c.email) + ` (${c.email})`}
                </option>
              ))}
            </Select>
          </div>
          <Button variant="outline" disabled={!to} onClick={() => setConfirming(true)}>
            Transfer ownership
          </Button>
        </div>
      )}
      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
      ) : null}
      {confirming && person ? (
        <ConfirmDialog
          title={`Make ${person.display_name || person.email} the owner?`}
          confirmLabel="Transfer ownership"
          busy={busy}
          onConfirm={() => void transfer()}
          onCancel={() => setConfirming(false)}
        >
          <p>
            {person.display_name || person.email} becomes the owner of {orgName}. You become an
            admin and can't undo this yourself.
          </p>
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
}

function DeletePanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const urls = suiteUrls();
  const apps = SUITE_APPS.filter((a) => urls[a]).map((a) => APP_NAMES[a]);

  async function remove() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("delete_organization", {
      p_org: orgId,
      p_confirm_name: typed,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setOpen(false);
    await router.invalidate();
    await router.navigate({ to: "/" });
  }

  return (
    <Panel
      title="Delete organization"
      tone="danger"
      description="Permanently deletes the organization and everything it holds."
    >
      <Button
        variant="outline"
        className="border-destructive/50 text-destructive"
        onClick={() => setOpen(true)}
      >
        Delete organization
      </Button>
      {open ? (
        <ConfirmDialog
          title={`Delete ${orgName}?`}
          confirmLabel="Delete forever"
          destructive
          busy={busy}
          confirmDisabled={typed !== orgName}
          onConfirm={() => void remove()}
          onCancel={() => setOpen(false)}
        >
          <p>This deletes the organization and all of its data in every app. It can't be undone.</p>
          <ul className="list-disc space-y-0.5 pl-5">
            <li>OpenAppHub: members, invitations and settings</li>
            {apps.map((a) => (
              <li key={a}>{a}: everything this organization has there</li>
            ))}
          </ul>
          <p>Export anything you need from each app first.</p>
          <div className="space-y-2 pt-1">
            <Label htmlFor="confirm-name" className="text-foreground">
              Type <strong>{orgName}</strong> to confirm
            </Label>
            <Input
              id="confirm-name"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
          {error ? <Alert variant="destructive">{error}</Alert> : null}
        </ConfirmDialog>
      ) : null}
    </Panel>
  );
}
