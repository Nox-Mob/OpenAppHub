import type { ScreenProps } from "./types";
import { useRouter } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { openCookieSettings } from "@shared/consent";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import {
  DigestFields,
  digestIncomplete,
  loadDigest,
  saveDigest,
  type DigestPrefs,
} from "@shared/ui/DigestSettings";
import { HelpLink } from "@shared/ui/HelpLink";
import { NotificationSettings } from "@shared/ui/Notifications";
import { TwoStepSettings } from "@shared/ui/TwoStep";
import { ThemeToggle } from "@shared/ui/ThemeToggle";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { HELP } from "@/config/help";
import { deleteMyAccount } from "@/lib/members";
import { looksLikeEmail } from "@/lib/org-settings";
import { ROLE_LABEL } from "@/lib/roles";
import { must, useAsync } from "@/lib/use-async";

const MIN_PASSWORD = 8;
type Msg = { ok: boolean; text: string } | null;

function Note({ msg }: { msg: Msg }) {
  return msg ? (
    <Alert variant={msg.ok ? "default" : "destructive"} className="mt-3">
      {msg.text}
    </Alert>
  ) : null;
}

export function AccountScreen({ user, hub }: ScreenProps) {
  const router = useRouter();
  const [name, setName] = useState(user.name ?? "");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const owned = hub.orgs.filter((o) => o.role === "owner");

  async function saveName(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const display = name.trim();
    const [{ error: pErr }, { error: uErr }] = await Promise.all([
      supabase
        .from("profiles")
        .update({ display_name: display, updated_at: new Date().toISOString() })
        .eq("id", user.id),
      supabase.auth.updateUser({ data: { full_name: display } }),
    ]);
    const error = pErr ?? uErr;
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Saved." });
    if (!error) void router.invalidate();
  }

  async function removeAccount() {
    setBusy(true);
    const res = await deleteMyAccount();
    setBusy(false);
    if ("error" in res) return setDeleteError(res.error);
    await getSupabaseBrowserClient()?.auth.signOut();
    window.location.assign("/");
  }

  return (
    <>
      <PageHeader
        title="Your account"
        description={user.email ?? undefined}
        actions={<HelpLink path={HELP.account}>Account help</HelpLink>}
      />
      <div className="max-w-2xl space-y-6">
        <Panel title="Your name" description="Shown to the people in your organizations.">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={saveName}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="display-name">Name</Label>
              <Input
                id="display-name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!name.trim()}>
              Save
            </Button>
          </form>
          {msg ? (
            <Alert variant={msg.ok ? "default" : "destructive"} className="mt-3">
              {msg.text}
            </Alert>
          ) : null}
        </Panel>
        <EmailPanel email={user.email} />
        <PasswordPanel email={user.email} />
        <Panel
          id="two-step"
          title="Two-step sign-in"
          description="A code from your phone, as well as your password, every time you sign in. It works in every app."
        >
          <TwoStepSettings client={getSupabaseBrowserClient()} />
        </Panel>
        <Panel
          id="notifications"
          title="Notifications"
          description="What you're told about, in the apps (the bell at the top) and by email. These are fixed by OpenAppHub and don't depend on your organization's workflows."
        >
          <NotificationSettings client={getSupabaseBrowserClient()} />
        </Panel>
        <NotificationsPanel />
        <OrganizationsPanel hub={hub} />
        <Panel title="Appearance and cookies">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Theme</span>
            <ThemeToggle />
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm text-muted-foreground">Cookie choices</span>
            <Button variant="outline" size="sm" onClick={() => openCookieSettings()}>
              Cookie settings
            </Button>
          </div>
        </Panel>
        <SessionsPanel />
        <Panel
          title="Delete your account"
          tone="danger"
          description="Deletes your sign-in and removes you from every organization."
        >
          {owned.length > 0 ? (
            <Alert>
              You own {owned.map((o) => o.name).join(", ")}. Transfer ownership or delete{" "}
              {owned.length === 1 ? "it" : "them"} in Settings before deleting your account.
            </Alert>
          ) : (
            <Button
              variant="outline"
              className="border-destructive/50 text-destructive"
              onClick={() => setDeleting(true)}
            >
              Delete my account
            </Button>
          )}
        </Panel>
      </div>
      {deleting ? (
        <ConfirmDialog
          title="Delete your account?"
          confirmLabel="Delete my account"
          destructive
          busy={busy}
          onConfirm={() => void removeAccount()}
          onCancel={() => setDeleting(false)}
        >
          <p>You'll be signed out and removed from every organization. This can't be undone.</p>
          {deleteError ? <Alert variant="destructive">{deleteError}</Alert> : null}
        </ConfirmDialog>
      ) : null}
    </>
  );
}

