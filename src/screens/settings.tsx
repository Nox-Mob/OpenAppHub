import type { ScreenProps } from "./types";
import { useRouter } from "@tanstack/react-router";
import { useMemo, useState, type FormEvent } from "react";
import { APP_NAMES } from "@shared/apps";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { SUITE_APPS, suiteUrls } from "@shared/supabase/hosted";
import type { OrgRole } from "@shared/supabase/org";
import { HelpLink } from "@shared/ui/HelpLink";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { NoOrganization, PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  CURRENCIES,
  confirmTextFor,
  confirmationMatches,
  formatPreview,
  looksLikeEmail,
  timeZones,
  type TransferCandidate,
} from "@/lib/org-settings";
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
        <RegionalPanel orgId={org.id} canEdit={canManage(hub.role)} />
        {canManage(hub.role) ? <BillingContactPanel orgId={org.id} /> : null}
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

function RegionalPanel({ orgId, canEdit }: { orgId: string; canEdit: boolean }) {
  const supabase = getSupabaseBrowserClient();
  const current = useAsync(
    async () =>
      supabase
        ? ((await must(
            supabase.from("organizations").select("time_zone, currency").eq("id", orgId).single(),
          )) as { time_zone: string; currency: string })
        : { time_zone: "UTC", currency: "USD" },
    [orgId, supabase],
  );
  const [zone, setZone] = useState<string | null>(null);
  const [currency, setCurrency] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const z = zone ?? current.data?.time_zone ?? "UTC";
  const c = currency ?? current.data?.currency ?? "USD";
  const zones = useMemo(() => timeZones(z), [z]);
  const changed = !!current.data && (z !== current.data.time_zone || c !== current.data.currency);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const { error } = await supabase.rpc("set_organization_preferences", {
      p_org: orgId,
      p_time_zone: z,
      p_currency: c,
    });
    // Ticks "Time zone and currency" in the dashboard's setup list (hub only).
    if (!error) await supabase.rpc("hub_mark_org_setup", { p_org: orgId, p_step: "preferences" });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    if (!error) {
      setZone(null);
      setCurrency(null);
      await current.reload();
    }
  }

  const preview = formatPreview(z, c);

  return (
    <Panel
      title="Time zone and currency"
      description="Every app shows dates in this time zone and money in this currency."
    >
      {current.error ? <Alert variant="destructive">{current.error}</Alert> : null}
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="org-zone">Time zone</Label>
            <Select
              id="org-zone"
              value={z}
              disabled={!canEdit || current.loading}
              onChange={(e) => setZone(e.target.value)}
            >
              {zones.map((name) => (
                <option key={name} value={name}>
                  {name.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-currency">Currency</Label>
            <Select
              id="org-currency"
              value={c}
              disabled={!canEdit || current.loading}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.some((x) => x.code === c) ? null : <option value={c}>{c}</option>}
              {CURRENCIES.map((x) => (
                <option key={x.code} value={x.code}>
                  {x.code} · {x.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {preview ? (
          <p className="text-sm text-muted-foreground" data-testid="format-preview">
            Looks like: <span className="font-medium text-foreground tabular-nums">{preview}</span>
          </p>
        ) : null}
        {canEdit ? (
          <Button type="submit" disabled={busy || !changed}>
            {busy ? "Saving…" : "Save"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Only the owner or an admin can change these.
          </p>
        )}
      </form>
      {msg ? (
        <Alert variant={msg.ok ? "default" : "destructive"} className="mt-3">
          {msg.text}
        </Alert>
      ) : null}
    </Panel>
  );
}

function BillingContactPanel({ orgId }: { orgId: string }) {
  const supabase = getSupabaseBrowserClient();
  const current = useAsync(async () => {
    if (!supabase) return { billing_email: null, billing_name: null };
    const rows = (await must(supabase.rpc("hub_get_org_billing_contact", { p_org: orgId }))) as {
      billing_email: string | null;
      billing_name: string | null;
    }[];
    return rows[0] ?? { billing_email: null, billing_name: null };
  }, [orgId, supabase]);
  const [email, setEmail] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const e1 = email ?? current.data?.billing_email ?? "";
  const n1 = name ?? current.data?.billing_name ?? "";
  const invalid = e1.trim() !== "" && !looksLikeEmail(e1);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase || invalid) return;
    setBusy(true);
    const { error } = await supabase.rpc("hub_set_org_billing_contact", {
      p_org: orgId,
      p_email: e1.trim() || null,
      p_name: n1.trim() || null,
    });
    setBusy(false);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    if (!error) {
      setEmail(null);
      setName(null);
      await current.reload();
    }
  }

  return (
    <Panel
      id="billing-contact"
      title="Billing contact"
      description="Where invoices and receipts go. Leave empty to send them to the owner."
    >
      {current.error ? <Alert variant="destructive">{current.error}</Alert> : null}
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="billing-email">Invoice email</Label>
            <Input
              id="billing-email"
              type="email"
              autoComplete="email"
              placeholder="treasurer@example.org"
              value={e1}
              maxLength={254}
              aria-invalid={invalid || undefined}
              onChange={(e) => setEmail(e.target.value)}
            />
            {invalid ? (
              <p className="text-xs text-destructive">Enter a full email address.</p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="billing-name">Name on invoices (optional)</Label>
            <Input
              id="billing-name"
              placeholder="Riverside Community Association"
              value={n1}
              maxLength={200}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
        </div>
        <Button type="submit" disabled={busy || invalid || current.loading}>
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
      {msg ? (
        <Alert variant={msg.ok ? "default" : "destructive"} className="mt-3">
          {msg.text}
        </Alert>
      ) : null}
    </Panel>
  );
}

// Two steps, as in OpenCharterApp: pick an active member, then type their name
// (or email when they have none) to confirm. The database checks both again.
function TransferPanel({ orgId, orgName }: { orgId: string; orgName: string }) {
  const router = useRouter();
  const supabase = getSupabaseBrowserClient();
  const candidates = useAsync(
    async () =>
      supabase
        ? ((await must(
            supabase.rpc("ownership_transfer_candidates", { p_org: orgId }),
          )) as TransferCandidate[])
        : [],
    [orgId, supabase],
  );
  const [to, setTo] = useState("");
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState("");
  const person = candidates.data?.find((c) => c.user_id === to);
  const expected = person ? confirmTextFor(person) : "";
  const ok = !!person && confirmationMatches(typed, expected);

  async function transfer(e: FormEvent) {
    e.preventDefault();
    if (!supabase || !person || !ok) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("transfer_ownership", {
      p_org: orgId,
      p_new_owner: person.user_id,
      p_confirm: typed,
    });
    setBusy(false);
    if (error) return setError(error.message);
    setDone(`${expected} is now the owner of ${orgName}. You're an admin.`);
    await router.invalidate();
  }

  return (
    <Panel
      title="Transfer ownership"
      description="Only the owner can do this. The new owner must be an active member (email confirmed). You'll become an admin and can't undo it yourself."
    >
      {done ? (
        <Alert>{done}</Alert>
      ) : candidates.error ? (
        <Alert variant="destructive">{candidates.error}</Alert>
      ) : (candidates.data ?? []).length === 0 && !candidates.loading ? (
        <p className="text-sm text-muted-foreground">
          There's no other active member yet. Invite someone, and once they've confirmed their email
          they can become the owner.
        </p>
      ) : (
        <form className="space-y-3" onSubmit={transfer}>
          <div className="space-y-2">
            <Label htmlFor="new-owner">1. Choose the new owner</Label>
            <Select
              id="new-owner"
              value={to}
              onChange={(e) => {
                setTo(e.target.value);
                setTyped("");
                setError("");
              }}
            >
              <option value="">Choose a member…</option>
              {(candidates.data ?? []).map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.display_name?.trim()
                    ? `${c.display_name.trim()} (${c.email}) · ${ROLE_LABEL[c.role as OrgRole] ?? c.role}`
                    : `${c.email} · ${ROLE_LABEL[c.role as OrgRole] ?? c.role}`}
                </option>
              ))}
            </Select>
          </div>
          {person ? (
            <div className="space-y-2">
              <Label htmlFor="confirm-owner">
                2. Type <strong className="text-foreground">{expected}</strong> to confirm
              </Label>
              <Input
                id="confirm-owner"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          ) : null}
          <Button type="submit" variant="outline" disabled={!ok || busy}>
            {busy ? "Transferring…" : "Transfer ownership"}
          </Button>
        </form>
      )}
      {error ? (
        <Alert variant="destructive" className="mt-3">
          {error}
        </Alert>
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
