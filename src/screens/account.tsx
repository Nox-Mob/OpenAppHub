import type { ScreenProps } from "./types";
import { useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { openCookieSettings } from "@shared/consent";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { ThemeToggle } from "@shared/ui/ThemeToggle";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { deleteMyAccount } from "@/lib/members";

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
      <PageHeader title="Your account" description={user.email ?? undefined} />
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
