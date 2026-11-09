import type { ScreenProps } from "./types";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { suiteUrls } from "@shared/supabase/hosted";
import { setCurrentOrg } from "@shared/supabase/org";
import { HelpLink } from "@shared/ui/HelpLink";
import { HELP } from "@/config/help";
import { PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { APPS } from "@/config/apps";
import type { sendInvitation } from "@/lib/members";
import {
  CURRENCIES,
  formatPreview,
  guessCurrency,
  guessTimeZone,
  timeZones,
} from "@/lib/org-settings";
import { canManage } from "@/lib/roles";
import { InvitePanel } from "./members";

// Guided setup after sign-up (and from the dashboard's "Get set up" list):
// name the organization, confirm its time zone and currency, invite people,
// then open the apps. Every step after the first can be skipped.

export const WELCOME_STEPS = ["organization", "region", "team", "apps"] as const;
export type WelcomeStep = (typeof WELCOME_STEPS)[number];
const STEP_LABEL: Record<WelcomeStep, string> = {
  organization: "Your organization",
  region: "Time zone and currency",
  team: "Invite your team",
  apps: "Open your apps",
};

export function WelcomeScreen({
  user,
  hub,
  step: requested,
  invite,
}: ScreenProps & { step: WelcomeStep; invite?: typeof sendInvitation }) {
  const navigate = useNavigate();
  const org = hub.orgs.find((o) => o.id === hub.currentOrgId);
  // No organization yet: always start by naming one. People who joined
  // someone else's organization (not owner or admin) only see the apps.
  const step: WelcomeStep = !org
    ? "organization"
    : !canManage(hub.role)
      ? "apps"
      : requested === "organization"
        ? "region"
        : requested;
  const go = (s: WelcomeStep | "done") =>
    void navigate(s === "done" ? { to: "/" } : { to: "/welcome", search: { step: s } });
  const first = user.name?.split(" ")[0];

  return (
    <>
      <PageHeader
        actions={<HelpLink path={HELP.gettingStarted}>Getting started guide</HelpLink>}
        title={first ? `Welcome to OpenAppHub, ${first}` : "Welcome to OpenAppHub"}
        description={
          org && !canManage(hub.role)
            ? `You're a member of ${org.name}. Here's where to find your apps.`
            : "A few quick steps to get your organization ready. You can change all of this later in Settings."
        }
      />
      <div className="max-w-2xl space-y-6">
        {canManage(hub.role) || !org ? <Stepper current={step} /> : null}
        {step === "organization" ? <OrganizationStep onDone={() => go("region")} /> : null}
        {step === "region" && org ? (
          <RegionStep orgId={org.id} orgName={org.name} onDone={() => go("team")} />
        ) : null}
        {step === "team" && org ? (
          <TeamStep orgId={org.id} invite={invite} onDone={() => go("apps")} />
        ) : null}
        {step === "apps" ? <AppsStep onDone={() => go("done")} /> : null}
      </div>
    </>
  );
}

function Stepper({ current }: { current: WelcomeStep }) {
  const at = WELCOME_STEPS.indexOf(current);
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Setup steps">
      {WELCOME_STEPS.map((s, i) => (
        <li key={s} aria-current={i === at ? "step" : undefined} className="space-y-1.5">
          <span
            className={`block h-1.5 rounded-full ${i <= at ? "bg-primary" : "bg-muted"}`}
            aria-hidden
          />
          <span
            className={`block text-xs ${i === at ? "font-semibold text-foreground" : "text-muted-foreground"}`}
          >
            <span className="sr-only">
              Step {i + 1} of {WELCOME_STEPS.length}
              {i < at ? ", done" : ""}:{" "}
            </span>
            {STEP_LABEL[s]}
          </span>
        </li>
      ))}
    </ol>
  );
}

