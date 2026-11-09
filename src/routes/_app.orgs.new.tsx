import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { setCurrentOrg } from "@shared/supabase/org";
import { PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/_app/orgs/new")({
  head: () => ({ meta: [{ title: "Create organization · OpenAppHub" }] }),
  component: NewOrgPage,
});

function NewOrgPage() {
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
    await router.navigate({ to: "/welcome", search: { step: "region" } });
  }

  return (
    <>
      <PageHeader
        title="Create organization"
        description="Your association, board or nonprofit. You'll be its owner."
      />
      <div className="max-w-lg">
        <Panel title="Organization name" description="You can change it later in Settings.">
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="org-name">Name</Label>
              <Input
                id="org-name"
                required
                maxLength={120}
                autoComplete="organization"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            {error ? <Alert variant="destructive">{error}</Alert> : null}
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? "Creating…" : "Create organization"}
            </Button>
          </form>
        </Panel>
      </div>
    </>
  );
}