function EmailPanel({ email }: { email: string | null }) {
  const [value, setValue] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const next = value.trim().toLowerCase();
  const valid = looksLikeEmail(next) && next !== (email ?? "").toLowerCase();

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !valid) return;
    setBusy(true);
    const { error } = await supabase.auth.updateUser(
      { email: next },
      { emailRedirectTo: `${window.location.origin}/auth/callback?next=/account` },
    );
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setValue("");
    setMsg({
      ok: true,
      text: `Check ${next} for a confirmation link. Your email changes once you open it${email ? ` (we may also ask you to confirm from ${email})` : ""}.`,
    });
  }

  return (
    <Panel title="Email address" description={email ? `You sign in with ${email}.` : undefined}>
      <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={onSubmit}>
        <div className="flex-1 space-y-2">
          <Label htmlFor="new-email">New email</Label>
          <Input
            id="new-email"
            type="email"
            autoComplete="email"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </div>
        <Button type="submit" disabled={busy || !valid}>
          {busy ? "Sending…" : "Change email"}
        </Button>
      </form>
      <Note msg={msg} />
    </Panel>
  );
}

function PasswordPanel({ email }: { email: string | null }) {
  // Google-only accounts have no password yet: they can set one without the current one.
  const [hasPassword, setHasPassword] = useState<boolean | null>(null);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return setHasPassword(true);
    void supabase.auth.getUser().then(({ data }) => {
      const identities = data.user?.identities;
      setHasPassword(identities ? identities.some((i) => i.provider === "email") : true);
    });
  }, []);

  const mismatch = again !== "" && again !== next;
  const ready =
    next.length >= MIN_PASSWORD && next === again && (hasPassword === false || current !== "");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !ready) return;
    setBusy(true);
    setMsg(null);
    if (hasPassword && email) {
      const { error } = await supabase.auth.signInWithPassword({ email, password: current });
      if (error) {
        setBusy(false);
        return setMsg({ ok: false, text: "Your current password isn't right." });
      }
    }
    const { error } = await supabase.auth.updateUser({ password: next });
    setBusy(false);
    if (error) return setMsg({ ok: false, text: error.message });
    setCurrent("");
    setNext("");
    setAgain("");
    setHasPassword(true);
    setMsg({ ok: true, text: "Password changed." });
  }

  return (
    <Panel
      title="Password"
      description={
        hasPassword === false
          ? "You sign in with Google. Add a password to also sign in with your email."
          : `At least ${MIN_PASSWORD} characters.`
      }
    >
      <form className="space-y-3" onSubmit={onSubmit}>
        {hasPassword !== false ? (
          <div className="space-y-2">
            <Label htmlFor="current-password">Current password</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
            />
          </div>
        ) : null}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="new-password">New password</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={MIN_PASSWORD}
              value={next}
              onChange={(e) => setNext(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password-again">New password again</Label>
            <Input
              id="new-password-again"
              type="password"
              autoComplete="new-password"
              value={again}
              aria-invalid={mismatch || undefined}
              onChange={(e) => setAgain(e.target.value)}
            />
            {mismatch ? (
              <p className="text-xs text-destructive">The passwords don't match.</p>
            ) : null}
          </div>
        </div>
        <Button type="submit" disabled={busy || !ready}>
          {busy ? "Saving…" : hasPassword === false ? "Set password" : "Change password"}
        </Button>
      </form>
      <Note msg={msg} />
    </Panel>
  );
}

type Digest = "off" | "daily" | "weekly";
type Prefs = {
  billing_emails: boolean;
  org_activity_emails: boolean;
  product_news: boolean;
  // Email the apps send (core public.email_preferences, S-16).
  reminders: boolean;
  digest: Digest;
};
type BoolPref = "billing_emails" | "org_activity_emails" | "product_news" | "reminders";
const DEFAULT_PREFS: Prefs = {
  billing_emails: true,
  org_activity_emails: true,
  product_news: false,
  reminders: true,
  digest: "weekly",
};
const PREF_ROWS: { key: BoolPref; label: string; help: string }[] = [
  {
    key: "reminders",
    label: "Reminders",
    help: "Upcoming board meetings and action items due, from the apps you use.",
  },
  {
    key: "billing_emails",
    label: "Billing",
    help: "Trial reminders, receipts and payment problems for organizations you own or administer.",
  },
  {
    key: "org_activity_emails",
    label: "Organization activity",
    help: "When someone joins, leaves or changes roles in your organizations.",
  },
  { key: "product_news", label: "Product news", help: "New features, a few times a year." },
];

function NotificationsPanel() {
  const supabase = getSupabaseBrowserClient();
  const saved = useAsync(async () => {
    if (!supabase) return DEFAULT_PREFS;
    const [hubRows, emailRows] = await Promise.all([
      must(supabase.rpc("hub_get_my_preferences")) as Promise<Partial<Prefs>[]>,
      // Missing until core 0005 is applied: keep the defaults.
      supabase
        .rpc("get_email_preferences")
        .then((r) => (r.error ? [] : ((r.data ?? []) as Partial<Prefs>[]))),
    ]);
    return { ...DEFAULT_PREFS, ...hubRows[0], ...emailRows[0] } as Prefs;
  }, [supabase]);
  const [draft, setDraft] = useState<Prefs | null>(null);
  const [digest, setDigest] = useState<DigestPrefs | null>(null);
  const [digestDirty, setDigestDirty] = useState(false);
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const prefs = draft ?? saved.data ?? DEFAULT_PREFS;
  useEffect(() => {
    if (!supabase || !saved.data) return;
    let live = true;
    void loadDigest(supabase, saved.data.digest).then((d) => {
      if (live) setDigest(d);
    });
    return () => {
      live = false;
    };
  }, [supabase, saved.data]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    const first = await supabase.rpc("hub_set_my_preferences", {
      p_billing: prefs.billing_emails,
      p_org_activity: prefs.org_activity_emails,
      p_product_news: prefs.product_news,
    });
    const error =
      first.error ??
      (
        await supabase.rpc("set_email_preferences", {
          p_reminders: prefs.reminders,
          p_digest: digest?.digest ?? prefs.digest,
        })
      ).error;
    const err = error ? error.message : digest ? await saveDigest(supabase, digest) : null;
    setBusy(false);
    setMsg(err ? { ok: false, text: err } : { ok: true, text: "Saved." });
    if (!err) {
      setDraft(null);
      setDigestDirty(false);
      await saved.reload();
    }
  }

  return (
    <Panel
      id="email"
      title="Emails"
      description="Kinds of email as a whole. Turning one off here stops those emails, whatever is chosen for each notification above."
    >
      {saved.error ? <Alert variant="destructive">{saved.error}</Alert> : null}
      <form className="space-y-3" onSubmit={onSubmit}>
        <ul className="space-y-3">
          <li className="flex items-start gap-3">
            <input
              id="pref-account"
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              checked
              disabled
            />
            <label htmlFor="pref-account" className="text-sm">
              <span className="font-medium">Account, security and legal notices</span>{" "}
              <span className="text-muted-foreground">(always on)</span>
              <span className="block text-muted-foreground">
                Sign-in and password changes, invitations, and changes to the Terms or Privacy
                Policy.
              </span>
            </label>
          </li>
          {PREF_ROWS.map((row) => (
            <li key={row.key} className="flex items-start gap-3">
              <input
                id={`pref-${row.key}`}
                type="checkbox"
                className="mt-1 size-4 accent-primary"
                checked={prefs[row.key]}
                disabled={saved.loading}
                onChange={(e) => setDraft({ ...prefs, [row.key]: e.target.checked })}
              />
              <label htmlFor={`pref-${row.key}`} className="text-sm">
                <span className="font-medium">{row.label}</span>
                <span className="block text-muted-foreground">{row.help}</span>
              </label>
            </li>
          ))}
          <li>
            <DigestFields
              value={digest}
              idPrefix="pref-digest"
              onChange={(d) => {
                setDigest(d);
                setDigestDirty(true);
              }}
            />
          </li>
        </ul>
        <Button
          type="submit"
          disabled={busy || (!draft && !digestDirty) || digestIncomplete(digest)}
        >
          {busy ? "Saving…" : "Save"}
        </Button>
      </form>
      <Note msg={msg} />
    </Panel>
  );
}

function SessionsPanel() {
  const [busy, setBusy] = useState(false);
  async function signOutEverywhere() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusy(true);
    await supabase.auth.signOut({ scope: "global" });
    window.location.assign("/login");
  }
  return (
    <Panel
      title="Signed-in devices"
      description="Signs you out of OpenAppHub and every app, on every device, including this one."
    >
      <Button variant="outline" disabled={busy} onClick={() => void signOutEverywhere()}>
        {busy ? "Signing out…" : "Sign out everywhere"}
      </Button>
    </Panel>
  );
}

