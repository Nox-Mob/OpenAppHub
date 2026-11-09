import type { ScreenProps } from "./types";
import { useState, type FormEvent } from "react";
import { formatDate } from "@shared/format";
import { getSupabaseBrowserClient } from "@shared/supabase/client";
import { PageHeader, Panel } from "@/components/hub/HubShell";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { must, useAsync } from "@/lib/use-async";

// Staging only (SHARED-SPEC §11): platform operators create and delete demo
// organizations. The database refuses this anywhere but staging.

type DemoOrg = { org_id: string; name: string; created_at: string; members: number };

export function DemoScreen({ hub }: ScreenProps) {
  const supabase = getSupabaseBrowserClient();
  const list = useAsync(
    async () =>
      hub.demoTools && supabase
        ? ((await must(supabase.rpc("hub_list_demo_orgs"))) as DemoOrg[])
        : [],
    [hub.demoTools, supabase],
  );
  const [name, setName] = useState("Demo Association");
  const [error, setError] = useState("");

  if (!hub.demoTools) {
    return <Alert>Demo organizations are only available to platform operators on staging.</Alert>;
  }

  async function create(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setError("");
    const { error } = await supabase.rpc("hub_create_demo_org", { p_name: name });
    if (error) return setError(error.message);
    void list.reload();
  }
  async function remove(id: string) {
    if (!supabase) return;
    const { error } = await supabase.rpc("hub_delete_demo_org", { p_org: id });
    if (error) setError(error.message);
    void list.reload();
  }

  return (
    <>
      <PageHeader
        title="Demo organizations"
        description="Staging only. You become the owner of each demo organization."
      />
      <div className="max-w-2xl space-y-6">
        <Panel title="Create a demo organization">
          <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={create}>
            <div className="flex-1 space-y-2">
              <Label htmlFor="demo-name">Name</Label>
              <Input
                id="demo-name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={!name.trim()}>
              Create
            </Button>
          </form>
          {error ? (
            <Alert variant="destructive" className="mt-3">
              {error}
            </Alert>
          ) : null}
        </Panel>
        <Panel title="Demo organizations">
          {(list.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">None yet.</p>
          ) : null}
          <ul className="divide-y">
            {(list.data ?? []).map((d) => (
              <li key={d.org_id} className="flex items-center gap-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Created {formatDate(d.created_at)} · {d.members}{" "}
                    {Number(d.members) === 1 ? "member" : "members"}
                  </p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => void remove(d.org_id)}>
                  Delete
                </Button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </>
  );
}