function OrganizationStep({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { data, error } = await supabase.rpc("create_organization", { p_name: name });
    setBusy(false);
    if (error) return setError(error.message);
    setCurrentOrg(data as string);
    await router.invalidate();
    onDone();
  }

  return (
    <Panel
      title="Name your organization"
      description="Your association, board or nonprofit. Every app shares it, and you'll be its owner."
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="space-y-2">
          <Label htmlFor="org-name">Organization name</Label>
          <Input
            id="org-name"
            required
            maxLength={120}
            autoComplete="organization"
            placeholder="Riverside Community Association"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <Button type="submit" disabled={busy || !name.trim()}>
          {busy ? "Creating…" : "Create and continue"}
        </Button>
      </form>
      <p className="mt-4 text-sm text-muted-foreground">
        Joining someone else's organization instead? Open the invitation link they emailed you.
      </p>
    </Panel>
  );
}

function RegionStep({
  orgId,
  orgName,
  onDone,
}: {
  orgId: string;
  orgName: string;
  onDone: () => void;
}) {
  // Guess from the browser after hydration (the server can't know).
  const [zone, setZone] = useState("UTC");
  const [currency, setCurrency] = useState("USD");
  useEffect(() => {
    setZone(guessTimeZone());
    setCurrency(guessCurrency(typeof navigator === "undefined" ? undefined : navigator.language));
  }, []);
  const zones = useMemo(() => timeZones(zone), [zone]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    setError("");
    const { error } = await supabase.rpc("set_organization_preferences", {
      p_org: orgId,
      p_time_zone: zone,
      p_currency: currency,
    });
    if (!error) await supabase.rpc("hub_mark_org_setup", { p_org: orgId, p_step: "preferences" });
    setBusy(false);
    if (error) return setError(error.message);
    onDone();
  }

  const preview = formatPreview(zone, currency);

  return (
    <Panel
      title="Time zone and currency"
      description={`Every app shows ${orgName}'s dates in this time zone and its money in this currency. We've guessed from your browser.`}
    >
      <form className="space-y-4" onSubmit={onSubmit}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="welcome-zone">Time zone</Label>
            <Select id="welcome-zone" value={zone} onChange={(e) => setZone(e.target.value)}>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z.replace(/_/g, " ")}
                </option>
              ))}
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="welcome-currency">Currency</Label>
            <Select
              id="welcome-currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        {preview ? (
          <p className="text-sm text-muted-foreground" data-testid="welcome-preview">
            Looks like: <span className="font-medium text-foreground tabular-nums">{preview}</span>
          </p>
        ) : null}
        {error ? <Alert variant="destructive">{error}</Alert> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={busy}>
            {busy ? "Saving…" : "Save and continue"}
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function TeamStep({
  orgId,
  invite,
  onDone,
}: {
  orgId: string;
  invite?: typeof sendInvitation;
  onDone: () => void;
}) {
  const [sent, setSent] = useState(0);
  return (
    <>
      <InvitePanel
        orgId={orgId}
        invite={invite}
        onInvited={() => setSent((n) => n + 1)}
        title="Invite the people who run it with you"
        description="Board members, staff or volunteers. Invite as many as you like, one at a time. Dues-paying members of an association are added in OpenCharterApp, not here."
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onDone}>{sent > 0 ? "Continue" : "Skip for now"}</Button>
        <span className="text-sm text-muted-foreground">
          {sent > 0
            ? `${sent} ${sent === 1 ? "invitation" : "invitations"} sent.`
            : "You can invite people any time from Members."}
        </span>
      </div>
    </>
  );
}

function AppsStep({ onDone }: { onDone: () => void }) {
  const urls = suiteUrls();
  return (
    <>
      <Panel
        title="Open your apps"
        description="Your account and organization work in every app; you won't need to sign in again."
      >
        <ul className="space-y-3">
          {APPS.map((app) => {
            const url = urls[app.id];
            return (
              <li
                key={app.id}
                data-app={app.id}
                className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md bg-app-accent text-sm font-bold text-app-accent-foreground">
                    {app.short[0]}
                  </span>
                  <div>
                    <p className="font-semibold">{app.name}</p>
                    <p className="text-sm text-muted-foreground">{app.tagline}</p>
                  </div>
                </div>
                {url ? (
                  <Button asChild variant="outline" size="sm" className="self-start sm:self-center">
                    <a href={url}>Open {app.short}</a>
                  </Button>
                ) : (
                  <span className="text-xs text-muted-foreground">Coming soon</span>
                )}
              </li>
            );
          })}
        </ul>
      </Panel>
      <Button onClick={onDone}>Go to your dashboard</Button>
    </>
  );
}