/** Your organizations, and which one opens first (H-03). */
function OrganizationsPanel({ hub }: { hub: ScreenProps["hub"] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string | null>(hub.defaultOrgId);
  const [msg, setMsg] = useState<Msg>(null);
  async function choose(id: string | null) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const prev = chosen;
    setChosen(id);
    const { error } = await supabase.rpc("hub_set_default_org", { p_org: id });
    if (error) {
      setChosen(prev);
      setMsg({ ok: false, text: error.message });
      return;
    }
    setMsg({ ok: true, text: "Saved." });
    await router.invalidate();
  }
  return (
    <Panel
      id="organizations"
      title="Your organizations"
      description={
        hub.orgs.length > 1
          ? "Choose the one that opens first when you sign in. Switching organizations at the top still works as before."
          : undefined
      }
    >
      {hub.orgs.length === 0 ? (
        <p className="text-sm text-muted-foreground">You're not in any organization yet.</p>
      ) : (
        <ul className="divide-y text-sm">
          {hub.orgs.map((o) => (
            <li key={o.id} className="flex items-center justify-between gap-3 py-2">
              {hub.orgs.length > 1 ? (
                <label className="flex min-w-0 items-center gap-2">
                  <input
                    type="radio"
                    name="default-org"
                    className="size-4 accent-primary"
                    checked={chosen === o.id}
                    onChange={() => void choose(o.id)}
                  />
                  <span className="truncate font-medium">{o.name}</span>
                  {chosen === o.id ? (
                    <span className="text-xs text-muted-foreground">(opens first)</span>
                  ) : null}
                </label>
              ) : (
                <span className="font-medium">{o.name}</span>
              )}
              <span className="text-muted-foreground">{ROLE_LABEL[o.role]}</span>
            </li>
          ))}
        </ul>
      )}
      {hub.orgs.length > 1 && chosen ? (
        <button
          type="button"
          className="mt-2 text-xs font-medium text-primary hover:underline"
          onClick={() => void choose(null)}
        >
          No default (the first by name)
        </button>
      ) : null}
      <Note msg={msg} />
    </Panel>
  );
}
